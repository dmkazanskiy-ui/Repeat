import * as db from "./db";
import { newId } from "./id";
import { CATALOG } from "./catalog";
import type { IconKey } from "./icons";
import type {
  CardioKind,
  CardioSegment,
  CustomActivity,
  MobilityKind,
  Exercise,
  Session,
  SessionExercise,
  SessionKind,
  WorkoutSet,
} from "./types";

const KEY_SESSIONS = "sessions";
const KEY_CUSTOM = "custom_exercises";
const KEY_CARDIO = "custom_cardio";
const KEY_MOBILITY = "custom_mobility";

export interface AppData {
  sessions: Session[];
  exercises: Exercise[];
  cardioKinds: CustomActivity[];
  mobilityKinds: CustomActivity[];
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
  const [sessions, custom, cardio, mobility] = await Promise.all([
    db.get<Session[]>(KEY_SESSIONS),
    db.get<Exercise[]>(KEY_CUSTOM),
    db.get<Array<CustomActivity | string>>(KEY_CARDIO),
    db.get<CustomActivity[]>(KEY_MOBILITY),
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
