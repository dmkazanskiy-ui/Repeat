import { bestE1rm, epley, setVolume } from "../types";
import type { Exercise, Session, SessionExercise } from "../types";
import { isWorkingSet } from "./metrics";
import { diffDays } from "./period";
import type { ExercisePerformancePoint } from "./types";

// Единственный источник формулы e1RM для всего приложения.
export { epley, bestE1rm };

export type StrengthTrend = "up" | "flat" | "down" | "insufficient";

/** Лучший рабочий подход упражнения в сессии — по e1RM, иначе по весу. */
function topWorkingSet(exercise: SessionExercise) {
  let best: { weight: number | null; reps: number | null; e1rm: number | null } | null =
    null;
  for (const set of exercise.sets) {
    if (!isWorkingSet(set)) continue;
    const e1rm = epley(set.weight, set.reps);
    const score = e1rm ?? set.weight ?? -1;
    const bestScore = best ? (best.e1rm ?? best.weight ?? -1) : -Infinity;
    if (best == null || score > bestScore) {
      best = { weight: set.weight, reps: set.reps, e1rm };
    }
  }
  return best;
}

/** Рабочий тоннаж упражнения в сессии (без разминок). */
export function exerciseWorkingVolume(exercise: SessionExercise): number {
  return exercise.sets
    .filter(isWorkingSet)
    .reduce((sum, set) => sum + setVolume(set), 0);
}

/** Точки прогресса упражнения по датам (одна на тренировку с ним). */
export function exercisePerformance(
  sessions: Session[],
  exerciseId: string,
): ExercisePerformancePoint[] {
  const points: ExercisePerformancePoint[] = [];
  for (const s of sessions) {
    if (s.kind !== "strength") continue;
    const entries = s.exercises.filter((e) => e.exerciseId === exerciseId);
    if (entries.length === 0) continue;

    let top: ReturnType<typeof topWorkingSet> = null;
    let workoutVolume = 0;
    for (const entry of entries) {
      workoutVolume += exerciseWorkingVolume(entry);
      const candidate = topWorkingSet(entry);
      if (
        candidate &&
        (top == null ||
          (candidate.e1rm ?? candidate.weight ?? -1) >
            (top.e1rm ?? top.weight ?? -1))
      ) {
        top = candidate;
      }
    }

    points.push({
      date: s.date,
      weight: top?.weight ?? null,
      reps: top?.reps ?? null,
      e1rm: top?.e1rm ?? null,
      topSetVolume: (top?.weight ?? 0) * (top?.reps ?? 0),
      workoutVolume,
    });
  }
  return points.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Тренд силы по точкам e1RM методом наименьших квадратов. Показываем только
 * при достаточных данных: ≥4 тренировок и охват ≥3 недель — иначе честно
 * говорим «данных недостаточно».
 */
export function strengthTrend(points: ExercisePerformancePoint[]): StrengthTrend {
  const withE1rm = points.filter((p) => p.e1rm != null) as Array<
    ExercisePerformancePoint & { e1rm: number }
  >;
  if (withE1rm.length < 4) return "insufficient";
  const spanDays = diffDays(withE1rm[0].date, withE1rm[withE1rm.length - 1].date);
  if (spanDays < 21) return "insufficient";

  const xs = withE1rm.map((p) => diffDays(withE1rm[0].date, p.date));
  const ys = withE1rm.map((p) => p.e1rm);
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const projected = slope * spanDays; // ожидаемое изменение за весь охват
  const deadband = meanY * 0.02; // 2% — шум, а не тренд
  if (projected > deadband) return "up";
  if (projected < -deadband) return "down";
  return "flat";
}

export interface ExerciseInsight {
  id: string;
  name: string;
  points: ExercisePerformancePoint[];
  bestWeight: number;
  bestReps: number;
  bestVolume: number;
  bestE1rm: number;
  lastPrDate: string;
  sessions: number;
  lastDate: string;
  trend: StrengthTrend;
}

/** Упражнения с историей e1RM — для списка «Прогресс силы». */
export function trainedExercises(
  sessions: Session[],
  exercises: Exercise[],
): ExerciseInsight[] {
  const ids = new Set<string>();
  for (const s of sessions) {
    if (s.kind !== "strength") continue;
    for (const ex of s.exercises) ids.add(ex.exerciseId);
  }

  const result: ExerciseInsight[] = [];
  for (const id of ids) {
    const points = exercisePerformance(sessions, id);
    const e1rms = points.map((p) => p.e1rm).filter((v): v is number => v != null);
    if (e1rms.length === 0) continue;

    const bestE1rm = Math.max(...e1rms);
    const prPoint = [...points].reverse().find((p) => p.e1rm === bestE1rm);

    result.push({
      id,
      name: exercises.find((e) => e.id === id)?.name ?? "Упражнение",
      points,
      bestWeight: Math.max(0, ...points.map((p) => p.weight ?? 0)),
      bestReps: Math.max(0, ...points.map((p) => p.reps ?? 0)),
      bestVolume: Math.max(0, ...points.map((p) => p.workoutVolume)),
      bestE1rm,
      lastPrDate: prPoint?.date ?? points[points.length - 1].date,
      sessions: points.length,
      lastDate: points[points.length - 1].date,
      trend: strengthTrend(points),
    });
  }
  return result.sort((a, b) => (a.lastDate < b.lastDate ? 1 : -1));
}
