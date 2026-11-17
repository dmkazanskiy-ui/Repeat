// Синхронизация между устройствами через свой сервер (deploy/sync/server.py).
//
// Данные остаются локальными (IndexedDB), сервер — общая копия. Единица
// синхронизации — запись: тренировка, замер, программа и т. д. (коллекция + id).
// «Тень» — то, что было на сервере после прошлого обмена; по разнице с ней
// видно, что изменилось на этом устройстве, включая удаления. Конфликт
// решает время правки: побеждает более поздняя (last write wins).
//
// Работает только внутри Telegram: вход — подпись initData, без паролей.
// Фото прогресса не синхронизируются (тяжёлые; остаются на устройстве).

import { useSyncExternalStore } from "react";
import { del, get, keys, set } from "./db";
import type { BackupData } from "./backup";
import { isConsentValid } from "./consent";

type Collection =
  | "sessions"
  | "customExercises"
  | "cardioKinds"
  | "mobilityKinds"
  | "bodyEntries"
  | "programs"
  | "recovery"
  | "settings";

interface Rec {
  c: Collection;
  id: string;
  json: string;
}

interface Change {
  c: Collection;
  id: string;
  ts: number;
  data: unknown;
}

const SHADOW_KEY = "sync_shadow";
const REV_KEY = "sync_rev";
const EPOCH_KEY = "sync_epoch";
const RESET_NOTICE = "repeat_account_reset";
const ENDPOINT = "/api/sync";

const k = (c: string, id: string) => `${c}\u0000${id}`;

// ───────────── Данные ↔ записи ─────────────

/** Разложить данные приложения на записи. */
export function toRecords(d: BackupData): Map<string, Rec> {
  const out = new Map<string, Rec>();
  const put = (c: Collection, id: string, value: unknown) =>
    out.set(k(c, id), { c, id, json: JSON.stringify(value) });
  for (const s of d.sessions) put("sessions", s.id, s);
  for (const e of d.customExercises) put("customExercises", e.id, e);
  for (const a of d.cardioKinds) put("cardioKinds", a.name, a);
  for (const a of d.mobilityKinds) put("mobilityKinds", a.name, a);
  for (const b of d.bodyEntries) put("bodyEntries", b.id, b);
  for (const p of d.programs) put("programs", p.id, p);
  for (const r of d.recovery) put("recovery", r.id, r);
  if (d.focusGoal != null) put("settings", "focusGoal", d.focusGoal);
  if (d.consent != null) put("settings", "consent", d.consent);
  return out;
}

/** Собрать данные приложения из записей (порядок — как был локально, новые в конце). */
export function fromRecords(recs: Map<string, Rec>, order: BackupData): BackupData {
  const pick = <T>(c: Collection, prev: T[], idOf: (x: T) => string): T[] => {
    const seen = new Set<string>();
    const list: T[] = [];
    for (const x of prev) {
      const r = recs.get(k(c, idOf(x)));
      if (r) {
        list.push(JSON.parse(r.json) as T);
        seen.add(r.id);
      }
    }
    for (const r of recs.values()) {
      if (r.c === c && !seen.has(r.id)) list.push(JSON.parse(r.json) as T);
    }
    return list;
  };
  const goal = recs.get(k("settings", "focusGoal"));
  const consent = recs.get(k("settings", "consent"));
  return {
    sessions: pick("sessions", order.sessions, (s) => s.id),
    customExercises: pick("customExercises", order.customExercises, (e) => e.id),
    cardioKinds: pick("cardioKinds", order.cardioKinds, (a) => a.name),
    mobilityKinds: pick("mobilityKinds", order.mobilityKinds, (a) => a.name),
    bodyEntries: pick("bodyEntries", order.bodyEntries, (b) => b.id),
    programs: pick("programs", order.programs, (p) => p.id),
    recovery: pick("recovery", order.recovery, (r) => r.id),
    focusGoal: goal ? (JSON.parse(goal.json) as BackupData["focusGoal"]) : null,
    consent: consent ? (JSON.parse(consent.json) as BackupData["consent"]) : null,
  };
}

/** Что изменилось относительно тени: новые/правленые и удалённые записи. */
export function diffAgainst(
  cur: Map<string, Rec>,
  shadow: Record<string, string>,
  ts: number,
): Change[] {
  const changes: Change[] = [];
  for (const [key, r] of cur) {
    if (shadow[key] !== r.json) changes.push({ c: r.c, id: r.id, ts, data: JSON.parse(r.json) });
  }
  for (const key of Object.keys(shadow)) {
    if (!cur.has(key)) {
      const [c, id] = key.split("\u0000");
      changes.push({ c: c as Collection, id, ts, data: null });
    }
  }
  return changes;
}

/**
 * Применить ответ сервера к актуальным локальным данным. Запись, которую
 * успели поправить, пока шёл запрос, не трогаем и тень по ней не обновляем —
 * она уйдёт на сервер в следующий раз.
 */
