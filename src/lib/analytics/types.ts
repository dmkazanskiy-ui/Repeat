// Типы аналитического слоя. Все расчёты живут в service-модуле рядом,
// UI-компоненты только читают эти структуры — формул в UI нет.

/** Направление изменения. Нейтральная семантика: снижение не равно «плохо». */
export type Trend = "up" | "down" | "flat";

/** Как агрегируется график: по календарным дням или по неделям. */
export type AggregationType = "day" | "week";

/** Ключи метрик, доступных для KPI и главного графика. */
export type MetricKey =
  | "workouts"
  | "activeDays"
  | "duration"
  | "volume"
  | "distance"
  | "exercises"
  | "sets"
  | "reps";

export interface AnalyticsPeriod {
  startDate: string; // YYYY-MM-DD, включительно
  endDate: string; // YYYY-MM-DD, включительно
  aggregation: AggregationType;
  /** Предыдущий период такой же длины — для сравнения. */
  comparison: { startDate: string; endDate: string };
}

export interface AnalyticsSummary {
  workouts: number;
  activeDays: number;
  duration: number; // секунды
  volume: number; // кг (рабочие подходы силовых)
  distance: number; // метры (кардио)
  exercises: number;
  sets: number; // рабочие подходы
  reps: number; // рабочие повторы
}

export interface MetricDataPoint {
  date: string; // начало корзины (день или неделя), YYYY-MM-DD
  value: number;
}

export interface MetricComparison {
  metric: MetricKey;
  current: number;
  previous: number;
  absolute: number; // current − previous
  /** null, когда предыдущий период = 0 (процент не определён). */
  percent: number | null;
  trend: Trend;
}

export interface ExercisePerformancePoint {
  date: string;
  weight: number | null; // лучший рабочий вес в дне
  reps: number | null; // повторы этого подхода
  e1rm: number | null;
  topSetVolume: number; // тоннаж лучшего подхода
  workoutVolume: number; // тоннаж упражнения за тренировку
}

export type PrType =
  | "e1rm"
  | "weight"
  | "sessionVolume"
  | "exerciseVolume"
  | "distance"
  | "duration";

export interface PersonalRecord {
  type: PrType;
  exerciseId?: string;
  label: string;
  previousValue: number | null;
  newValue: number;
  achievedAt: string; // YYYY-MM-DD
  unit: string;
}

export interface ActivitySlice {
  key: string; // strength | run | bike | swim | walk | other
  label: string;
  count: number;
  duration: number; // секунды
  share: number; // доля от общего времени, 0..1
}

export interface ConsistencyStats {
  activeDays: number;
  workouts: number;
  perWeek: number; // среднее число тренировок в неделю за период
  currentStreak: number; // текущая серия активных дней
  longestStreak: number; // самая длинная серия за всю историю
  activeWeekRatio: number; // доля недель периода с тренировками, 0..1
}

/** Уровень доверия к расчёту — показываем честно, когда данных мало. */
export type Confidence = "high" | "medium" | "preliminary";
