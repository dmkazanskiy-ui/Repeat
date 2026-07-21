// Доменная модель Repeat. Зеркалит схему из SPEC.md §4 —
// при правках держать оба места в согласии.

export type SplitCode = "A" | "B" | "C" | "D";

export type MesocycleGoal =
  | "accumulation" // накопление объёма
  | "intensification"
  | "deload"
  | "peak";

export type TrackingType =
  | "weight_reps" // штанга, гантели, тренажёры
  | "bodyweight_reps" // подтягивания, отжимания
  | "time" // планка, вис
  | "distance";

export type MuscleGroup =
  | "back"
  | "chest"
  | "shoulders"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "biceps"
  | "triceps"
  | "core";

export interface Exercise {
  id: string;
  name: string;
  /** Синонимы для разбора ввода: «жим», «жим лёжа», «скамья». */
  aliases: string[];
  muscleGroup: MuscleGroup;
  trackingType: TrackingType;
}

export interface SplitDay {
  code: SplitCode;
  title: string;
  /** Порядок в цикле; следующий день считается по нему, а не по календарю. */
  orderIndex: number;
  muscleGroups: MuscleGroup[];
}

export interface Mesocycle {
  id: string;
  name: string;
  goal: MesocycleGoal;
  startDate: string; // YYYY-MM-DD
  endDate: string | null;
}

/**
 * Один подход. Плановые и фактические значения живут рядом:
 * план предзаполняет факт, поэтому «сделал как задумано» — это один тап.
 */
export interface WorkoutSet {
  id: string;
  setIndex: number;
  targetWeight: number | null;
  targetReps: number | null;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  isWarmup: boolean;
  completedAt: string | null; // ISO
}

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  orderIndex: number;
  notes: string | null;
  sets: WorkoutSet[];
}

export type WorkoutStatus = "planned" | "in_progress" | "done";

export interface Workout {
  id: string;
  date: string; // YYYY-MM-DD
  splitDayCode: SplitCode;
  mesocycleId: string | null;
  status: WorkoutStatus;
  durationSec: number | null;
  notes: string | null;
  exercises: WorkoutExercise[];
}

export type CardioType = "run" | "bike" | "swim";
export type EntrySource = "manual" | "text" | "screenshot" | "voice";

export interface CardioActivity {
  id: string;
  type: CardioType;
  date: string;
  durationSec: number;
  distanceM: number | null;
  avgHr: number | null;
  maxHr: number | null;
  elevationM: number | null;
  /** Плавание: гребки и длина бассейна нужны для SWOLF. */
  strokes: number | null;
  poolLengthM: number | null;
  source: EntrySource;
}

export interface BodyMetric {
  id: string;
  date: string;
  weightKg: number | null;
  bodyFatPct: number | null;
}

/** Поля опциональны: у разных часов разный набор. */
export interface SleepRecovery {
  id: string;
  date: string;
  sleepMinutes: number | null;
  deepMinutes: number | null;
  remMinutes: number | null;
  restingHr: number | null;
  hrv: number | null;
  bodyBattery: number | null;
  stressAvg: number | null;
  source: EntrySource;
}

export interface DailyCheckin {
  id: string;
  date: string;
  soreness: number | null; // 1-5
  energy: number | null;
  stress: number | null;
  mood: number | null;
  note: string | null;
}

export type IngestStatus = "pending" | "confirmed" | "rejected" | "failed";

/**
 * Сырой ввод и то, что из него получилось. Без этого невозможно понять,
 * почему модель ошиблась, и невозможно переобработать записи после
 * улучшения промпта. См. SPEC.md §4.
 */
export interface IngestLogEntry {
  id: string;
  createdAt: string; // ISO
  inputType: "text" | "image" | "voice";
  rawText: string | null;
  rawRef: string | null; // ключ в хранилище для изображения/аудио
  modelOutput: unknown;
  status: IngestStatus;
}
