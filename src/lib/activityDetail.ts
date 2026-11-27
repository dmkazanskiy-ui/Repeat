// Подробности тренировок с часов: связь с источником, обогащение сводки и
// загрузка тяжёлой детализации (круги, ряды, маршрут) по открытию экрана.
// Правила владения полями: импорт обновляет время, дистанцию, пульс, калории и
// расширенную сводку; название, заметки, фото, самочувствие и дела — человека.
import { authHeader } from "./auth";
import type { ActivityStats, Session } from "./types";

/** Служебная строка первого импорта: «Импорт из COROS. ID: 482013868569166128». */
const NOTE_RE = /^\s*Импорт из COROS\.?\s*ID:\s*(\d{6,25})\s*$/m;

/** Перенести ID из служебной строки заметки в source; остальной текст заметки — как был. */
export function migrateSourceNotes(sessions: Session[]): { sessions: Session[]; changed: number } {
  let changed = 0;
  const next = sessions.map((s) => {
    if (s.source || !s.notes) return s;
    const m = s.notes.match(NOTE_RE);
    if (!m) return s;
    changed++;
    const notes = s.notes.replace(NOTE_RE, "").replace(/\n{3,}/g, "\n\n").trim();
    return { ...s, notes: notes || null, source: { provider: "coros", externalId: m[1], verified: false } };
  });
  return { sessions: changed ? next : sessions, changed };
}

export interface EnrichPayload {
  source: string;
  externalActivityId: string;
  level: "summary" | "laps" | "streams";
  summary: Record<string, number | string>;
  laps?: number;
  missing?: string[];
}

const STAT_KEYS: (keyof ActivityStats)[] = [
  "timezone", "elapsedSec", "movingSec", "maxHr", "avgCadence", "maxCadence", "avgStrideM", "avgPower", "maxPower",
  "ascentM", "descentM", "minAltM", "maxAltM", "avgAltM", "trainingLoad", "aerobicTE", "anaerobicTE", "trainingFocus",
  "avgPaceSec", "movingPaceSec", "effortPaceSec", "bestKmSec", "avgStanceTimeMs", "avgVerticalRatio",
  "avgVerticalOscillationCm", "efficiencyPct", "efficiencyLabel", "performanceLabel",
];

/** Найти тренировку по источнику и ID (строкой). Новых не создаём. */
export function findBySource(sessions: Session[], provider: string, id: string): Session | undefined {
  return sessions.find((s) => s.source?.provider === provider && s.source.externalId === id);
}

/** Обновить тренировку подробностями. → null, если такой тренировки нет. */
export function applyEnrich(session: Session, p: EnrichPayload, now = new Date()): Session {
  const sm = p.summary;
  const num = (k: string) => (typeof sm[k] === "number" ? (sm[k] as number) : undefined);
  const stats: ActivityStats = { ...(session.stats ?? {}) };
  for (const k of STAT_KEYS) {
    const v = sm[k];
    if (v !== undefined && v !== null) (stats as Record<string, unknown>)[k] = v;
  }
  const next: Session = {
    ...session,
    stats,
    source: { ...(session.source ?? { provider: p.source, externalId: p.externalActivityId }), detail: p.level, verified: true, updatedAt: now.toISOString() },
  };
  // Силовая — «монумент»: упражнения, подходы и время, введённые в дневнике, не
  // трогаем. С часов — только пульс, калории (если своих нет), их длительность
  // и графики в подробностях.
  if (session.kind === "strength") {
    if (num("timerSec") != null) next.stats = { ...stats, watchTimerSec: num("timerSec") };
    if (num("avgHr") != null && next.avgHr == null) next.avgHr = num("avgHr")!;
    if (num("calories") != null && next.calories == null) next.calories = num("calories")!;
    return next;
  }
  if (typeof sm.startedAt === "string") next.startedAt = sm.startedAt;
  // Реальный конец: из источника; иначе начало + полное время (не таймер!).
  if (typeof sm.endedAt === "string") next.endedAt = sm.endedAt;
  else if (next.startedAt && num("elapsedSec") != null) next.endedAt = new Date(Date.parse(next.startedAt) + num("elapsedSec")! * 1000).toISOString();
  if (next.endedAt) {
    next.autoEnded = false;
    next.pausedAt = null;
    // Паузы — разница полного и активного времени: так длительность в приложении = таймер часов.
    const el = num("elapsedSec");
    const tm = num("timerSec");
    if (el != null && tm != null) next.pausedMs = Math.max(0, Math.round((el - tm) * 1000));
  }
  if (next.cardio) {
    next.cardio = {
      ...next.cardio,
      durationSec: num("timerSec") ?? next.cardio.durationSec,
      distanceM: num("distanceM") ?? next.cardio.distanceM,
      avgHr: num("avgHr") ?? next.cardio.avgHr,
    };
  } else if (num("avgHr") != null) next.avgHr = num("avgHr")!;
  if (num("calories") != null) next.calories = num("calories")!;
  return next;
}

