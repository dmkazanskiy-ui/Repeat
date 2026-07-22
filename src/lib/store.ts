import * as db from "./db";
import { newId } from "./id";
import { CATALOG } from "./catalog";
import type {
  CardioKind,
  Exercise,
  Session,
  SessionExercise,
  SessionKind,
  WorkoutSet,
} from "./types";

const KEY_SESSIONS = "sessions";
const KEY_CUSTOM = "custom_exercises";

export interface AppData {
  sessions: Session[];
  exercises: Exercise[];
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
  const [sessions, custom] = await Promise.all([
    db.get<Session[]>(KEY_SESSIONS),
    db.get<Exercise[]>(KEY_CUSTOM),
  ]);
  return {
    sessions: sessions ?? [],
    exercises: [...baseExercises(), ...(custom ?? [])],
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

export function newSet(previous?: WorkoutSet): WorkoutSet {
  return {
    id: newId(),
    weight: previous?.weight ?? null,
    reps: previous?.reps ?? null,
    done: false,
  };
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
  cardioKind: CardioKind | null,
): Session {
  return {
    id: newId(),
    date,
    kind,
    cardioKind: kind === "cardio" ? cardioKind : null,
    title: null,
    notes: null,
    createdAt: new Date().toISOString(),
    exercises: [],
    cardio: kind === "cardio" ? { durationSec: null, distanceM: null, avgHr: null } : null,
  };
}

export function sessionsOn(sessions: Session[], date: string): Session[] {
  return sessions
    .filter((s) => s.date === date)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

/** Даты, на которые что-то запланировано или сделано — для точек в календаре. */
export function datesWithSessions(sessions: Session[]): Set<string> {
  return new Set(sessions.map((s) => s.date));
}

/**
 * Скопировать сессию на другую дату — основа планирования наперёд.
 * Веса переносятся как ориентир, отметки «сделано» сбрасываются.
 */
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
      })),
    })),
    cardio: session.cardio ? { ...session.cardio } : null,
  };
}
