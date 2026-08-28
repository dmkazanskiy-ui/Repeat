// Доменная модель Repeat.
//
// Главная сущность — «сессия»: одна тренировка в конкретный день.
// В одном дне их может быть сколько угодно (утром бег, вечером зал),
// поэтому календарь строится вокруг сессий, а не вокруг дня.

import type { IconKey } from "./icons";
import { RECOVERY_ICONS, RECOVERY_LABELS } from "./recovery/catalog";
import { findWodPreset } from "./wod/catalog";
import { L } from "./i18n";

export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "legs"
  | "glutes"
  | "arms"
  | "core"
  | "other";

export type SessionKind = "strength" | "cardio" | "mobility" | "recovery" | "wod";

/** Группа восстановительных процедур — для выбора в списке. */
export type RecoveryCategory =
  | "rest"
  | "thermal"
  | "cold"
  | "bodywork"
  | "professional"
  | "other";

/** Конкретная восстановительная процедура. */
export type RecoveryType =
  | "full_rest"
  | "sauna"
  | "banya"
  | "steam"
  | "hot_bath"
  | "cold_plunge"
  | "ice_bath"
  | "cold_shower"
  | "contrast"
  | "massage"
  | "sports_massage"
  | "relax_massage"
  | "lymph_massage"
  | "thai_massage"
  | "spa_ritual"
  | "compression"
  | "physio"
  | "manual_therapy"
  | "other";

/**
 * Как процедура зашла по ощущениям. Это субъективная оценка самой процедуры,
 * а НЕ готовность: в расчёт готовности не идёт и авто-бонуса за «хорошо
 * восстановило» не даёт (Recovery-запись — контекст, а не гарантия).
 */
export type PerceivedEffect =
  | "much_worse"
  | "worse"
  | "no_change"
  | "better"
  | "much_better";

/** Варианты эффекта в порядке от худшего к лучшему, с подписями (геттеры → язык). */
export const PERCEIVED_EFFECTS: ReadonlyArray<{ value: PerceivedEffect; label: string }> = [
  { value: "much_worse", get label() { return L("Хуже", "Worse"); } },
  { value: "worse", get label() { return L("Скорее хуже", "Somewhat worse"); } },
  { value: "no_change", get label() { return L("Без изменений", "No change"); } },
  { value: "better", get label() { return L("Помогло", "Helped"); } },
  { value: "much_better", get label() { return L("Отлично восстановило", "Recovered well"); } },
];

export const PERCEIVED_EFFECT_LABELS: Record<PerceivedEffect, string> = {
  get much_worse() { return L("Хуже", "Worse"); },
  get worse() { return L("Скорее хуже", "Somewhat worse"); },
  get no_change() { return L("Без изменений", "No change"); },
  get better() { return L("Помогло", "Helped"); },
  get much_better() { return L("Отлично восстановило", "Recovered well"); },
};

/** Самочувствие после активности (1–5): выше = больше сил/бодрее (легаси, mood заменил). */
export const AFTER_STATES: ReadonlyArray<{ value: number; label: string; emoji: string }> = [
  { value: 1, get label() { return L("Выжат", "Drained"); }, emoji: "😵" },
  { value: 2, get label() { return L("Устал", "Tired"); }, emoji: "😮‍💨" },
  { value: 3, get label() { return L("Нормально", "Okay"); }, emoji: "🙂" },
  { value: 4, get label() { return L("Бодр", "Energized"); }, emoji: "😃" },
  { value: 5, get label() { return L("Полон сил", "Full of energy"); }, emoji: "🔥" },
];

export const AFTER_STATE_LABELS: Record<number, string> = {
  get 1() { return L("Выжат", "Drained"); },
  get 2() { return L("Устал", "Tired"); },
  get 3() { return L("Нормально", "Okay"); },
  get 4() { return L("Бодр", "Energized"); },
  get 5() { return L("Полон сил", "Full of energy"); },
};

