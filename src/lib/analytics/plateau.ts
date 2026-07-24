// Плато-детектор (SPEC §5.2) — центральная фича: сколько недель упражнение
// стоит по сглаженному e1RM. Алгоритм: недельный максимум e1RM → сглаживание
// скользящим средним по 3 точкам → плато, пока сглаженный максимум не превысил
// предыдущий пик более чем на 1.5%. Разгрузочные недели исключаются.

import { epley } from "../types";
import type { Exercise, Session, SessionExercise } from "../types";
import { isWorkingSet } from "./metrics";
import { weekStart } from "./period";

const IMPROVEMENT = 1.015; // +1.5% к пику считается прорывом, а не плато

function bestWorkingE1rm(exercise: SessionExercise): number | null {
  let best: number | null = null;
  for (const set of exercise.sets) {
    if (!isWorkingSet(set)) continue;
    const e = epley(set.weight, set.reps);
    if (e != null && (best == null || e > best)) best = e;
  }
  return best;
}

export interface WeekPeak {
  week: string; // понедельник недели
  e1rm: number;
}

/** Недельные максимумы e1RM упражнения, без разгрузочных недель. */
export function weeklyPeaks(sessions: Session[], exerciseId: string): WeekPeak[] {
  const byWeek = new Map<string, number>();
  const deloadWeeks = new Set<string>();

  for (const s of sessions) {
    if (s.kind !== "strength") continue;
    const wk = weekStart(s.date);
    if (s.deload) deloadWeeks.add(wk);
    for (const ex of s.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      const e = bestWorkingE1rm(ex);
      if (e != null) byWeek.set(wk, Math.max(byWeek.get(wk) ?? 0, e));
    }
  }

  return [...byWeek.entries()]
    .filter(([wk]) => !deloadWeeks.has(wk))
    .map(([week, e1rm]) => ({ week, e1rm }))
    .sort((a, b) => (a.week < b.week ? -1 : 1));
}

/** Сглаживание скользящим средним по 3 точкам (текущая + 2 предыдущие). */
function smooth3(values: number[]): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - 2), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

export interface Plateau {
  /** Недель без нового пика прямо сейчас. */
  currentWeeks: number;
  /** Самое долгое плато за историю. */
  longestWeeks: number;
  longestFrom: string | null;
  longestTo: string | null;
  /** Сколько недель данных всего — для проверки достаточности. */
  weeks: number;
}

/**
 * Плато упражнения: текущая длительность и рекорд за историю. Плато меряется
 * в неделях с последнего прорыва сглаженного e1RM.
 */
export function exercisePlateau(sessions: Session[], exerciseId: string): Plateau {
  const peaks = weeklyPeaks(sessions, exerciseId);
  const n = peaks.length;
  if (n < 2) {
    return { currentWeeks: 0, longestWeeks: 0, longestFrom: null, longestTo: null, weeks: n };
  }

  const sm = smooth3(peaks.map((p) => p.e1rm));
  const improvements = [0];
  let peak = sm[0];
  for (let i = 1; i < n; i++) {
    if (sm[i] > peak * IMPROVEMENT) {
      improvements.push(i);
      peak = sm[i];
    } else {
      peak = Math.max(peak, sm[i]);
    }
  }

  const lastImprove = improvements[improvements.length - 1];
  const currentWeeks = n - 1 - lastImprove;

  // Самое долгое плато — наибольший разрыв между прорывами, включая текущий.
  let longestWeeks = currentWeeks;
  let longestFrom = peaks[lastImprove].week;
  let longestTo = peaks[n - 1].week;
  for (let k = 0; k < improvements.length - 1; k++) {
    const gap = improvements[k + 1] - improvements[k];
    if (gap > longestWeeks) {
      longestWeeks = gap;
      longestFrom = peaks[improvements[k]].week;
      longestTo = peaks[improvements[k + 1]].week;
    }
  }

  return { currentWeeks, longestWeeks, longestFrom, longestTo, weeks: n };
}

export interface ActivePlateau {
  id: string;
  name: string;
  weeks: number;
}

/**
 * Упражнения, стоящие на плато не меньше `minWeeks` недель — для плашек
 * «Жим лёжа: плато 6 недель». Свежие/длинные плато выше.
 */
export function activePlateaus(
  sessions: Session[],
  exercises: Exercise[],
  minWeeks = 3,
): ActivePlateau[] {
  const ids = new Set<string>();
  for (const s of sessions) {
    if (s.kind !== "strength") continue;
    for (const ex of s.exercises) ids.add(ex.exerciseId);
  }

  const result: ActivePlateau[] = [];
  for (const id of ids) {
    const p = exercisePlateau(sessions, id);
    if (p.currentWeeks >= minWeeks) {
      result.push({
        id,
        name: exercises.find((e) => e.id === id)?.name ?? "Упражнение",
        weeks: p.currentWeeks,
      });
    }
  }
  return result.sort((a, b) => b.weeks - a.weeks);
}
