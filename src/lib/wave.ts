// Волна недель (мезоцикл): лёгкая → средняя → тяжёлая, дальше по кругу.
//
// Смысл: план задаёт КОРИДОР недели (сколько подходов, какие повторы, от какого
// веса плясать), а авторегуляция двигает внутри него. Поэтому вес считается
// не от абстрактных процентов, а от последней недели ТОГО ЖЕ типа: тяжёлая
// сравнивается с прошлой тяжёлой, лёгкая — с лёгкой. Проценты нужны один раз,
// пока такой недели ещё не было, и честно помечаются как ориентир.
//
// Волна идёт по календарю от `startWeek`: пропущенная неделя её не ломает.

import { newId } from "./id";
import { L } from "./i18n";
import { weekStart } from "./analytics/period";
import { isWorkingSet } from "./analytics/metrics";
import { weightIncrement } from "./analytics/autoreg";
import type { DayModifier } from "./analytics/autoreg";
import { diffDays } from "./analytics/period";
import type {
  Exercise,
  ProgramWave,
  ProgramWorkout,
  Session,
  TrainingProgram,
  WeekType,
} from "./types";

/** Шаг округления веса — до ближайших 2,5 кг, как на блинах. */
function roundWeight(value: number): number {
  return Math.round(value / 2.5) * 2.5;
}

/** Волна по умолчанию: лёгкая 2 подхода → средняя 3 → тяжёлая 4. */
export function defaultWave(startDate: string): ProgramWave {
  return {
    startWeek: weekStart(startDate),
    startIndex: 0,
    weeks: [
      {
        id: newId(),
        name: L("Лёгкая", "Light"),
        sets: 2,
        repMin: 8,
        repMax: 10,
        percent: 80,
        light: true,
      },
      { id: newId(), name: L("Средняя", "Medium"), sets: 3, repMin: 6, repMax: 8, percent: 100 },
      { id: newId(), name: L("Тяжёлая", "Heavy"), sets: 4, repMin: 4, repMax: 6, percent: 105 },
    ],
  };
}

/** Индекс типа недели на заданную дату. Отрицательные недели тоже считаются. */
export function waveIndexFor(wave: ProgramWave, date: string): number {
  const n = wave.weeks.length;
  if (n === 0) return 0;
  const weeksPassed = Math.round(diffDays(wave.startWeek, weekStart(date)) / 7);
  return (((wave.startIndex + weeksPassed) % n) + n) % n;
}

/** Тип недели программы на дату (null — волны нет). */
export function currentWeekType(
  program: TrainingProgram,
  date: string,
): WeekType | null {
  const wave = program.wave;
  if (!wave || wave.weeks.length === 0) return null;
  return wave.weeks[waveIndexFor(wave, date)] ?? null;
}

/** Сдвинуть волну так, чтобы на неделе `date` был выбранный тип. */
export function setCurrentWeek(
  wave: ProgramWave,
  date: string,
  index: number,
): ProgramWave {
  return { ...wave, startWeek: weekStart(date), startIndex: index };
}

/** Последняя выполненная тренировка этого дня в неделе того же типа. */
export function lastSameTypeSession(
  sessions: Session[],
  workoutId: string,
  weekTypeId: string,
): Session | null {
  return (
    [...sessions]
      .filter(
        (s) =>
          s.programWorkoutId === workoutId &&
          s.weekType?.id === weekTypeId &&
          Boolean(s.endedAt),
      )
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null
  );
}

/** Самый тяжёлый рабочий вес и повторы упражнения в сессии. */
function performanceOf(session: Session | null, plannedId: string, exerciseId: string) {
  const entry = session?.exercises.find(
    (e) => e.plannedExerciseId === plannedId || e.exerciseId === exerciseId,
  );
  const working = (entry?.sets ?? []).filter(isWorkingSet);
  const weights = working.map((s) => s.weight).filter((w): w is number => w != null);
  const reps = working.map((s) => s.reps).filter((r): r is number => r != null);
  return {
    weight: weights.length ? Math.max(...weights) : null,
    reps,
  };
}

export interface WaveAdjustment {
  plannedExerciseId: string;
  exerciseId: string;
  weight: number | null;
  reps: number | null;
  sets: number;
  /** Прибавка против прошлой такой же недели (для тоста). */
  deltaWeight: number;
  /** Вес взят из процента, а не из истории такой недели — это ориентир. */
  estimate: boolean;
}