/**
 * Оси mood-карты под контекст: `y` — силы/бодрость (низ→верх), `x` — вторая ось
 * со смыслом под тип активности (лево→право). Валидация смыслом: у каждого
 * контекста свои подписи концов.
 */
export type MoodContext = "strength" | "cardio" | "mobility" | "recovery" | "daily";

export const MOOD_CONTEXTS: Record<
  MoodContext,
  { title: string; y: [string, string]; x: [string, string]; color: string }
> = {
  strength: {
    get title() { return L("Как ты после силовой?", "How do you feel after strength?"); },
    get y() { return [L("Выжат", "Drained"), L("Полон сил", "Energized")] as [string, string]; },
    get x() { return [L("Тяжело далось", "Tough"), L("Легко", "Easy")] as [string, string]; },
    color: "#a78bfa",
  },
  cardio: {
    get title() { return L("Как ты после кардио?", "How do you feel after cardio?"); },
    get y() { return [L("Выжат", "Drained"), L("Бодр", "Fresh")] as [string, string]; },
    get x() { return [L("Загнался", "Gassed"), L("Дышалось легко", "Easy breathing")] as [string, string]; },
    color: "#f472b6",
  },
  mobility: {
    get title() { return L("Как ты после мобилити?", "How do you feel after mobility?"); },
    get y() { return [L("Вялый", "Sluggish"), L("В тонусе", "Toned up")] as [string, string]; },
    get x() { return [L("Зажат", "Tight"), L("Расслаблен", "Loose")] as [string, string]; },
    color: "#4ade80",
  },
  recovery: {
    get title() { return L("Как зашло восстановление?", "How was the recovery?"); },
    get y() { return [L("Не помогло", "Didn't help"), L("Восстановило", "Restored")] as [string, string]; },
    get x() { return [L("Напряжён", "Tense"), L("Расслаблен", "Relaxed")] as [string, string]; },
    color: "#38bdf8",
  },
  daily: {
    get title() { return L("Самочувствие за день", "How you feel today"); },
    get y() { return [L("Нет сил", "No energy"), L("Полон энергии", "Full of energy")] as [string, string]; },
    get x() { return [L("Плохое настроение", "Bad mood"), L("Хорошее", "Good")] as [string, string]; },
    color: "#4ade80",
  },
};

export function moodContextFor(kind: SessionKind): MoodContext {
  if (kind === "recovery") return "recovery";
  if (kind === "cardio") return "cardio";
  if (kind === "mobility") return "mobility";
  return "strength";
}

/** Короткое качественное чтение точки: «скорее {ось-y} · {ось-x}». */
export function moodReading(ctx: MoodContext, mood: { x: number; y: number }): string {
  const c = MOOD_CONTEXTS[ctx];
  const word = (v: number, ends: [string, string]) =>
    v >= 0.62 ? ends[1].toLowerCase() : v <= 0.38 ? ends[0].toLowerCase() : null;
  const yw = word(mood.y, c.y);
  const xw = word(mood.x, c.x);
  const parts = [yw, xw].filter(Boolean);
  return parts.length ? parts.join(" · ") : L("нейтрально", "neutral");
}

/**
 * Задание с фиксированным результатом: кроссфит-WOD, HYROX-гонка или станция.
 * Модель намеренно плоская — движения храним текстом схемы, а не разбираем в
 * упражнения: ценность здесь в СРАВНИМОМ результате одного и того же задания,
 * а не в тоннаже. Сравнение попыток идёт по `presetId` (у своих — по имени).
 */
export type WodScore = "for_time" | "amrap" | "emom";

export interface WodData {
  /** Ключ из каталога — по нему сравниваем попытки. Своё задание — null. */
  presetId: string | null;
  /** Схема: «21-15-9 трастеры 43 кг / подтягивания». */
  scheme: string | null;
  score: WodScore;
  /** Лимит времени, сек (для for_time) или окно AMRAP/EMOM. */
  capSec?: number | null;
  /** Результат «на время», сек. */
  timeSec?: number | null;
  /** Результат AMRAP/EMOM: полные раунды и добитые повторы. */
  rounds?: number | null;
  reps?: number | null;
  /** Выполнено как предписано (Rx) или с масштабированием. */
  rx?: boolean;
  /** Не уложился в лимит — результат считается по лимиту. */
  capped?: boolean;
}

