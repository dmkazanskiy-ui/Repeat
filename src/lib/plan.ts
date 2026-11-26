// План по датам: что на сегодня, закрыт ли план тренировкой, итоги недели.
// Статус карточки хранится (он уходит в синк и выгрузку), а здесь — сверка:
// связанная тренировка удалена → карточка снова «по плану», тренировка
// сделана → «выполнено».
import { L } from "./i18n";
import { sameActivity } from "./aiFormat";
import { RECOVERY_ICONS, RECOVERY_LABELS } from "./recovery/catalog";
import { CARDIO_ICONS, CARDIO_LABELS, MOBILITY_ICONS, MOBILITY_LABELS, sessionDurationSec } from "./types";
import type { IconKey } from "./icons";
import type { CardioKind, Plan, PlannedSession, PlanSlot, Session } from "./types";

export const SLOT_ORDER: PlanSlot[] = ["morning", "day", "evening"];

export const SLOT_LABELS: Record<PlanSlot, string> = {
  get morning() { return L("Утро", "Morning"); },
  get day() { return L("День", "Day"); },
  get evening() { return L("Вечер", "Evening"); },
};

/** Активные (не в архиве) карточки дня по порядку слотов и времени. */
export function plannedOn(planned: PlannedSession[], plans: Plan[], date: string): PlannedSession[] {
  const live = new Set(plans.filter((p) => !p.archivedAt).map((p) => p.id));
  return planned
    .filter((p) => p.date === date && live.has(p.planId))
    .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || (a.time ?? "").localeCompare(b.time ?? "") || a.id.localeCompare(b.id));
}

/** Тренировка засчитывается плану: завершена или в ней уже есть факт. */
export function sessionCounts(s: Session): boolean {
  if (s.endedAt) return true;
  if (s.kind === "strength") return s.exercises.some((e) => e.sets.some((x) => x.done));
  if (s.kind === "cardio") return Boolean(s.cardio?.durationSec || s.cardio?.distanceM);
  if (s.kind === "recovery") return Boolean(s.recovery?.durationMin);
  return false;
}

/**
 * Сверить карточки с тренировками. Возвращает новый список или тот же, если
 * менять нечего (чтобы не гонять лишний синк).
 */
export function reconcilePlanned(planned: PlannedSession[], sessions: Session[], now = new Date()): PlannedSession[] {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  // Тренировка начата из карточки, а связь в карточке не записана (другое устройство).
  const claimed = new Map<string, string>();
  for (const s of sessions) if (s.plannedSessionId) claimed.set(s.plannedSessionId, s.id);
  let changed = false;
  const next = planned.map((p) => {
    let linked = p.linkedSessionId ?? null;
    if (!linked && claimed.has(p.id) && p.status === "planned") linked = claimed.get(p.id)!;
    const s = linked ? byId.get(linked) : undefined;
    let status = p.status;
    if (linked && !s) {
      // Связанную тренировку удалили — карточка снова ждёт.
      linked = null;
      if (status === "done" || status === "replaced") status = "planned";
    } else if (s && status === "planned" && sessionCounts(s)) {
      status = sameActivity(p, s) ? "done" : "replaced";
    } else if (s && (status === "done" || status === "replaced") && !sessionCounts(s)) {
      status = "planned";
    }
    if (linked === (p.linkedSessionId ?? null) && status === p.status) return p;
    changed = true;
    return { ...p, linkedSessionId: linked, status, updatedAt: now.toISOString() };
  });
  // Сделал вручную то же, что в плане (бег вместо карточки «Бег с клубом»), —
  // засчитываем сами, без лишних кнопок.
  const taken = new Set(next.map((p) => p.linkedSessionId).filter(Boolean) as string[]);
  const auto = next.map((p) => {
    if (p.status !== "planned" || p.linkedSessionId) return p;
    const s = sessions.find((x) => x.date === p.date && !taken.has(x.id) && !x.plannedSessionId && sameActivity(p, x) && sessionCounts(x));
    if (!s) return p;
    taken.add(s.id);
    changed = true;
    return { ...p, linkedSessionId: s.id, status: "done" as const, updatedAt: now.toISOString() };
  });
  return changed ? auto : planned;
}

/** Тренировки дня, которые можно засчитать вместо карточки (ещё ни к чему не привязаны). */
export function creditCandidates(p: PlannedSession, sessions: Session[], planned: PlannedSession[]): Session[] {
  const taken = new Set(planned.map((x) => x.linkedSessionId).filter(Boolean) as string[]);
  return sessions.filter((s) => s.date === p.date && !taken.has(s.id) && !s.plannedSessionId && sessionCounts(s));
}

const fmtRange = (a: number | null | undefined, b: number | null | undefined) =>
  a != null && b != null && b !== a ? `${a}–${b}` : a != null ? `${a}` : b != null ? `${b}` : "";

/** Подпись вида: «Бег», «Баня», «Ходьба на дорожке». */
export function activityLabel(p: PlannedSession): string {
  if (p.customKind) return p.customKind;
  if (p.kind === "cardio" && p.cardioKind) return CARDIO_LABELS[p.cardioKind];
  if (p.kind === "recovery" && p.recoveryType) return RECOVERY_LABELS[p.recoveryType];
  if (p.kind === "mobility" && p.mobilityKind) return MOBILITY_LABELS[p.mobilityKind];
  return p.kind === "strength" ? L("Силовая", "Strength") : "";
}

