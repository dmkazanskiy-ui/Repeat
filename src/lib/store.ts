import * as db from "./db";
import { newId } from "./id";
import { nowTime } from "./format";
import { CATALOG } from "./catalog";
import type { IconKey } from "./icons";
import type {
  BodyEntry,
  CardioKind,
  CardioSegment,
  CustomActivity,
  DropStage,
  MobilityKind,
  Exercise,
  PlannedExercise,
  ProgramWorkout,
  ProgressPhoto,
  RecoveryEntry,
  Session,
  SessionExercise,
  SessionKind,
  TrainingProgram,
  WorkoutSet,
} from "./types";

const KEY_SESSIONS = "sessions";
const KEY_CUSTOM = "custom_exercises";
const KEY_CARDIO = "custom_cardio";
const KEY_MOBILITY = "custom_mobility";
const KEY_BODY = "body_entries";
const KEY_PHOTOS = "progress_photos";
const KEY_PROGRAMS = "programs";
const KEY_RECOVERY = "recovery";

export interface AppData {
  sessions: Session[];
  exercises: Exercise[];
  cardioKinds: CustomActivity[];
  mobilityKinds: CustomActivity[];
  bodyEntries: BodyEntry[];
  photos: ProgressPhoto[];
  programs: TrainingProgram[];
  recovery: RecoveryEntry[];
}

/**
 * Базовый справочник живёт в коде, а не в хранилище: так он обновляется
 * вместе с приложением и не требует миграций. В хранилище — только своё.
 */
function baseExercises(): Exercise[] {
  return CATALOG.map((item) => ({
    id: `base:${item.name}`,
    name: item.name,
    muscleGroup: item.muscleGroup,
    custom: false,
  }));
}

export async function load(): Promise<AppData> {
  const [sessions, custom, cardio, mobility, body, photos, programs, recovery] =
    await Promise.all([
      db.get<Session[]>(KEY_SESSIONS),
      db.get<Exercise[]>(KEY_CUSTOM),
      db.get<Array<CustomActivity | string>>(KEY_CARDIO),
      db.get<CustomActivity[]>(KEY_MOBILITY),
      db.get<BodyEntry[]>(KEY_BODY),
      db.get<ProgressPhoto[]>(KEY_PHOTOS),
      db.get<TrainingProgram[]>(KEY_PROGRAMS),
      db.get<RecoveryEntry[]>(KEY_RECOVERY),
    ]);
  return {
    sessions: sessions ?? [],
    exercises: [...baseExercises(), ...(custom ?? [])],
    // Раньше свои виды хранились просто строками — поднимаем их до объекта
    // с иконкой, чтобы уже заведённые виды не пропали.
    cardioKinds: (cardio ?? []).map((item) =>
      typeof item === "string" ? { name: item, icon: "bolt" as const } : item,
    ),
    mobilityKinds: mobility ?? [],
    bodyEntries: body ?? [],
    photos: photos ?? [],
    programs: programs ?? [],
    recovery: recovery ?? [],
  };
}

export function saveSessions(sessions: Session[]): Promise<void> {
  return db.set(KEY_SESSIONS, sessions);
}

export function saveCustomExercises(exercises: Exercise[]): Promise<void> {
  return db.set(
    KEY_CUSTOM,
    exercises.filter((e) => e.custom),
  );
}

export function saveCardioKinds(kinds: CustomActivity[]): Promise<void> {
  return db.set(KEY_CARDIO, kinds);
}

export function saveMobilityKinds(kinds: CustomActivity[]): Promise<void> {
  return db.set(KEY_MOBILITY, kinds);
}

export function saveBodyEntries(entries: BodyEntry[]): Promise<void> {
  return db.set(KEY_BODY, entries);
}

export function savePhotos(photos: ProgressPhoto[]): Promise<void> {
  return db.set(KEY_PHOTOS, photos);
}

export function saveRecovery(entries: RecoveryEntry[]): Promise<void> {
  return db.set(KEY_RECOVERY, entries);
}

export function newRecoveryEntry(date: string): RecoveryEntry {
  return { id: newId(), date, wellbeing: null, sleep: null, freshness: null, motivation: null };
}

export function newBodyEntry(date: string): BodyEntry {
  return {
    id: newId(),
    date,
    weightKg: null,
    chest: null,
    waist: null,
    hips: null,
    biceps: null,
    thigh: null,
    neck: null,
    notes: null,
  };
}