/**
 * Данные записи восстановления. Держим намеренно минимальными: тип процедуры,
 * длительность, заметка и субъективный эффект. Готовность живёт в отдельном
 * суточном чек-ине (RecoveryEntry) — не плодим две модели состояния.
 */
export interface RecoveryData {
  type: RecoveryType;
  durationMin?: number | null;
  note?: string | null;
  /** Как зашло по ощущениям — качественная обратная связь к процедуре. */
  effect?: PerceivedEffect | null;
}

export type CardioKind =
  | "run"
  | "bike"
  | "swim"
  | "treadmill" // ходьба на дорожке (исторический ключ, поэтому старые данные читаются)
  | "treadmill_run" // бег на дорожке
  | "elliptical"
  | "stairs"
  | "hiit"; // интервальный HIIT (создаётся через таймер, не обычный редактор)

export type MobilityKind =
  | "yoga"
  | "lfk"
  | "stretching"
  | "meditation"
  | "breathing"
  | "foam_rolling";

/** Субъективная тяжесть тренировки — заносится вручную, питает аналитику нагрузки. */
export type SessionIntensity = "easy" | "medium" | "hard";

export interface Exercise {
  id: string;
  /** Каноничное (русское) имя — по нему матчит классификатор мышц и id `base:`. */
  name: string;
  /** Английское имя каталожного упражнения (у своих — нет). */
  nameEn?: string | null;
  muscleGroup: MuscleGroup;
  /** Своё упражнение пользователя — его можно удалить, базовое нельзя. */
  custom: boolean;
}

/** Имя упражнения для показа: EN у каталожных при en-языке, иначе — как есть. */
export function exerciseName(ex: { name: string; nameEn?: string | null } | undefined): string {
  if (!ex) return L("Упражнение", "Exercise");
  return L("ru", "en") === "en" && ex.nameEn ? ex.nameEn : ex.name;
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
  /** Связь с плановым упражнением программы (план ⇄ факт). */
  plannedExerciseId?: string | null;
}

/** Плановое упражнение в шаблоне тренировки программы. */
export interface PlannedExercise {
  id: string;
  exerciseId: string;
  order: number;
  targetSets: number;
  targetRepMin?: number | null;
  targetRepMax?: number | null;
  targetWeight?: number | null;
  targetRir?: number | null;
  restSeconds?: number | null;
  note?: string | null;
}

/** Тренировка-день программы (A/B/C/D или своё название). */
export interface ProgramWorkout {
  id: string;
  name: string;
  order: number;
  exercises: PlannedExercise[];
}

/**
 * Программа-сплит: вращающийся цикл из 2–7 тренировок. Сплит не привязан к
 * дням недели — крутится по кругу (SPEC §2.4).
 */
