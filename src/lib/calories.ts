// Оценка потраченных калорий.
//
// Считаем по MET (метаболический эквивалент): ккал = MET × вес(кг) × часы.
// Это та же арифметика, что у тренажёров и часов, — оценка, а не измерение,
// поэтому введённое руками число с табло всегда важнее расчёта.
//
// Где можно, MET берём не из таблицы, а из формул ACSM — они учитывают
// скорость, наклон и мощность, и потому честнее плоского коэффициента:
// бег на 12 км/ч и трусца на 8 стоят разного.

import { sessionDurationSec } from "./types";
import type { BodyEntry, Session } from "./types";

/** Ходьба и бег по ACSM: VO2 (мл/кг/мин) из скорости и уклона. */
function walkMet(speedKph: number, grade: number): number {
  const metersPerMin = (speedKph * 1000) / 60;
  return (0.1 * metersPerMin + 1.8 * metersPerMin * grade + 3.5) / 3.5;
}

function runMet(speedKph: number, grade: number): number {
  const metersPerMin = (speedKph * 1000) / 60;
  return (0.2 * metersPerMin + 0.9 * metersPerMin * grade + 3.5) / 3.5;
}

/** Наклон дорожки в градусах → уклон (tan), как его ждут формулы ACSM. */
function gradeOf(inclineDeg: number | null | undefined): number {
  if (!inclineDeg) return 0;
  return Math.tan((inclineDeg * Math.PI) / 180);
}

/** Велоэргометр по ACSM: мощность и вес дают VO2 напрямую. */
function bikePowerMet(watts: number, weightKg: number): number {
  return ((10.8 * watts) / weightKg + 7) / 3.5;
}

/** Велосипед без ваттметра — по скорости (компендиум физической активности). */
function bikeSpeedMet(speedKph: number): number {
  if (speedKph < 16) return 4;
  if (speedKph < 19) return 6;
  if (speedKph < 22) return 8;
  if (speedKph < 25) return 10;
  return 12;
}

const STRENGTH_MET = { easy: 3.5, medium: 5, hard: 6 } as const;

const MOBILITY_MET: Record<string, number> = {
  yoga: 2.5,
  lfk: 3,
  stretching: 2.3,
  meditation: 1.3,
  breathing: 1.3,
  foam_rolling: 2.3,
};

/**
 * MET тренировки. null — вид, для которого расход считать нечестно
 * (массаж, баня: это не работа, а восстановление).
 */
function metOf(session: Session, weightKg: number): number | null {
  const durationSec = sessionDurationSec(session);
  const hours = durationSec ? durationSec / 3600 : 0;

  if (session.kind === "recovery") return null;

  if (session.kind === "strength") {
    return STRENGTH_MET[session.intensity ?? "medium"];
  }

  if (session.kind === "wod") return 8;

  if (session.kind === "mobility") {
    return MOBILITY_MET[session.mobilityKind ?? ""] ?? 2.5;
  }

  // Кардио: где есть скорость или мощность — считаем по ним.
  const cardio = session.cardio;
  const distanceKm = cardio?.distanceM != null ? cardio.distanceM / 1000 : null;
  const speedKph = distanceKm && hours > 0 ? distanceKm / hours : null;
  const grade = gradeOf(cardio?.inclineDeg);

  switch (session.cardioKind) {
    case "run":
    case "treadmill_run":
      return speedKph ? runMet(speedKph, grade) : 9.8;
    case "treadmill":
      return speedKph ? walkMet(speedKph, grade) : 3.5;
    case "bike":
      if (cardio?.powerW) return bikePowerMet(cardio.powerW, weightKg);
      return speedKph ? bikeSpeedMet(speedKph) : 7;
    case "swim":
      return 7;
    case "elliptical":
      return 5;
    case "stairs":
      return 9;
    case "hiit":
      return 8;
    default:
      // Свой вид кардио: без таблицы берём умеренную нагрузку.
      return speedKph ? runMet(speedKph, grade) : 6;
  }
}

/**
 * Расчётные калории тренировки. null, если считать не из чего:
 * нет веса, нет длительности или вид не про расход.
 */
export function estimateCalories(
  session: Session,
  weightKg: number | null,
): number | null {
  if (!weightKg) return null;
  const durationSec = sessionDurationSec(session);
  if (!durationSec) return null;
  const met = metOf(session, weightKg);
  if (met == null) return null;
  return Math.round((met * weightKg * durationSec) / 3600);
}

/** Вес на дату тренировки: ближайший замер не позже неё, иначе самый ранний. */
export function weightOn(entries: BodyEntry[], date: string): number | null {
  const weighed = entries
    .filter((e) => e.weightKg != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (weighed.length === 0) return null;
  let best: BodyEntry | null = null;
  for (const entry of weighed) {
    if (entry.date <= date) best = entry;
    else break;
  }
  return (best ?? weighed[0]).weightKg;
}

/**
 * Калории тренировки для показа и аналитики: введённое руками число с табло
 * важнее расчёта. Расчёт лежит в `caloriesEst` — его проставляет `App` при
 * каждом сохранении, чтобы аналитике не нужно было знать про вес.
 */
export function sessionCalories(session: Session): number | null {
  return session.calories ?? session.caloriesEst ?? null;
}

/** Введены ли калории руками — оценку помечаем в интерфейсе как оценку. */
export function isCaloriesEstimate(session: Session): boolean {
  return session.calories == null && session.caloriesEst != null;
}

/**
 * Проставить расчёт калорий всем тренировкам. Вызывается на загрузке и на
 * каждом сохранении: вес меняется, формула тоже может измениться, а хранить
 * протухшую оценку хуже, чем пересчитать — тренировок немного.
 */
export function withCalorieEstimates(
  sessions: Session[],
  bodyEntries: BodyEntry[],
): Session[] {
  let changed = false;
  const next = sessions.map((session) => {
    const est = estimateCalories(session, weightOn(bodyEntries, session.date));
    if ((session.caloriesEst ?? null) === est) return session;
    changed = true;
    return { ...session, caloriesEst: est };
  });
  return changed ? next : sessions;
}