export interface WavePlan {
  weekType: WeekType;
  byPlanned: Record<string, WaveAdjustment>;
  headline: string;
  /** Есть ли что показать пользователю (прибавка или ориентир). */
  hasSignal: boolean;
}

export interface WaveInput {
  workout: ProgramWorkout;
  weekType: WeekType;
  /** Прошлый раз этого дня в неделе того же типа. */
  lastSameType: Session | null;
  /** Прошлый раз этого дня вообще — источник ориентира, когда такой недели не было. */
  lastAny: Session | null;
  exercises: Exercise[];
  /** Модуляция дня по готовности: «лёгкий» гасит прибавку и срезает подход. */
  modifier: DayModifier;
}

/**
 * План недели: подходы и повторы из типа недели, вес — от прошлой такой же
 * недели с двойной прогрессией (все подходы взяли верх диапазона → +шаг).
 */
export function wavePlan(input: WaveInput): WavePlan {
  const { workout, weekType, lastSameType, lastAny, exercises, modifier } = input;
  const byPlanned: Record<string, WaveAdjustment> = {};
  let bumps = 0;
  let estimates = 0;

  for (const pe of [...workout.exercises].sort((a, b) => a.order - b.order)) {
    const repMin = weekType.repMin ?? pe.targetRepMin ?? null;
    const repMax = weekType.repMax ?? pe.targetRepMax ?? repMin;
    let sets = pe.waveExempt
      ? Math.max(1, pe.targetSets || 1)
      : Math.max(1, weekType.sets || pe.targetSets || 1);

    const same = performanceOf(lastSameType, pe.id, pe.exerciseId);
    const inc = weightIncrement(pe.exerciseId, exercises);

    let weight: number | null = null;
    let reps: number | null = repMin ?? repMax ?? null;
    let deltaWeight = 0;
    let estimate = false;

    if (same.weight != null) {
      // Прогрессия внутри одинаковых недель: взял верх во всех подходах → +шаг.
      weight = same.weight;
      const allTop =
        repMax != null && same.reps.length > 0 && same.reps.every((r) => r >= repMax);
      if (allTop && modifier !== "easy") {
        weight = same.weight + inc;
        deltaWeight = inc;
      }
    } else {
      // Такой недели ещё не было — берём ориентир в процентах от известного веса.
      const reference =
        performanceOf(lastAny, pe.id, pe.exerciseId).weight ?? pe.targetWeight ?? null;
      if (reference != null) {
        const percent = weekType.percent ?? 100;
        weight = roundWeight((reference * percent) / 100);
        estimate = percent !== 100;
      }
    }

    // Готовность подчиняет себе только прибавку и лишний подход: сам замысел
    // недели (сколько подходов и с какого веса) не отменяется.
    if (modifier === "easy" && sets >= 3) sets -= 1;

    if (deltaWeight > 0) bumps += 1;
    if (estimate) estimates += 1;

    byPlanned[pe.id] = {
      plannedExerciseId: pe.id,
      exerciseId: pe.exerciseId,
      weight,
      reps,
      sets,
      deltaWeight,
      estimate,
    };
  }

  return {
    weekType,
    byPlanned,
    headline: `${weekType.name} · ${weekType.sets} ${L("подх.", "sets")}`,
    hasSignal: bumps > 0 || estimates > 0 || modifier === "easy",
  };
}

/** Короткая сводка для тоста: «Тяжёлая · 4 подх. · +5 кг Присед». */
export function waveToast(plan: WavePlan, exercises: Exercise[]): string {
  const nameOf = (id: string) => exercises.find((e) => e.id === id)?.name ?? "";
  const bumps = Object.values(plan.byPlanned)
    .filter((a) => a.deltaWeight > 0)
    .map((a) => `+${a.deltaWeight} ${L("кг", "kg")} ${nameOf(a.exerciseId)}`.trim());
  const estimate = Object.values(plan.byPlanned).some((a) => a.estimate)
    ? L("вес — ориентир, поправь", "weight is an estimate — adjust it")
    : null;
  return [plan.headline, ...bumps.slice(0, 2), estimate].filter(Boolean).join(" · ");
}