/** Общий идентификатор группы для супер-сета/круговой. */
export function newGroupId(): string {
  return newId();
}

/**
 * Объединить два упражнения в супер-сет. Члены группы должны идти подряд
 * (иначе скобка A1/A2 не соберётся), поэтому всю группу собираем на месте
 * первого её члена. Если источник уже в группе — цель просто добавляется.
 */
export function linkExercises(
  exercises: SessionExercise[],
  sourceId: string,
  targetId: string,
): SessionExercise[] {
  if (sourceId === targetId) return exercises;
  const source = exercises.find((e) => e.id === sourceId);
  if (!exercises.some((e) => e.id === targetId) || !source) return exercises;
  const groupId = source.groupId ?? newGroupId();

  const memberIds = new Set<string>();
  const members: SessionExercise[] = [];
  for (const e of exercises) {
    if (e.groupId === groupId || e.id === sourceId || e.id === targetId) {
      memberIds.add(e.id);
      members.push({ ...e, groupId });
    }
  }

  const result: SessionExercise[] = [];
  let inserted = false;
  for (const e of exercises) {
    if (memberIds.has(e.id)) {
      if (!inserted) {
        result.push(...members);
        inserted = true;
      }
    } else {
      result.push(e);
    }
  }
  return result;
}

/** Разъединить супер-сет — снять groupId со всех его членов. */
export function unlinkGroup(
  exercises: SessionExercise[],
  groupId: string,
): SessionExercise[] {
  return exercises.map((e) =>
    e.groupId === groupId ? { ...e, groupId: null } : e,
  );
}

// ─── Программы A/B/C/D ──────────────────────────────────────────────────────

export function savePrograms(programs: TrainingProgram[]): Promise<void> {
  return db.set(KEY_PROGRAMS, programs);
}

const WORKOUT_LETTERS = ["A", "B", "C", "D", "E", "F", "G"];

export function newProgramWorkout(order: number): ProgramWorkout {
  return {
    id: newId(),
    name: WORKOUT_LETTERS[order] ?? `День ${order + 1}`,
    order,
    exercises: [],
  };
}

export function newProgram(name = "Моя программа"): TrainingProgram {
  return {
    id: newId(),
    name,
    workouts: [newProgramWorkout(0), newProgramWorkout(1)],
    currentWorkoutIndex: 0,
    cycleNumber: 1,
    createdAt: new Date().toISOString(),
    archivedAt: null,
  };
}

export function newPlannedExercise(
  exerciseId: string,
  order: number,
): PlannedExercise {
  return {
    id: newId(),
    exerciseId,
    order,
    targetSets: 3,
    targetRepMin: null,
    targetRepMax: null,
    targetWeight: null,
  };
}

/**
 * Собрать тренировку из шаблона дня программы. Подходы предзаполняются
 * плановыми весами/повторами, но если этот день уже делали — переносятся
 * фактические веса прошлого раза (быстрее, чем вводить заново). Плановые
 * упражнения снапшотятся в `plan`, чтобы правка шаблона не меняла историю.
 */
export function startProgramWorkout(
  program: TrainingProgram,
  workout: ProgramWorkout,
  date: string,
  lastSession?: Session | null,
): Session {
  const exercises: SessionExercise[] = [...workout.exercises]
    .sort((a, b) => a.order - b.order)
    .map((pe) => {
      const prev = lastSession?.exercises.find(
        (e) => e.plannedExerciseId === pe.id || e.exerciseId === pe.exerciseId,
      );
      const count = Math.max(1, pe.targetSets || 1);
      const sets: WorkoutSet[] = Array.from({ length: count }, (_, i) => {
        const prevSet = prev?.sets[i] ?? prev?.sets[(prev?.sets.length ?? 1) - 1];
        return {
          id: newId(),
          weight: prevSet?.weight ?? pe.targetWeight ?? null,
          reps: prevSet?.reps ?? pe.targetRepMin ?? null,
          done: false,
        };
      });
      return {
        id: newId(),
        exerciseId: pe.exerciseId,
        sets,
        notes: pe.note ?? null,
        plannedExerciseId: pe.id,
      };
    });

  return {
    id: newId(),
    date,
    kind: "strength",
    cardioKind: null,
    mobilityKind: null,
    customKind: null,
    icon: null,
    time: nowTime(),
    programId: program.id,
    programWorkoutId: workout.id,
    programCycleNumber: program.cycleNumber,
    plan: workout.exercises.map((e) => ({ ...e })),
    title: workout.name,
    notes: null,
    createdAt: new Date().toISOString(),
    exercises,
    cardio: null,
  };
}

