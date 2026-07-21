import type { WorkoutSet } from "./types";

/**
 * Выше этого числа повторов формула Эпли начинает заметно завышать —
 * такие подходы в тренд силы не берём. См. SPEC.md §5.1.
 */
export const E1RM_MAX_REPS = 12;

/**
 * Расчётный разовый максимум по формуле Эпли.
 * Приводит разные схемы к одной шкале: 100×5 (≈117) и 90×8 (≈114) сравнимы.
 * Возвращает null, если подход не годится для оценки.
 */
export function e1rm(weight: number | null, reps: number | null): number | null {
  if (weight == null || reps == null) return null;
  if (weight <= 0 || reps <= 0) return null;
  if (reps > E1RM_MAX_REPS) return null;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export function setE1rm(set: WorkoutSet): number | null {
  if (set.isWarmup) return null;
  return e1rm(set.weight, set.reps);
}

/** Тоннаж подхода: вес × повторы. Разминочные не считаются. */
export function setVolume(set: WorkoutSet): number {
  if (set.isWarmup) return 0;
  if (set.weight == null || set.reps == null) return 0;
  return set.weight * set.reps;
}

export function bestE1rm(sets: WorkoutSet[]): number | null {
  let best: number | null = null;
  for (const set of sets) {
    const value = setE1rm(set);
    if (value != null && (best == null || value > best)) best = value;
  }
  return best;
}

export function totalVolume(sets: WorkoutSet[]): number {
  return sets.reduce((sum, set) => sum + setVolume(set), 0);
}
