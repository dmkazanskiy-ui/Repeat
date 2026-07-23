import { sessionDurationSec, setVolume } from "../types";
import type { Session, WorkoutSet } from "../types";
import { bucketKey, bucketStarts } from "./period";
import type {
  AnalyticsPeriod,
  AnalyticsSummary,
  MetricComparison,
  MetricDataPoint,
  MetricKey,
  Trend,
} from "./types";

/** Рабочий подход — не помеченный разминкой. Разминки в объём не идут. */
export function isWorkingSet(set: WorkoutSet): boolean {
  return !set.warmup;
}

function workingSets(session: Session): WorkoutSet[] {
  return session.exercises.flatMap((ex) => ex.sets.filter(isWorkingSet));
}

/** Тоннаж рабочих подходов силовой (с учётом дропов, без разминок). */
export function workingVolume(session: Session): number {
  return workingSets(session).reduce((sum, set) => sum + setVolume(set), 0);
}

/** Рабочие повторы: повторы подхода плюс повторы его дроп-ступеней. */
export function workingReps(session: Session): number {
  return workingSets(session).reduce((sum, set) => {
    const drops = (set.drops ?? []).reduce((n, d) => n + (d.reps ?? 0), 0);
    return sum + (set.reps ?? 0) + drops;
  }, 0);
}

/** Значение метрики для одной сессии (кроме activeDays — она по датам). */
export function metricOfSession(session: Session, metric: MetricKey): number {
  switch (metric) {
    case "workouts":
      return 1;
    case "duration":
      return sessionDurationSec(session) ?? 0;
    case "volume":
      return workingVolume(session);
    case "distance":
      return session.kind === "cardio" ? (session.cardio?.distanceM ?? 0) : 0;
    case "exercises":
      return session.exercises.length;
    case "sets":
      return workingSets(session).length;
    case "reps":
      return workingReps(session);
    case "activeDays":
      return 0; // считается по уникальным датам, не суммой
  }
}

function inRange(sessions: Session[], start: string, end: string): Session[] {
  return sessions.filter((s) => s.date >= start && s.date <= end);
}

/** Итог метрики за диапазон. activeDays — число уникальных дат. */
export function totalMetric(
  sessions: Session[],
  start: string,
  end: string,
  metric: MetricKey,
): number {
  const scoped = inRange(sessions, start, end);
  if (metric === "activeDays") {
    return new Set(scoped.map((s) => s.date)).size;
  }
  return scoped.reduce((sum, s) => sum + metricOfSession(s, metric), 0);
}

export function summarize(
  sessions: Session[],
  start: string,
  end: string,
): AnalyticsSummary {
  return {
    workouts: totalMetric(sessions, start, end, "workouts"),
    activeDays: totalMetric(sessions, start, end, "activeDays"),
    duration: totalMetric(sessions, start, end, "duration"),
    volume: totalMetric(sessions, start, end, "volume"),
    distance: totalMetric(sessions, start, end, "distance"),
    exercises: totalMetric(sessions, start, end, "exercises"),
    sets: totalMetric(sessions, start, end, "sets"),
    reps: totalMetric(sessions, start, end, "reps"),
  };
}

/**
 * Ряд по корзинам периода с нулевыми днями: дни без тренировок остаются
 * на шкале нулём, а не пропадают. activeDays в корзине — уникальные даты.
 */
export function series(
  sessions: Session[],
  period: AnalyticsPeriod,
  metric: MetricKey,
): MetricDataPoint[] {
  const scoped = inRange(sessions, period.startDate, period.endDate);
  const sums = new Map<string, number>();
  const dates = new Map<string, Set<string>>();

  for (const s of scoped) {
    const key = bucketKey(s.date, period.aggregation);
    sums.set(key, (sums.get(key) ?? 0) + metricOfSession(s, metric));
    if (!dates.has(key)) dates.set(key, new Set());
    dates.get(key)!.add(s.date);
  }

  return bucketStarts(period).map((date) => ({
    date,
    value:
      metric === "activeDays" ? (dates.get(date)?.size ?? 0) : (sums.get(date) ?? 0),
  }));
}

function trendOf(absolute: number): Trend {
  if (absolute > 0) return "up";
  if (absolute < 0) return "down";
  return "flat";
}

/** Сравнение метрики текущего периода с предыдущим той же длины. */
export function compareMetric(
  sessions: Session[],
  period: AnalyticsPeriod,
  metric: MetricKey,
): MetricComparison {
  const current = totalMetric(sessions, period.startDate, period.endDate, metric);
  const prev = period.comparison;
  const previous = totalMetric(sessions, prev.startDate, prev.endDate, metric);
  const absolute = current - previous;
  return {
    metric,
    current,
    previous,
    absolute,
    percent: previous === 0 ? null : (absolute / previous) * 100,
    trend: trendOf(absolute),
  };
}

/** Среднее значение метрики за тренировочный день периода (для линии среднего). */
export function averagePerActiveDay(
  sessions: Session[],
  start: string,
  end: string,
  metric: MetricKey,
): number {
  const activeDays = totalMetric(sessions, start, end, "activeDays");
  if (activeDays === 0) return 0;
  return totalMetric(sessions, start, end, metric) / activeDays;
}
