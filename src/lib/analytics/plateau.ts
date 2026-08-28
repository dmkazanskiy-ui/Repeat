// Плато-детектор (SPEC §5.2) — центральная фича: сколько недель упражнение
// стоит по сглаженному e1RM. Алгоритм: недельный максимум e1RM → сглаживание
// скользящим средним по 3 точкам → плато, пока сглаженный максимум не превысил
// предыдущий пик более чем на 1.5%. Разгрузочные недели исключаются.

import { epley } from "../types";
import type { Exercise, Session, SessionExercise } from "../types";
import { isWorkingSet } from "./metrics";
import { weekStart } from "./period";
import { exerciseName } from "../types";
import { weightIncrement } from "./autoreg";
import { L } from "../i18n";
import type { Trend } from "./types";

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
        name: exerciseName(exercises.find((e) => e.id === id)),
        weeks: p.currentWeeks,
      });
    }
  }
  return result.sort((a, b) => b.weeks - a.weeks);
}

// ─── Разбор плато: динамика по неделям + что делать ─────────────────────────
//
// Плашка «плато 6 недель» отвечает на «что», но не на «в чём именно» и «что
// делать». Ниже — неделя за неделей (вес/повторы/подходы) и детерминированные
// рекомендации из тех же данных. Никакого AI: правила прозрачные, их видно.

export interface PlateauWeek {
  /** Понедельник недели. */
  week: string;
  /** Лучший рабочий e1RM недели. */
  e1rm: number;
  /** Самый тяжёлый рабочий вес недели и повторы на нём. */
  topWeight: number | null;
  topReps: number | null;
  workingSets: number;
  /** Тренировок с этим упражнением на неделе. */
  sessions: number;
}

/** Понедельные показатели упражнения (разгрузочные недели исключены). */
export function plateauWeeks(sessions: Session[], exerciseId: string): PlateauWeek[] {
  const byWeek = new Map<string, PlateauWeek>();
  const deloadWeeks = new Set<string>();

  for (const s of sessions) {
    if (s.kind !== "strength") continue;
    const wk = weekStart(s.date);
    if (s.deload) deloadWeeks.add(wk);

    let touched = false;
    for (const ex of s.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      touched = true;
      const row =
        byWeek.get(wk) ??
        { week: wk, e1rm: 0, topWeight: null, topReps: null, workingSets: 0, sessions: 0 };

      for (const set of ex.sets) {
        if (!isWorkingSet(set)) continue;
        row.workingSets += 1;
        const e = epley(set.weight, set.reps);
        if (e != null && e > row.e1rm) row.e1rm = e;
        if (set.weight != null) {
          // Самый тяжёлый вес недели, а при равном весе — больше повторов.
          if (
            row.topWeight == null ||
            set.weight > row.topWeight ||
            (set.weight === row.topWeight && (set.reps ?? 0) > (row.topReps ?? 0))
          ) {
            row.topWeight = set.weight;
            row.topReps = set.reps;
          }
        }
      }
      byWeek.set(wk, row);
    }
    if (touched) {
      const row = byWeek.get(wk);
      if (row) row.sessions += 1;
    }
  }

  return [...byWeek.values()]
    .filter((row) => !deloadWeeks.has(row.week))
    .sort((a, b) => (a.week < b.week ? -1 : 1));
}

/** Тренд ряда: сравниваем первую и вторую половину, мёртвая зона ±5%. */
function trendOf(values: number[]): Trend {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return "flat";
  const half = Math.floor(clean.length / 2);
  const first = clean.slice(0, half || 1);
  const last = clean.slice(clean.length - (half || 1));
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const a = avg(first);
  const b = avg(last);
  if (a === 0) return b > 0 ? "up" : "flat";
  const change = (b - a) / a;
  if (change > 0.05) return "up";
  if (change < -0.05) return "down";
  return "flat";
}

export type PlateauCause = "reps_up" | "volume_down" | "rare" | "long" | "flat";

export interface PlateauAdvice {
  cause: PlateauCause;
  text: string;
}

export interface PlateauDetail {
  id: string;
  name: string;
  /** Недель без прорыва. */
  weeks: number;
  /** Окно для графика: плато + пара недель до него. */
  history: PlateauWeek[];
  /** Вес, на котором стоим (самый частый рабочий максимум за плато). */
  stuckWeight: number | null;
  stuckReps: number | null;
  repsTrend: Trend;
  setsTrend: Trend;
  /** Тренировок с упражнением в неделю за время плато. */
  perWeek: number;
  /** Короткое «в чём плато». */
  reading: string;
  advice: PlateauAdvice[];
}

function ruWeeks(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "неделю";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "недели";
  return "недель";
}

