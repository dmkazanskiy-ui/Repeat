import { epley, isDone, setVolume } from "../types";
import type { Exercise, Session, SessionExercise, TrainingProgram } from "../types";
import { isWorkingSet } from "./metrics";
import { diffDays } from "./period";

function workingSets(entry: SessionExercise) {
  return entry.sets.filter(isWorkingSet);
}

function bestWorkingE1rm(entry: SessionExercise): number | null {
  let best: number | null = null;
  for (const s of workingSets(entry)) {
    const e = epley(s.weight, s.reps);
    if (e != null && (best == null || e > best)) best = e;
  }
  return best;
}

function bestWorkingWeight(entry: SessionExercise): number | null {
  let best: number | null = null;
  for (const s of workingSets(entry)) {
    if (s.weight != null && (best == null || s.weight > best)) best = s.weight;
  }
  return best;
}

function workingVolumeOf(entry: SessionExercise): number {
  return workingSets(entry).reduce((n, s) => n + setVolume(s), 0);
}

export type DeltaStatus = "up" | "down" | "flat" | "new";

export interface ExerciseDelta {
  exerciseId: string;
  name: string;
  prevE1rm: number | null;
  currE1rm: number | null;
  prevWeight: number | null;
  currWeight: number | null;
  prevVolume: number;
  currVolume: number;
  status: DeltaStatus;
}

export interface WorkoutComparison {
  workoutId: string;
  workoutName: string;
  prevDate: string;
  currDate: string;
  intervalDays: number;
  deload: boolean; // текущая тренировка помечена разгрузочной
  deltas: ExerciseDelta[];
  plannedSets: number;
  actualSets: number;
  missed: string[];
}

function completedOfWorkout(sessions: Session[], workoutId: string): Session[] {
  return sessions
    .filter((s) => s.programWorkoutId === workoutId && isDone(s))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

function statusOf(delta: ExerciseDelta): DeltaStatus {
  const prev = delta.prevE1rm ?? delta.prevWeight;
  const curr = delta.currE1rm ?? delta.currWeight;
  if (prev == null) return "new";
  if (curr == null) return "flat";
  if (curr > prev) return "up";
  if (curr < prev) return "down";
  return "flat";
}

/**
 * Сравнить две последние выполненные тренировки одного дня программы (A→A):
 * изменение e1RM/веса/объёма по упражнениям, план vs факт по подходам и
 * пропущенные упражнения. Снапшот `plan` берётся из текущей сессии, поэтому
 * поздняя правка шаблона не влияет на историю.
 */
function compareSessions(
  prev: Session,
  curr: Session,
  workoutName: string,
  exercises: Exercise[],
): WorkoutComparison {
  const nameOf = (id: string) =>
    exercises.find((e) => e.id === id)?.name ?? "Упражнение";
  const prevById = new Map(prev.exercises.map((e) => [e.exerciseId, e]));

  const deltas: ExerciseDelta[] = curr.exercises.map((entry) => {
    const p = prevById.get(entry.exerciseId);
    const delta: ExerciseDelta = {
      exerciseId: entry.exerciseId,
      name: nameOf(entry.exerciseId),
      prevE1rm: p ? bestWorkingE1rm(p) : null,
      currE1rm: bestWorkingE1rm(entry),
      prevWeight: p ? bestWorkingWeight(p) : null,
      currWeight: bestWorkingWeight(entry),
      prevVolume: p ? workingVolumeOf(p) : 0,
      currVolume: workingVolumeOf(entry),
      status: "flat",
    };
    delta.status = statusOf(delta);
    return delta;
  });

  const plan = curr.plan ?? [];
  const plannedSets = plan.reduce((n, pe) => n + Math.max(0, pe.targetSets || 0), 0);
  const actualSets = curr.exercises.reduce((n, e) => n + workingSets(e).length, 0);
  const missed = plan
    .filter(
      (pe) =>
        !curr.exercises.some(
          (e) => e.plannedExerciseId === pe.id || e.exerciseId === pe.exerciseId,
        ),
    )
    .map((pe) => nameOf(pe.exerciseId));

  return {
    workoutId: curr.programWorkoutId ?? "",
    workoutName,
    prevDate: prev.date,
    currDate: curr.date,
    intervalDays: diffDays(prev.date, curr.date),
    deload: Boolean(curr.deload),
    deltas,
    plannedSets,
    actualSets,
    missed,
  };
}

/** Сравнения A→A по каждому дню активной программы, где есть ≥2 выполненных. */
export function programProgress(
  program: TrainingProgram,
  sessions: Session[],
  exercises: Exercise[],
): WorkoutComparison[] {
  const result: WorkoutComparison[] = [];
  for (const workout of [...program.workouts].sort((a, b) => a.order - b.order)) {
    const done = completedOfWorkout(sessions, workout.id);
    if (done.length < 2) continue;
    const prev = done[done.length - 2];
    const curr = done[done.length - 1];
    result.push(compareSessions(prev, curr, workout.name, exercises));
  }
  return result;
}

/** Средний интервал между одинаковыми тренировками дня, в днях. */
export function averageInterval(sessions: Session[], workoutId: string): number | null {
  const dates = completedOfWorkout(sessions, workoutId).map((s) => s.date);
  if (dates.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < dates.length; i++) sum += diffDays(dates[i - 1], dates[i]);
  return sum / (dates.length - 1);
}