export interface TrainingProgram {
  id: string;
  name: string;
  /** Короткое описание программы (для чего она, как устроена). */
  description?: string | null;
  workouts: ProgramWorkout[];
  /** Индекс следующей тренировки цикла. */
  currentWorkoutIndex: number;
  /** Сколько полных кругов пройдено. */
  cycleNumber: number;
  createdAt: string;
  archivedAt?: string | null;
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
  /** Наклон дорожки в градусах (только для беговой дорожки). */
  inclineDeg?: number | null;
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
  /** Связь с программой: из какой программы и какой её тренировки начата. */
  programId?: string | null;
  programWorkoutId?: string | null;
  programCycleNumber?: number | null;
  /** Снапшот плановых упражнений на момент старта — история не меняется
      при последующей правке шаблона программы. */
  plan?: PlannedExercise[] | null;
  /** Разгрузочная неделя — из подсчёта плато и baseline исключается. */
  deload?: boolean;
  /** Субъективная тяжесть тренировки (легко/средне/тяжело). */
  intensity?: SessionIntensity | null;
  /**
   * Устаревшее одномерное самочувствие (1–5). Оставлено для чтения старых
   * записей; новые пишут `mood`. Читать единообразно через `perceivedFeel`.
   */
  afterState?: number | null;
  /**
   * Самочувствие после активности точкой на 2D-карте (обе оси 0–1). Ось `y` —
   * силы/бодрость (выше = лучше, идёт в готовность), `x` — контекстная вторая
   * ось (см. `MOOD_CONTEXTS`). У восстановления ту же роль играет `recovery.effect`.
   */
  mood?: { x: number; y: number } | null;
  /** Момент нажатия «Начать» (ISO). Пока идёт — тикает таймер. */
  startedAt?: string | null;
  /** Момент нажатия «Завершить» (ISO). Есть — тренировка закрыта и read-only. */
  endedAt?: string | null;
  /** Накопленное время на паузе, мс. Вычитается из длительности. */
  pausedMs?: number | null;
  /** Момент постановки на паузу (ISO). Есть — тренировка сейчас на паузе. */
  pausedAt?: string | null;
  /** Средний пульс за тренировку, введённый вручную при завершении. */
  avgHr?: number | null;
  /** Только для kind === "recovery": процедура, длительность, заметка. */
  recovery?: RecoveryData | null;
  /** Только для kind === "wod": задание и его результат. */
  wod?: WodData | null;
  title: string | null;
  notes: string | null;
  createdAt: string; // ISO
  exercises: SessionExercise[];
  cardio: CardioData | null;
}

// Лейблы — геттеры, чтобы `X[key]` возвращал строку на текущем языке
// динамически (без правки мест использования по всему приложению).
export const SESSION_LABELS: Record<SessionKind, string> = {
  get strength() { return L("Силовая", "Strength"); },
  get cardio() { return L("Кардио", "Cardio"); },
  get mobility() { return L("Мобилити", "Mobility"); },
  get recovery() { return L("Восстановление", "Recovery"); },
  get wod() { return L("Задание", "Workout"); },
};

export const WOD_SCORE_LABELS: Record<WodScore, string> = {
  get for_time() { return L("На время", "For time"); },
  get amrap() { return L("AMRAP", "AMRAP"); },
  get emom() { return L("EMOM", "EMOM"); },
};

export const CARDIO_LABELS: Record<CardioKind, string> = {
  get run() { return L("Бег", "Running"); },
  get bike() { return L("Велосипед", "Cycling"); },
  get swim() { return L("Плавание", "Swimming"); },
  get treadmill() { return L("Ходьба на дорожке", "Treadmill walk"); },
  get treadmill_run() { return L("Бег на дорожке", "Treadmill run"); },
  get elliptical() { return L("Эллипс", "Elliptical"); },
  get stairs() { return L("Ступеньки", "Stairs"); },
  get hiit() { return L("HIIT", "HIIT"); },
};

export const CARDIO_ICONS: Record<CardioKind, IconKey> = {
  run: "run",
  bike: "bike",
  swim: "swim",
  treadmill: "walk",
  treadmill_run: "run",
  elliptical: "nordic",
  stairs: "stairs",
  hiit: "bolt",
};

/** Виды с наклоном дорожки (в градусах). */
export function hasIncline(kind: CardioKind | null | undefined): boolean {
  return kind === "treadmill" || kind === "treadmill_run";
}

export const MOBILITY_LABELS: Record<MobilityKind, string> = {
  get yoga() { return L("Йога", "Yoga"); },
  get lfk() { return L("ЛФК", "Rehab"); },
  get stretching() { return L("Стретчинг", "Stretching"); },
  get meditation() { return L("Медитация", "Meditation"); },
  get breathing() { return L("Дыхание", "Breathing"); },
  get foam_rolling() { return L("Массажный ролл", "Foam rolling"); },
};

export const MOBILITY_ICONS: Record<MobilityKind, IconKey> = {
  yoga: "yoga",
  lfk: "body",
  stretching: "stretch",
  meditation: "spa",
  breathing: "spa",
  foam_rolling: "healing",
};