export function applyRemote(
  sent: Map<string, Rec>,
  latest: Map<string, Rec>,
  shadow: Record<string, string>,
  remote: Change[],
): { recs: Map<string, Rec>; shadow: Record<string, string>; changed: boolean } {
  const recs = new Map(latest);
  const nextShadow = { ...shadow };
  let changed = false;
  for (const ch of remote) {
    const key = k(ch.c, ch.id);
    const editedInFlight = (sent.get(key)?.json ?? null) !== (latest.get(key)?.json ?? null);
    if (editedInFlight) continue;
    if (ch.data == null) {
      delete nextShadow[key];
      if (recs.delete(key)) changed = true;
    } else {
      const json = JSON.stringify(ch.data);
      nextShadow[key] = json;
      if (recs.get(key)?.json !== json) {
        recs.set(key, { c: ch.c, id: ch.id, json });
        changed = true;
      }
    }
  }
  return { recs, shadow: nextShadow, changed };
}

// ───────────── Статус для интерфейса ─────────────

export type SyncState =
  | { kind: "off" }
  | { kind: "syncing"; last: number | null }
  | { kind: "ok"; last: number }
  | { kind: "error"; last: number | null; message: string };

let state: SyncState = { kind: "off" };
const listeners = new Set<() => void>();
function setState(next: SyncState) {
  state = next;
  listeners.forEach((l) => l());
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

function initData(): string {
  return window.Telegram?.WebApp?.initData ?? "";
}

export function syncAvailable(): boolean {
  return Boolean(initData());
}

// ───────────── Обмен ─────────────

export type SyncResult = { kind: "data"; data: BackupData } | { kind: "reset" } | null;

let running: Promise<SyncResult> | null = null;
let again = false;
/** Выключено на время удаления аккаунта — чтобы обмен не залил данные обратно. */
let disabled = false;

/**
 * Один обмен с сервером. `getLocal` — актуальные данные приложения (читается
 * и до, и после запроса). Возвращает новые данные, если с сервера пришли
 * изменения, иначе null. Параллельные вызовы склеиваются.
 */
export function runSync(getLocal: () => BackupData): Promise<SyncResult> {
  if (!syncAvailable() || disabled) return Promise.resolve(null);
  if (running) {
    again = true;
    return running;
  }
  // Без согласия на обработку данных на сервер ничего не уходит.
  if (!isConsentValid(getLocal().consent)) return Promise.resolve(null);
  running = (async () => {
    let result: SyncResult = null;
    try {
      do {
        again = false;
        const r = await exchange(getLocal);
        if (r) result = r;
        if (r?.kind === "reset") break;
      } while (again && !disabled);
    } finally {
      running = null;
    }
    return result;
  })();
  return running;
}

async function exchange(getLocal: () => BackupData): Promise<SyncResult> {
  const last = state.kind === "ok" ? state.last : state.kind === "off" ? null : state.last;
  setState({ kind: "syncing", last });
  try {
    const shadow = (await get<Record<string, string>>(SHADOW_KEY)) ?? {};
    const since = (await get<number>(REV_KEY)) ?? 0;
    const epoch = (await get<string>(EPOCH_KEY)) ?? null;
    const sent = toRecords(getLocal());
    const changes = diffAgainst(sent, shadow, Date.now());

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `tma ${initData()}` },
      body: JSON.stringify({ since, epoch, changes }),
    });
    if (!res.ok) {
      const code = res.status;
      throw new Error(code === 401 ? "auth" : code === 413 ? "quota" : code === 429 ? "rate" : `http ${code}`);
    }
    const body = (await res.json()) as
      | { reset: true; epoch: string | null }
      | { reset?: undefined; epoch: string; rev: number; changes: Change[] };
    if (body.reset) {
      // Аккаунт удалили на другом устройстве — стираем и здесь.
      await wipeLocal();
      return { kind: "reset" };
    }
    if (disabled) return null;

    const local = getLocal();
    const applied = applyRemote(sent, toRecords(local), shadow, body.changes);
    await set(SHADOW_KEY, applied.shadow);
    await set(REV_KEY, body.rev);
    await set(EPOCH_KEY, body.epoch);
    setState({ kind: "ok", last: Date.now() });
    return applied.changed ? { kind: "data", data: fromRecords(applied.recs, local) } : null;
  } catch (e) {
    setState({ kind: "error", last, message: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

// ───────────── Удаление аккаунта ─────────────

/** Стереть все данные приложения на этом устройстве (IndexedDB целиком). */
async function wipeLocal(): Promise<void> {
  for (const key of await keys()) await del(key);
  try {
    localStorage.setItem(RESET_NOTICE, "1");
  } catch {
    /* приватный режим — не страшно */
  }
}

/** Показать ли после перезагрузки «аккаунт удалён» (читается один раз). */
export function takeResetNotice(): boolean {
  try {
    const v = localStorage.getItem(RESET_NOTICE);
    localStorage.removeItem(RESET_NOTICE);
    return v === "1";
  } catch {
    return false;
  }
}

/**
 * Удалить аккаунт: данные и копии на сервере, затем всё на этом устройстве.
 * Другие устройства сотрут у себя данные при следующем обмене (новый epoch).
 * Вне Telegram сервера нет — стираем только локальное.
 */
export async function deleteAccount(): Promise<void> {
  disabled = true;
  try {
    await running?.catch(() => null);
    if (syncAvailable()) {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { Authorization: `tma ${initData()}` },
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
    }
    await wipeLocal();
  } catch (e) {
    disabled = false;
    throw e;
  }
}