export interface DetailLap {
  group: string;
  index: number;
  timerSec?: number;
  elapsedSec?: number;
  distanceM?: number;
  avgSpeed?: number;
  avgPaceSec?: number;
  avgHr?: number;
  maxHr?: number;
  avgCadence?: number;
  avgPower?: number;
  partial?: boolean;
}

export interface DetailDoc {
  source: string;
  externalActivityId: string;
  level: "summary" | "laps" | "streams";
  summary: Record<string, number | string>;
  laps: DetailLap[];
  zones: { metric: string; seconds: (number | null)[]; upperBounds?: (number | null)[] | null; names?: string[] | null; origin?: string }[];
  streams?: Record<string, (number | null)[]> | null;
  pauses?: [number, number][];
  missing?: string[];
  updatedAt?: string;
}

export async function fetchDetail(provider: string, id: string): Promise<DetailDoc> {
  const auth = authHeader();
  if (!auth) throw new Error("auth");
  const res = await fetch(`/api/activity/detail?source=${encodeURIComponent(provider)}&id=${encodeURIComponent(id)}`, { headers: { Authorization: auth } });
  if (res.status === 404) throw new Error("none");
  if (!res.ok) throw new Error(`http ${res.status}`);
  return (await res.json()) as DetailDoc;
}

/** Секунды → «54:18», «1:31:25», а короткое — с сотыми: «0:01,98». */
export function clock(sec: number | null | undefined, frac = false): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const whole = Math.floor(sec);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const ss = String(s).padStart(2, "0");
  const tail = frac ? `,${String(Math.round((sec - whole) * 100)).padStart(2, "0").slice(0, 2)}` : "";
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}${tail}` : `${m}:${ss}${tail}`;
}

/** Темп из секунд на км; нулевая дистанция — «—». */
export function pace(secPerKm: number | null | undefined): string {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0 || secPerKm > 3600) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, "0")}`;
}

export function lapPace(lp: DetailLap): number | null {
  if (lp.avgPaceSec != null) return lp.avgPaceSec;
  if (lp.distanceM && lp.timerSec) return lp.timerSec / (lp.distanceM / 1000);
  return null;
}

/**
 * Прореживание для графика: в каждой «корзине» оставляем минимум и максимум —
 * пики и провалы не теряются. Статистику считать до прореживания.
 */
export function minMaxDownsample(x: number[], y: (number | null)[], buckets: number): { x: number; y: number | null }[] {
  const n = x.length;
  if (n <= buckets * 2) return x.map((v, i) => ({ x: v, y: y[i] }));
  const out: { x: number; y: number | null }[] = [];
  const size = n / buckets;
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * size);
    const to = Math.min(n, Math.floor((b + 1) * size));
    let lo = -1;
    let hi = -1;
    let gap = false;
    for (let i = from; i < to; i++) {
      const v = y[i];
      if (v == null) {
        gap = true;
        continue;
      }
      if (lo < 0 || v < (y[lo] as number)) lo = i;
      if (hi < 0 || v > (y[hi] as number)) hi = i;
    }
    if (lo < 0) {
      out.push({ x: x[from], y: null }); // пропуск измерений — разрыв линии, не выдумываем
      continue;
    }
    const pair = lo < hi ? [lo, hi] : [hi, lo];
    for (const i of new Set(pair)) out.push({ x: x[i], y: y[i] });
    if (gap) out.push({ x: x[to - 1], y: null });
  }
  return out;
}