export const INTENSITY_LABELS: Record<SessionIntensity, string> = {
  get easy() { return L("Легко", "Easy"); },
  get medium() { return L("Средне", "Medium"); },
  get hard() { return L("Тяжело", "Hard"); },
};

/** Подписи тяжести в порядке от лёгкой к тяжёлой (label читается с текущего языка). */
export const INTENSITY_OPTIONS = [
  { value: "easy", get label() { return INTENSITY_LABELS.easy; } },
  { value: "medium", get label() { return INTENSITY_LABELS.medium; } },
  { value: "hard", get label() { return INTENSITY_LABELS.hard; } },
] as ReadonlyArray<{ value: SessionIntensity; label: string }>;

/** У плавания дистанция удобнее в метрах, у остального — в километрах. */
export function distanceUnit(kind: CardioKind | null): string {
  return kind === "swim" ? L("м", "m") : L("км", "km");
}

/** Название вида: своё важнее готового. */
export function activityLabel(session: Session): string | null {
  if (session.kind === "recovery" && session.recovery) {
    return RECOVERY_LABELS[session.recovery.type];
  }
  if (session.kind === "wod") {
    return findWodPreset(session.wod?.presetId)?.name ?? null;
  }
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
  if (session.kind === "recovery") {
    return session.recovery ? RECOVERY_ICONS[session.recovery.type] : "spa";
  }
  if (session.kind === "wod") {
    return findWodPreset(session.wod?.presetId)?.icon ?? "timer";
  }
  if (session.customKind) return session.icon ?? "bolt";
  if (session.kind === "cardio" && session.cardioKind) {
    return CARDIO_ICONS[session.cardioKind];
  }
  if (session.kind === "mobility") {
    return session.mobilityKind ? MOBILITY_ICONS[session.mobilityKind] : "yoga";
  }
  return "gym";
}

/** Длительность записи восстановления в секундах (для единого форматирования). */
export function recoveryDurationSec(session: Session): number | null {
  const min = session.recovery?.durationMin;
  return min && min > 0 ? min * 60 : null;
}

/**
 * Тренировочная ли это сессия. Восстановление — не тренировка: в объём,
 * счётчики тренировок, силовую и мышечную аналитику оно не входит.
 */
export function isTrainingSession(session: Session): boolean {
  return session.kind !== "recovery";
}

/**
 * Единое субъективное самочувствие после активности, 0–1 (выше = лучше).
 * Для силовой/кардио/мобилити — из `afterState` (1–5), для восстановления — из
 * `recovery.effect`. Так готовность и аналитика читают один сигнал со всех видов.
 */