function weeksLabel(n: number): string {
  return L(`${n} ${ruWeeks(n)}`, `${n} ${n === 1 ? "week" : "weeks"}`);
}

function num(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const text = String(rounded);
  return L(text.replace(".", ","), text);
}

/**
 * Разбор одного плато: динамика по неделям, что именно стоит и что с этим
 * делать. Рекомендации — по приоритету, максимум три, все выводятся из данных.
 */
export function plateauDetail(
  sessions: Session[],
  exercises: Exercise[],
  exerciseId: string,
): PlateauDetail | null {
  const all = plateauWeeks(sessions, exerciseId);
  if (all.length === 0) return null;

  const { currentWeeks } = exercisePlateau(sessions, exerciseId);
  const weeks = Math.max(currentWeeks, 1);
  // Само плато — недели с последнего прорыва; для графика добавляем пару до.
  const plateauPart = all.slice(Math.max(0, all.length - (weeks + 1)));
  const history = all.slice(Math.max(0, all.length - Math.min(10, weeks + 3)));

  // Вес, на котором стоим: самый частый рабочий максимум, при равенстве — больший.
  const counts = new Map<number, number>();
  for (const w of plateauPart) {
    if (w.topWeight == null) continue;
    counts.set(w.topWeight, (counts.get(w.topWeight) ?? 0) + 1);
  }
  let stuckWeight: number | null = null;
  let bestCount = 0;
  for (const [weight, count] of counts) {
    if (count > bestCount || (count === bestCount && stuckWeight != null && weight > stuckWeight)) {
      stuckWeight = weight;
      bestCount = count;
    }
  }
  const stuckReps =
    plateauPart
      .filter((w) => w.topWeight === stuckWeight)
      .map((w) => w.topReps)
      .filter((r): r is number => r != null)
      .sort((a, b) => b - a)[0] ?? null;

  const repsTrend = trendOf(
    plateauPart.map((w) => w.topReps).filter((r): r is number => r != null),
  );
  const setsTrend = trendOf(plateauPart.map((w) => w.workingSets));
  const perWeek =
    plateauPart.length > 0
      ? plateauPart.reduce((sum, w) => sum + w.sessions, 0) / plateauPart.length
      : 0;

  const reading =
    stuckWeight != null
      ? L(
          `${num(stuckWeight)} кг держатся ${weeksLabel(weeks)} подряд`,
          `${num(stuckWeight)} kg has been holding for ${weeksLabel(weeks)} straight`,
        )
      : L(
          `Прогноз макс не растёт ${weeksLabel(weeks)}`,
          `Est. max hasn't moved for ${weeksLabel(weeks)}`,
        );

  const advice: PlateauAdvice[] = [];
  const inc = weightIncrement(exerciseId, exercises);

  if (repsTrend === "up") {
    advice.push({
      cause: "reps_up",
      text: L(
        `Повторы растут, а вес стоит — пора прибавить: +${num(inc)} кг и вернись к нижней границе повторов.`,
        `Reps are going up while the weight sits still — add load: +${num(inc)} kg and drop back to the low end of the rep range.`,
      ),
    });
  }
  if (setsTrend === "down") {
    advice.push({
      cause: "volume_down",
      text: L(
        "Рабочих подходов за неделю стало меньше — верни прежний объём, прежде чем менять схему.",
        "You're doing fewer working sets per week — bring the volume back before changing the scheme.",
      ),
    });
  }
  if (perWeek > 0 && perWeek < 0.8) {
    advice.push({
      cause: "rare",
      text: L(
        "Упражнение реже раза в неделю — две тренировки с ним в неделю обычно сдвигают вес.",
        "You hit it less than once a week — two sessions a week usually gets the weight moving.",
      ),
    });
  }
  if (weeks >= 8) {
    advice.push({
      cause: "long",
      text: L(
        "Стоит долго — возьми разгрузку: неделя с объёмом на треть меньше, потом заход с 95% рабочего веса.",
        "It's been stuck a while — take a deload: one week at a third less volume, then come back at 95% of your working weight.",
      ),
    });
  }
  if (advice.length === 0) {
    advice.push({
      cause: "flat",
      text: L(
        "Вес и повторы стоят — смени схему: −10% веса и три недели вверх по повторам, либо добавь рабочий подход или вариацию (пауза, темп, другой хват).",
        "Weight and reps are both flat — change the scheme: −10% load and three weeks of adding reps, or add a working set or a variation (pause, tempo, different grip).",
      ),
    });
  }

  return {
    id: exerciseId,
    name: exerciseName(exercises.find((e) => e.id === exerciseId)),
    weeks,
    history,
    stuckWeight,
    stuckReps,
    repsTrend,
    setsTrend,
    perWeek,
    reading,
    advice: advice.slice(0, 3),
  };
}
