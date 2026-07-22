// Доменная модель Repeat.
//
// Главная сущность — «сессия»: одна тренировка в конкретный день.
// В одном дне их может быть сколько угодно (утром бег, вечером зал),
// поэтому календарь строится вокруг сессий, а не вокруг дня.

export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "legs"
  | "glutes"
  | "arms"
  | "core"
  | "other";

export type SessionKind = "strength" | "cardio" | "mobility";

export type CardioKind =
  | "run"
  | "bike"
  | "swim"
  | "treadmill"
  | "elliptical"
  | "stairs";

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  /** Своё упражнение пользователя — его можно удалить, базовое нельзя. */
  custom: boolean;
}

/**
 * Подход. Плановых и фактических значений больше нет: сессия просто
 * сохраняется и в любой момент правится — «завершения» не существует.
 */
export interface WorkoutSet {
  id: string;
  weight: number | null;
  reps: number | null;
  done: boolean;
}

export interface SessionExercise {
  id: string;
  exerciseId: string;
  sets: WorkoutSet[];
  notes: string | null;
}

export interface CardioData {
  durationSec: number | null;
  distanceM: number | null;
  avgHr: number | null;
}

export interface Session {
  id: string;
  date: string; // YYYY-MM-DD
  kind: SessionKind;
  /** Только для kind === "cardio". */
  cardioKind: CardioKind | null;
  title: string | null;
  notes: string | null;
  createdAt: string; // ISO
  exercises: SessionExercise[];
  cardio: CardioData | null;
}

export const SESSION_LABELS: Record<SessionKind, string> = {
  strength: "Силовая",
  cardio: "Кардио",
  mobility: "Мобилити",
};

export const CARDIO_LABELS: Record<CardioKind, string> = {
  run: "Бег",
  bike: "Велосипед",
  swim: "Плавание",
  treadmill: "Дорожка",
  elliptical: "Эллипс",
  stairs: "Ступеньки",
};

/** У плавания дистанция удобнее в метрах, у остального — в километрах. */
export function distanceUnit(kind: CardioKind | null): "м" | "км" {
  return kind === "swim" ? "м" : "км";
}