export function perceivedFeel(session: Session): number | null {
  if (session.mood) return session.mood.y; // ось силы/бодрости, 0–1
  if (session.kind === "recovery") {
    const eff = session.recovery?.effect; // старые записи восстановления
    if (!eff) return null;
    const idx = PERCEIVED_EFFECTS.findIndex((e) => e.value === eff);
    return idx < 0 ? null : idx / (PERCEIVED_EFFECTS.length - 1);
  }
  const v = session.afterState; // старые тренировки
  return v == null ? null : (v - 1) / 4;
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

/**
 * Тоннаж упражнения — сумма по рабочим подходам (разминка не в счёт).
 * `doneOnly` — считать только отмеченные выполненными (честный тоннаж).
 */
export function exerciseVolume(exercise: SessionExercise, doneOnly = false): number {
  return exercise.sets.reduce((total, set) => {
    if (set.warmup) return total;
    if (doneOnly && !set.done) return total;
    return total + setVolume(set);
  }, 0);
}

/**
 * Считать ли тоннаж только по выполненным подходам. Идущая тренировка — да
 * (растёт по мере отметок). Завершённая — да, если хоть один подход отмечен;
 * если ни одного (старые данные без галочек) — считаем все, чтобы не обнулить.
 */
export function countsDoneOnly(session: Session): boolean {
  if (!session.endedAt) return true;
  return session.exercises.some((ex) => ex.sets.some((s) => s.done));
}

/** Тоннаж всей силовой — честный, по выполненным подходам. */
export function sessionVolume(session: Session): number {
  const doneOnly = countsDoneOnly(session);
  return session.exercises.reduce((total, ex) => total + exerciseVolume(ex, doneOnly), 0);
}

/** Сколько всего подходов в силовой (дропы не считаем отдельными подходами). */
export function sessionSetCount(session: Session): number {
  return session.exercises.reduce((total, ex) => total + ex.sets.length, 0);
}

/** Сколько подходов отмечено выполненными. */
export function sessionDoneSetCount(session: Session): number {
  return session.exercises.reduce(
    (total, ex) => total + ex.sets.filter((s) => s.done).length,
    0,
  );
}

/** Тренировка закрыта: нажали «Завершить». Такую показываем read-only. */
export function isDone(session: Session): boolean {
  return Boolean(session.endedAt);
}

/**
 * Пустая недоделанная тренировка — открыли «потыкать» и вышли, ничего не внеся.
 * Такую при выходе выбрасываем, чтобы не висела в дне. Кардио/мобилити/
 * восстановление создаются с выбранным видом (уже намерение) — не трогаем.
 */
export function isDiscardableSession(session: Session): boolean {
  if (session.kind !== "strength") return false;
  if (session.startedAt || session.endedAt) return false;
  if (session.title && session.title.trim()) return false;
  return session.exercises.length === 0;
}

/**
 * Длительность тренировки в секундах: по таймеру (старт→финиш), а если
 * его не запускали — из времени кардио. Иначе неизвестна.
 */
export function sessionDurationSec(session: Session): number | null {
  if (session.startedAt && session.endedAt) {
    const ms =
      Date.parse(session.endedAt) - Date.parse(session.startedAt) - (session.pausedMs ?? 0);
    if (ms > 0) return Math.round(ms / 1000);
  }
  if (session.kind === "cardio") return session.cardio?.durationSec ?? null;
  return null;
}

/**
 * Текущая длительность идущей тренировки в секундах (с учётом пауз). Если сейчас
 * на паузе — время застыло на моменте паузы. `nowMs` — текущее время из тика.
 */
export function liveElapsedSec(session: Session, nowMs: number): number {
  if (!session.startedAt) return 0;
  const end = session.pausedAt ? Date.parse(session.pausedAt) : nowMs;
  const ms = end - Date.parse(session.startedAt) - (session.pausedMs ?? 0);
  return Math.max(0, Math.round(ms / 1000));
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

/**
 * Субъективный чек-ин самочувствия. Все шкалы 1–5 в единой ориентации
 * «выше = лучше» (свежесть мышц вместо забитости) — чтобы среднее честно
 * означало готовность. Любое поле может пустовать.
 */
export interface RecoveryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  wellbeing: number | null; // самочувствие
  sleep: number | null; // сон
  freshness: number | null; // свежесть мышц (1 забиты … 5 свежие)
  motivation: number | null; // желание тренироваться
  /** Точка на mood-карте (энергия × настроение, 0–1). Новый способ ввода. */
  mood?: { x: number; y: number } | null;
}

/** Поля чек-ина в порядке показа. */
export const RECOVERY_METRICS = [
  { key: "wellbeing", label: "Самочувствие" },
  { key: "sleep", label: "Сон" },
  { key: "freshness", label: "Свежесть мышц" },
  { key: "motivation", label: "Желание тренироваться" },
] as const satisfies ReadonlyArray<{ key: keyof RecoveryEntry; label: string }>;

/**
 * Готовность из чек-ина по шкале 1–5. Новый ввод — точка на mood-карте (ось
 * `y` энергия → 1–5); старые записи — среднее 4 шкал. null, если ничего нет.
 */
export function recoveryAverage(entry: RecoveryEntry): number | null {
  if (entry.mood) return entry.mood.y * 4 + 1; // 0–1 → 1–5
  const values = [entry.wellbeing, entry.sleep, entry.freshness, entry.motivation].filter(
    (v): v is number => v != null,
  );
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
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
