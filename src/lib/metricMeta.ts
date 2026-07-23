import { formatDuration, formatVolume } from "./format";
import type { MetricKey } from "./analytics";

function int(v: number): string {
  return String(Math.round(v));
}

function km(v: number): string {
  return v ? `${(v / 1000).toFixed(1).replace(".", ",")} км` : "—";
}

/** Подпись и форматтер для каждой метрики — общий источник для KPI и графика. */
export const METRIC_META: Record<
  MetricKey,
  { label: string; format: (v: number) => string }
> = {
  workouts: { label: "Тренировки", format: int },
  activeDays: { label: "Дни", format: int },
  duration: { label: "Длительность", format: (v) => formatDuration(v || null) },
  volume: { label: "Тоннаж", format: (v) => formatVolume(v) },
  distance: { label: "Дистанция", format: km },
  exercises: { label: "Упражнения", format: int },
  sets: { label: "Подходы", format: int },
  reps: { label: "Повторы", format: int },
};

/** Метрики главного графика в порядке показа (activeDays только в KPI). */
export const CHART_METRICS: MetricKey[] = [
  "volume",
  "sets",
  "reps",
  "duration",
  "distance",
  "workouts",
];

/** Все метрики KPI-ленты. */
export const KPI_METRICS: MetricKey[] = [
  "workouts",
  "activeDays",
  "duration",
  "volume",
  "distance",
  "exercises",
  "sets",
  "reps",
];

/** «+11 %», «−6 %», «—» когда прошлый период пуст. */
export function formatPercent(percent: number | null): string {
  if (percent == null) return "—";
  const rounded = Math.round(percent);
  return `${rounded > 0 ? "+" : ""}${rounded} %`;
}