/** Продвинуть цикл на следующую тренировку; на замыкании круга — новый круг. */
export function advanceProgram(program: TrainingProgram): TrainingProgram {
  const n = program.workouts.length || 1;
  const nextIndex = (program.currentWorkoutIndex + 1) % n;
  return {
    ...program,
    currentWorkoutIndex: nextIndex,
    cycleNumber: program.cycleNumber + (nextIndex === 0 ? 1 : 0),
  };
}

/** Последняя выполненная сессия конкретного дня программы — для переноса весов. */
export function lastSessionOfWorkout(
  sessions: Session[],
  workoutId: string,
): Session | null {
  return (
    [...sessions]
      .filter((s) => s.programWorkoutId === workoutId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ?? null
  );
}

export function newSet(previous?: WorkoutSet): WorkoutSet {
  return {
    id: newId(),
    weight: previous?.weight ?? null,
    reps: previous?.reps ?? null,
    done: false,
  };
}

/** Новая ступень дропа наследует вес предыдущей ступени/подхода как ориентир. */
export function newDrop(weight?: number | null): DropStage {
  return { id: newId(), weight: weight ?? null, reps: null };
}

const DEFAULT_SETS = 3;

export function newSessionExercise(exerciseId: string): SessionExercise {
  return {
    id: newId(),
    exerciseId,
    sets: Array.from({ length: DEFAULT_SETS }, () => newSet()),
    notes: null,
  };
}

export function newSession(
  date: string,
  kind: SessionKind,
  options: {
    cardioKind?: CardioKind | null;
    mobilityKind?: MobilityKind | null;
    customKind?: string | null;
    icon?: IconKey | null;
  } = {},
): Session {
  return {
    id: newId(),
    date,
    kind,
    cardioKind: kind === "cardio" ? (options.cardioKind ?? null) : null,
    mobilityKind: kind === "mobility" ? (options.mobilityKind ?? null) : null,
    customKind: options.customKind ?? null,
    icon: options.icon ?? null,
    time: nowTime(),
    title: null,
    notes: null,
    createdAt: new Date().toISOString(),
    exercises: [],
    cardio:
      kind === "cardio"
        ? { durationSec: null, distanceM: null, avgHr: null, segments: [] }
        : null,
  };
}

/** Ключ сортировки внутри дня: явное время старта, иначе — час создания. */
function timeKey(session: Session): string {
  return session.time ?? session.createdAt.slice(11, 16);
}

export function sessionsOn(sessions: Session[], date: string): Session[] {
  return sessions
    .filter((s) => s.date === date)
    .sort((a, b) => {
      const ta = timeKey(a);
      const tb = timeKey(b);
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.createdAt < b.createdAt ? -1 : 1;
    });
}

/** Даты, на которые что-то запланировано или сделано — для точек в календаре. */
export function datesWithSessions(sessions: Session[]): Set<string> {
  return new Set(sessions.map((s) => s.date));
}

/**
 * Скопировать сессию на другую дату — основа планирования наперёд.
 * Веса переносятся как ориентир, отметки «сделано» сбрасываются.
 */
export function newSegment(): CardioSegment {
  return {
    id: newId(),
    repeat: 1,
    distanceM: null,
    durationSec: null,
    restSec: null,
  };
}

export function copySessionTo(session: Session, date: string): Session {
  return {
    ...session,
    id: newId(),
    date,
    createdAt: new Date().toISOString(),
    exercises: session.exercises.map((exercise) => ({
      ...exercise,
      id: newId(),
      sets: exercise.sets.map((set) => ({
        ...set,
        id: newId(),
        done: false,
        drops: set.drops?.map((drop) => ({ ...drop, id: newId() })),
      })),
    })),
    cardio: session.cardio
      ? {
          ...session.cardio,
          segments: session.cardio.segments?.map((s) => ({ ...s, id: newId() })),
        }
      : null,
  };
}
