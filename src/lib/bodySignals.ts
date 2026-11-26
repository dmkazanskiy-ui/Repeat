// Объективные сигналы восстановления: HRV, пульс покоя, сон — с часов (Garmin)
// через ИИ-помощника. Норма — своя: медиана за 28 дней до сегодняшнего.
// Правило перегруза (как в плане): HRV ниже нормы на 10%+ два дня подряд или
// пульс покоя на 5+ выше нормы — день стоит облегчить. Это подсказка, а не
// диагноз: решает человек.
import { newId } from "./id";
import { addDays } from "./format";
import type { RecoveryEntry } from "./types";

export interface CheckinDay {
  date: string;
  hrvMs?: number | null;
  restingHr?: number | null;
  sleepMin?: number | null;
  sleepScore?: number | null;
  bodyBattery?: number | null;
}

const FIELDS = ["hrvMs", "restingHr", "sleepMin", "sleepScore", "bodyBattery"] as const;
const RANGE: Record<(typeof FIELDS)[number], [number, number]> = {
  hrvMs: [5, 250],
  restingHr: [25, 130],
  sleepMin: [0, 1000],
  sleepScore: [0, 100],
  bodyBattery: [0, 100],
};

/** Разобрать дни из payload ИИ: только даты и числа в разумных пределах. */
export function parseCheckinDays(payload: unknown): CheckinDay[] {
  const days = (payload as { days?: unknown })?.days;
  if (!Array.isArray(days)) return [];
  const out: CheckinDay[] = [];
  for (const raw of days.slice(0, 62)) {
    const d = raw as Record<string, unknown>;
    if (typeof d?.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue;
    const day: CheckinDay = { date: d.date };
    for (const f of FIELDS) {
      const v = d[f];
      if (typeof v === "number" && Number.isFinite(v) && v >= RANGE[f][0] && v <= RANGE[f][1]) day[f] = Math.round(v);
    }
    if (FIELDS.some((f) => day[f] != null)) out.push(day);
  }
  return out;
}

/** Вписать данные с часов в записи самочувствия по датам; субъективные поля не трогаем. */
export function applyCheckins(recovery: RecoveryEntry[], days: CheckinDay[], device = "Garmin"): { next: RecoveryEntry[]; changed: number } {
  let changed = 0;
  const next = [...recovery];
  for (const day of days) {
    const i = next.findIndex((e) => e.date === day.date);
    const base: RecoveryEntry =
      i >= 0 ? next[i] : { id: newId(), date: day.date, wellbeing: null, sleep: null, freshness: null, motivation: null };
    const upd: RecoveryEntry = { ...base, device };
    let diff = i < 0;
    for (const f of FIELDS) {
      if (day[f] != null && base[f] !== day[f]) {
        upd[f] = day[f];
        diff = true;
      }
    }
    if (!diff) continue;
    changed++;
    if (i >= 0) next[i] = upd;
    else next.push(upd);
  }
  return { next: changed ? next : recovery, changed };
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface BodySignals {
  date: string | null;
  hrv: number | null;
  hrvBase: number | null;
  rhr: number | null;
  rhrBase: number | null;
  sleepMin: number | null;
  /** Дней подряд (до сегодня включительно) HRV ниже нормы на 10%+. */
  lowHrvDays: number;
  rhrHigh: boolean;
  /** Стоит облегчить день. */
  overreach: boolean;
  /** 0–1 для готовности (null — данных нет). */
  score: number | null;
}

/** Сигналы на дату: свежие данные не старше вчера, норма — медиана 28 дней до. */
export function bodySignals(recovery: RecoveryEntry[], asOf: string): BodySignals {
  const byDate = new Map(recovery.filter((e) => e.hrvMs != null || e.restingHr != null || e.sleepMin != null).map((e) => [e.date, e]));
  const cur = byDate.get(asOf) ?? byDate.get(addDays(asOf, -1)) ?? null;
  const from = addDays(asOf, -28);
  const past = [...byDate.values()].filter((e) => e.date >= from && e.date < (cur?.date ?? asOf));
  const hrvBase = past.length >= 5 ? median(past.map((e) => e.hrvMs).filter((v): v is number => v != null)) : null;
  const rhrBase = past.length >= 5 ? median(past.map((e) => e.restingHr).filter((v): v is number => v != null)) : null;
  // Без нормы — пороги из плана: HRV < 50, пульс покоя > 52.
  const lowHrv = (v: number | null | undefined) => v != null && (hrvBase != null ? v < hrvBase * 0.9 : v < 50);
  let lowHrvDays = 0;
  for (let d = cur?.date ?? asOf, i = 0; i < 7; i++, d = addDays(d, -1)) {
    if (lowHrv(byDate.get(d)?.hrvMs)) lowHrvDays++;
    else break;
  }
  const rhr = cur?.restingHr ?? null;
  const rhrHigh = rhr != null && (rhrBase != null ? rhr >= rhrBase + 5 : rhr > 52);
  const hrv = cur?.hrvMs ?? null;
  let score: number | null = null;
  if (hrv != null || rhr != null) {
    let s = 0.6;
    if (hrv != null) s += hrvBase ? (hrv / hrvBase - 1) * 2 : hrv >= 50 ? 0.1 : -0.15;
    if (rhr != null) s -= rhrBase ? Math.max(0, rhr - rhrBase) * 0.04 : rhr > 52 ? 0.15 : 0;
    score = Math.max(0, Math.min(1, s));
  }
  return {
    date: cur?.date ?? null,
    hrv,
    hrvBase,
    rhr,
    rhrBase,
    sleepMin: cur?.sleepMin ?? null,
    lowHrvDays,
    rhrHigh,
    overreach: lowHrvDays >= 2 || rhrHigh,
    score,
  };
}
