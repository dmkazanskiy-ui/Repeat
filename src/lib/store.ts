import * as db from "./db";
import { newId } from "./id";
import { today } from "./format";
import { seedExercises, SEED_DAY_MAP } from "./exercises";
import type {
  Exercise,
  SplitCode,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from "./types";

const KEY_WORKOUTS = "workouts";
const KEY_EXERCISES = "exercises";

export interface AppData {
  workouts: Workout[];
  exercises: Exercise[];
}

/** Первая загрузка засевает справочник, дальше он живёт своей жизнью. */
export async function load(): Promise<AppData> {
  const [workouts, exercises] = await Promise.all([
    db.get<Workout[]>(KEY_WORKOUTS),
    db.get<Exercise[]>(KEY_EXERCISES),
  ]);

  if (!exercises) {
    const seeded = seedExercises(newId);
    await db.set(KEY_EXERCISES, seeded);
    return { workouts: workouts ?? [], exercises: seeded };
  }

  return { workouts: workouts ?? [], exercises };
}

export function saveWorkouts(workouts: Workout[]): Promise<void> {
  return db.set(KEY_WORKOUTS, workouts);
}

export function saveExercises(exercises: Exercise[]): Promise<void> {
  return db.set(KEY_EXERCISES, exercises);
}

const DEFAULT_SETS = 3;

function makeSet(
  setIndex: number,
  targetWeight: number | null,
  targetReps: number | null,
): WorkoutSet {
  return {
    id: newId(),
    setIndex,
    targetWeight,
    targetReps,
    weight: null,
    reps: null,
    rpe: null,
    isWarmup: false,
    completedAt: null,
  };
}

/** Последняя завершённая тренировка этого же дня сплита — она и есть шаблон. */
export function lastWorkoutOfDay(
  workouts: Workout[],
  code: SplitCode,
): Workout | null {
  const matching = workouts
    .filter((w) => w.splitDayCode === code && w.status === "done")
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return matching[0] ?? null;
}

/**
 * Новая тренировка дня сплита.
 *
 * Если такой день уже делался — план берётся из прошлого раза: фактические
 * веса и повторы становятся целевыми. Это и есть предзаполнение из SPEC.md §2.3,
 * только шаблон не заводится вручную, а вырастает из истории.
 *
 * Если день делается впервые — подставляем заготовку из справочника
 * с пустыми целями, их проще заполнить по ходу, чем выдумывать заранее.
 */
export function buildWorkout(
  code: SplitCode,
  exercises: Exercise[],
  workouts: Workout[],
): Workout {
  const previous = lastWorkoutOfDay(workouts, code);

  const workoutExercises: WorkoutExercise[] = previous
    ? previous.exercises.map((exercise, index) => ({
        id: newId(),
        exerciseId: exercise.exerciseId,
        orderIndex: index,
        notes: null,
        sets: exercise.sets
          .filter((set) => !set.isWarmup)
          .map((set, setIndex) =>
            // Цель на сегодня = что реально сделал в прошлый раз.
            makeSet(setIndex, set.weight ?? set.targetWeight, set.reps ?? set.targetReps),
          ),
      }))
    : SEED_DAY_MAP[code]
        .map((name) => exercises.find((e) => e.name === name))
        .filter((e): e is Exercise => Boolean(e))
        .map((exercise, index) => ({
          id: newId(),
          exerciseId: exercise.id,
          orderIndex: index,
          notes: null,
          sets: Array.from({ length: DEFAULT_SETS }, (_, i) =>
            makeSet(i, null, null),
          ),
        }));

  return {
    id: newId(),
    date: today(),
    splitDayCode: code,
    mesocycleId: null,
    status: "in_progress",
    durationSec: null,
    notes: null,
    exercises: workoutExercises,
  };
}

export function addSet(exercise: WorkoutExercise): WorkoutExercise {
  const last = exercise.sets[exercise.sets.length - 1];
  return {
    ...exercise,
    sets: [
      ...exercise.sets,
      makeSet(
        exercise.sets.length,
        last?.weight ?? last?.targetWeight ?? null,
        last?.reps ?? last?.targetReps ?? null,
      ),
    ],
  };
}

export function addExercise(
  workout: Workout,
  exerciseId: string,
): Workout {
  return {
    ...workout,
    exercises: [
      ...workout.exercises,
      {
        id: newId(),
        exerciseId,
        orderIndex: workout.exercises.length,
        notes: null,
        sets: Array.from({ length: DEFAULT_SETS }, (_, i) => makeSet(i, null, null)),
      },
    ],
  };
}
