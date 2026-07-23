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
 * Ступень дроп-сета: сразу после основного подхода вес сбрасывается
 * и работа продолжается без отдыха. «85×5 → 70×6 → 55×8» — это один
 * подход с двумя ступенями сброса, а не три отдельных подхода.
 */
export interface DropStage {
  id: string;
  weight: number | null;
  reps: number | null;
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
  /** Ступени сброса веса внутри этого же подхода (дроп-сет). */
  drops?: DropStage[];
  /**
   * Разминочный подход. В рабочий объём и тоннаж аналитики не идёт.
   * Отсутствие/false — рабочий подход. Пометку задаёт пользователь; пока
   * UI-переключателя нет, поле заложено для аналитики и будущей отметки.
   */
  warmup?: boolean;
}

export interface SessionExercise {
  id: string;
  exerciseId: string;
  sets: WorkoutSet[];
  notes: string | null;
  /**
   * Упражнения с одинаковым `groupId` — супер-сет или круговая: их делают
   * без отдыха по кругу. Рисуются связанными скобкой A1/A2. `null` —
   * обычное самостоятельное упражнение.
   */
  groupId?: string | null;
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
  /** Время начала тренировки, «HH:MM». Раскладывает день по времени:
      «Бег 6:00 · Вел 8:00 · Плавание 9:00». Можно поправить вручную. */
  time?: string | null;
  /** Момент нажатия «Начать» (ISO). Пока идёт — тикает таймер. */
  startedAt?: string | null;
  /** Момент нажатия «Завершить» (ISO). Есть — тренировка закрыта и read-only. */
  endedAt?: string | null;
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

/**
 * Тоннаж подхода: вес × повторы плюс то же по каждой ступени дропа.
 * Пустые значения считаем нулём, чтобы недозаполненный подход не ломал сумму.
 */
export function setVolume(set: WorkoutSet): number {
  let volume = (set.weight ?? 0) * (set.reps ?? 0);
  for (const drop of set.drops ?? []) {
    volume += (drop.weight ?? 0) * (drop.reps ?? 0);
  }
  return volume;
}

/** Тоннаж упражнения — сумма по всем его подходам. */
export function exerciseVolume(exercise: SessionExercise): number {
  return exercise.sets.reduce((total, set) => total + setVolume(set), 0);
}

/** Тоннаж всей силовой тренировки. */
export function sessionVolume(session: Session): number {
  return session.exercises.reduce((total, ex) => total + exerciseVolume(ex), 0);
}

/** Сколько всего подходов в силовой (дропы не считаем отдельными подходами). */
export function sessionSetCount(session: Session): number {
  return session.exercises.reduce((total, ex) => total + ex.sets.length, 0);
}

/** Тренировка закрыта: нажали «Завершить». Такую показываем read-only. */
export function isDone(session: Session): boolean {
  return Boolean(session.endedAt);
}

/**
 * Длительность тренировки в секундах: по таймеру (старт→финиш), а если
 * его не запускали — из времени кардио. Иначе неизвестна.
 */
export function sessionDurationSec(session: Session): number | null {
  if (session.startedAt && session.endedAt) {
    const ms = Date.parse(session.endedAt) - Date.parse(session.startedAt);
    if (ms > 0) return Math.round(ms / 1000);
  }
  if (session.kind === "cardio") return session.cardio?.durationSec ?? null;
  return null;
}

/**
 * Расчётный разовый максимум по Эпли: вес × (1 + повторы/30). Формула
 * завирает на высоких повторах, поэтому подходы больше 12 в тренд не берём
 * (SPEC §5.1). Недозаполненный подход даёт null.
 */
export function epley(weight: number | null, reps: number | null): number | null {
  if (!weight || !reps || reps > 12) return null;
  return weight * (1 + reps / 30);
}

/** Лучший e1RM упражнения в тренировке — по верхним подходам. */
export function bestE1rm(exercise: SessionExercise): number | null {
  let best: number | null = null;
  for (const set of exercise.sets) {
    const value = epley(set.weight, set.reps);
    if (value != null && (best == null || value > best)) best = value;
  }
  return best;
}

/**
 * Упражнения, сгруппированные для рендера: подряд идущие с одним groupId
 * собираются в один блок (супер-сет). Одиночные — блок из одного элемента.
 */
export function groupExercises(
  exercises: SessionExercise[],
): SessionExercise[][] {
  const groups: SessionExercise[][] = [];
  for (const ex of exercises) {
    const last = groups[groups.length - 1];
    if (ex.groupId && last && last[0].groupId === ex.groupId) {
      last.push(ex);
    } else {
      groups.push([ex]);
    }
  }
  return groups;
}

/** Один замер тела: вес и обхваты в сантиметрах. Любое поле может пустовать. */
export interface BodyEntry {
  id: string;
  date: string; // YYYY-MM-DD
  weightKg: number | null;
  chest: number | null;
  waist: number | null;
  hips: number | null;
  biceps: number | null;
  thigh: number | null;
  neck: number | null;
  notes: string | null;
}

/** Поля замеров в порядке показа: ключ, подпись, единица. */
export const BODY_METRICS = [
  { key: "weightKg", label: "Вес", unit: "кг" },
  { key: "chest", label: "Грудь", unit: "см" },
  { key: "waist", label: "Талия", unit: "см" },
  { key: "hips", label: "Бёдра", unit: "см" },
  { key: "biceps", label: "Бицепс", unit: "см" },
  { key: "thigh", label: "Бедро", unit: "см" },
  { key: "neck", label: "Шея", unit: "см" },
] as const satisfies ReadonlyArray<{
  key: keyof BodyEntry;
  label: string;
  unit: string;
}>;

/** Фото прогресса. Картинка лежит как dataURL прямо в IndexedDB. */
export interface ProgressPhoto {
  id: string;
  date: string; // YYYY-MM-DD
  dataUrl: string;
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
