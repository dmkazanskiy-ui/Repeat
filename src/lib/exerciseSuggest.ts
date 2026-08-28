// Подбор упражнений для быстрой замены. Смысл: когда меняешь упражнение прямо
// в тренировке, общий список на 200+ позиций не помогает — нужны те, что
// закрывают ту же работу. Считаем близость по основным мышцам и паттерну
// движения из классификатора; ничего не выдумываем сверх его данных.

import { classifyExercise } from "./analytics/muscles";
import type { Muscle } from "./analytics/muscles";
import type { Exercise, Session } from "./types";

function primaryMuscles(exercise: Exercise): Set<Muscle> {
  return new Set(
    classifyExercise(exercise)
      .muscles.filter((m) => m.role === "primary")
      .map((m) => m.muscle),
  );
}

/**
 * Близость двух упражнений: общий паттерн движения весит больше, чем отдельная
 * общая мышца, потому что «то же движение другим снарядом» — самая частая
 * замена. 0 — ничего общего.
 */
function similarity(a: Exercise, b: Exercise): number {
  const ca = classifyExercise(a);
  const cb = classifyExercise(b);

  const patternsA = new Set(ca.patterns.filter((p) => p !== "other"));
  const sharedPattern = cb.patterns.some((p) => p !== "other" && patternsA.has(p));

  const primaryA = primaryMuscles(a);
  const primaryB = primaryMuscles(b);
  let sharedPrimary = 0;
  for (const m of primaryB) if (primaryA.has(m)) sharedPrimary += 1;

  if (!sharedPattern && sharedPrimary === 0) return 0;
  return (sharedPattern ? 3 : 0) + sharedPrimary;
}

/** Упражнения, закрывающие ту же работу, — лучшие сверху. */
export function similarExercises(
  target: Exercise,
  exercises: Exercise[],
  limit = 8,
): Exercise[] {
  return exercises
    .filter((e) => e.id !== target.id)
    .map((e) => ({ exercise: e, score: similarity(target, e) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.exercise);
}

/**
 * Упражнения из недавних силовых — «ты уже это делал». Свежие сверху,
 * исключая те, что уже есть в текущей тренировке.
 */
export function recentExercises(
  sessions: Session[],
  exercises: Exercise[],
  options: { exclude?: string[]; limit?: number } = {},
): Exercise[] {
  const exclude = new Set(options.exclude ?? []);
  const seen: string[] = [];
  const sorted = [...sessions]
    .filter((s) => s.kind === "strength")
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  for (const session of sorted) {
    for (const item of session.exercises) {
      if (exclude.has(item.exerciseId) || seen.includes(item.exerciseId)) continue;
      seen.push(item.exerciseId);
    }
    if (seen.length >= (options.limit ?? 8)) break;
  }

  return seen
    .slice(0, options.limit ?? 8)
    .map((id) => exercises.find((e) => e.id === id))
    .filter((e): e is Exercise => e != null);
}

/**
 * Последний рабочий вес упражнения — чтобы после замены не начинать с пустого
 * поля. Берём самый тяжёлый рабочий подход последней тренировки с ним.
 */
export function lastWorkingWeight(
  sessions: Session[],
  exerciseId: string,
): number | null {
  const sorted = [...sessions]
    .filter((s) => s.kind === "strength")
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  for (const session of sorted) {
    let best: number | null = null;
    for (const item of session.exercises) {
      if (item.exerciseId !== exerciseId) continue;
      for (const set of item.sets) {
        if (set.warmup || set.weight == null) continue;
        if (best == null || set.weight > best) best = set.weight;
      }
    }
    if (best != null) return best;
  }
  return null;
}