/** Иконка карточки — как у тренировки того же вида. */
export function plannedIcon(p: PlannedSession): IconKey {
  if (p.kind === "recovery") return p.recoveryType ? RECOVERY_ICONS[p.recoveryType] : "spa";
  if (p.kind === "cardio") return p.cardioKind ? CARDIO_ICONS[p.cardioKind] : "bolt";
  if (p.kind === "mobility") return p.mobilityKind ? MOBILITY_ICONS[p.mobilityKind] : "yoga";
  return "gym";
}

/** Цели одной строкой: «30 мин · пульс 135–145 · каденс 158–160». */
export function goalLine(p: PlannedSession): string {
  const parts: string[] = [];
  const dur = fmtRange(p.durationMin, p.durationMaxMin);
  if (dur) parts.push(`${dur} ${L("мин", "min")}`);
  if (p.distanceKm != null) parts.push(`${p.distanceKm} ${L("км", "km")}`);
  const hr = fmtRange(p.hrMin, p.hrMax);
  if (hr) parts.push(`${L("пульс", "HR")} ${hr}`);
  else if (p.hrZone != null) parts.push(`Z${p.hrZone}`);
  const cad = fmtRange(p.cadenceMin, p.cadenceMax);
  if (cad) parts.push(`${L("каденс", "cadence")} ${cad}`);
  const inc = fmtRange(p.inclineDeg, p.inclineMaxDeg);
  if (inc) parts.push(`${L("наклон", "incline")} ${inc}°`);
  if (p.optional) parts.push(L("по желанию", "optional"));
  return parts.join(" · ");
}

/** Средняя цель длительности в минутах (для «план/факт»). */
export function plannedMinutes(p: PlannedSession): number {
  if (p.durationMin == null) return 0;
  return p.durationMaxMin != null ? (p.durationMin + p.durationMaxMin) / 2 : p.durationMin;
}

export type MinuteBucket = "run" | "bike" | "treadmill";

function bucketOf(kind: CardioKind | null | undefined): MinuteBucket | null {
  if (kind === "run" || kind === "treadmill_run") return "run";
  if (kind === "bike") return "bike";
  if (kind === "treadmill") return "treadmill";
  return null;
}

export interface SlotCell {
  date: string;
  slot: PlanSlot;
  cards: PlannedSession[];
  /** done — все обязательные карточки закрыты; partial — часть; skipped — пропущено. */
  state: "empty" | "planned" | "done" | "partial" | "skipped";
}

export function slotState(cards: PlannedSession[]): SlotCell["state"] {
  if (!cards.length) return "empty";
  const req = cards.filter((c) => !c.optional);
  const need = req.length ? req : cards;
  const closed = (c: PlannedSession) => c.status === "done" || c.status === "replaced";
  if (need.every(closed)) return "done";
  if (need.every((c) => c.status === "skipped")) return "skipped";
  if (need.some((c) => closed(c) || c.status === "skipped")) return "partial";
  return "planned";
}

export interface PeriodSummary {
  slots: number;
  slotsDone: number;
  minutes: Record<MinuteBucket, { plan: number; fact: number }>;
}

/** Итог периода: выполнено N из M слотов; минуты бега/вела/дорожки план и факт. */
export function periodSummary(cards: PlannedSession[], sessions: Session[], dates: string[]): PeriodSummary {
  const inRange = new Set(dates);
  const mine = cards.filter((c) => inRange.has(c.date));
  const slots = new Map<string, PlannedSession[]>();
  for (const c of mine) {
    const k = `${c.date}|${c.slot}`;
    slots.set(k, [...(slots.get(k) ?? []), c]);
  }
  let slotsDone = 0;
  for (const list of slots.values()) if (slotState(list) === "done") slotsDone++;
  const minutes: PeriodSummary["minutes"] = { run: { plan: 0, fact: 0 }, bike: { plan: 0, fact: 0 }, treadmill: { plan: 0, fact: 0 } };
  for (const c of mine) {
    const b = bucketOf(c.cardioKind);
    if (c.kind === "cardio" && b) minutes[b].plan += plannedMinutes(c);
  }
  for (const s of sessions) {
    if (!inRange.has(s.date) || s.kind !== "cardio") continue;
    const b = bucketOf(s.cardioKind);
    if (!b) continue;
    const sec = s.cardio?.durationSec ?? sessionDurationSec(s) ?? 0;
    minutes[b].fact += sec / 60;
  }
  for (const b of Object.keys(minutes) as MinuteBucket[]) {
    minutes[b].plan = Math.round(minutes[b].plan);
    minutes[b].fact = Math.round(minutes[b].fact);
  }
  return { slots: slots.size, slotsDone, minutes };
}

/** Активный план, покрывающий дату (или ближайший будущий). */
export function activePlan(plans: Plan[], date: string): Plan | null {
  const live = plans.filter((p) => !p.archivedAt);
  return (
    live.find((p) => p.start <= date && date <= p.end) ??
    live.filter((p) => p.start > date).sort((a, b) => a.start.localeCompare(b.start))[0] ??
    null
  );
}

/** Холодная процедура в день силовой — правило «не ставить купель после силовой». */
export function coldAfterStrength(date: string, sessions: Session[], planned: PlannedSession[]): boolean {
  return (
    sessions.some((s) => s.date === date && s.kind === "strength") ||
    planned.some((p) => p.date === date && p.kind === "strength" && p.status !== "skipped")
  );
}

export const COLD_TYPES = new Set(["cold_plunge", "ice_bath", "cold_shower"]);
