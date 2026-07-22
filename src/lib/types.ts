// Доменная модель Repeat.
//
// Главная сущность — «сессия»: одна тренировка в конкретный день.
// В одном дне их может быть сколько угодно (утром бег, вечером зал),
// поэтому календарь строится вокруг сессий, а не вокруг дня.

import type { IconKey } from "./icons";

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

export type MobilityKind = "yoga" | "lfk" | "stretching" | "meditation";

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  /** Своё упражнение пользователя — его можно удалить, базовое нельзя. */
  custom: boolean;
}

/** Свой вид кардио или мобилити, заведённый пользователем. */
export interface CustomActivity {
  name: string;
  icon: IconKey;
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

/**
 * Интервал в кардио: блок работы, повторённый `repeat` раз, с отдыхом
 * между повторами. «10 × 400 м через 90 с» — это одна строка, а не десять.
 */
export interface CardioSegment {
  id: string;
  repeat: number;
  distanceM: number | null;
  durationSec: number | null;
  restSec: number | null;
}

export interface CardioData {
  durationSec: number | null;
  distanceM: number | null;
  avgHr: number | null;
  segments?: CardioSegment[];
}

export interface Session {
  id: string;
  date: string; // YYYY-MM-DD
  kind: SessionKind;
  /** Только для kind === "cardio". */
  cardioKind: CardioKind | null;
  /** Только для kind === "mobility". */
  mobilityKind?: MobilityKind | null;
  /** Свой вид вместо готового — например «Гребля» или «Цигун». */
  customKind?: string | null;
  /** Иконка своего вида. У готовых видов иконка зашита в код. */
  icon?: IconKey | null;
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

export const CARDIO_ICONS: Record<CardioKind, IconKey> = {
  run: "run",
  bike: "bike",
  swim: "swim",
  treadmill: "walk",
  elliptical: "nordic",
  stairs: "stairs",
};

export const MOBILITY_LABELS: Record<MobilityKind, string> = {
  yoga: "Йога",
  lfk: "ЛФК",
  stretching: "Стретчинг",
  meditation: "Медитация",
};

export const MOBILITY_ICONS: Record<MobilityKind, IconKey> = {
  yoga: "yoga",
  lfk: "body",
  stretching: "stretch",
  meditation: "spa",
};

/** У плавания дистанция удобнее в метрах, у остального — в километрах. */
export function distanceUnit(kind: CardioKind | null): "м" | "км" {
  return kind === "swim" ? "м" : "км";
}

/** Название вида: своё важнее готового. */
export function activityLabel(session: Session): string | null {
  if (session.customKind) return session.customKind;
  if (session.kind === "cardio" && session.cardioKind) {
    return CARDIO_LABELS[session.cardioKind];
  }
  if (session.kind === "mobility" && session.mobilityKind) {
    return MOBILITY_LABELS[session.mobilityKind];
  }
  return null;
}

/** Иконка карточки: у своих видов из данных, у готовых — из таблицы. */
export function activityIcon(session: Session): IconKey {
  if (session.customKind) return session.icon ?? "bolt";
  if (session.kind === "cardio" && session.cardioKind) {
    return CARDIO_ICONS[session.cardioKind];
  }
  if (session.kind === "mobility") {
    return session.mobilityKind ? MOBILITY_ICONS[session.mobilityKind] : "yoga";
  }
  return "gym";
}

/** Суммарные дистанция и время интервалов с учётом повторов. */
export function segmentTotals(segments: CardioSegment[] | undefined): {
  distanceM: number;
  durationSec: number;
} {
  if (!segments?.length) return { distanceM: 0, durationSec: 0 };
  return segments.reduce(
    (acc, segment) => {
      const repeat = Math.max(1, segment.repeat || 1);
      return {
        distanceM: acc.distanceM + (segment.distanceM ?? 0) * repeat,
        // Отдых между повторами считается (repeat - 1) раз, а не repeat:
        // после последнего повтора отдыхать уже незачем.
        durationSec:
          acc.durationSec +
          (segment.durationSec ?? 0) * repeat +
          (segment.restSec ?? 0) * Math.max(0, repeat - 1),
      };
    },
    { distanceM: 0, durationSec: 0 },
  );
}
