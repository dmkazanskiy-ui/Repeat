import { formatDuration, formatVolume } from "./format";
import type { MetricKey } from "./analytics";
import { L } from "./i18n";

function int(v: number): string {
  return String(Math.round(v));
}

function km(v: number): string {
  return v ? `${(v / 1000).toFixed(1).replace(".", L(",", "."))} ${L("км", "km")}` : "—";
}

/** Подпись и форматтер для каждой метрики — общий источник для KPI и графика. */
export const METRIC_META: Record<
  MetricKey,
  { label: string; format: (v: number) => string }
> = {
  workouts: { get label() { return L("Тренировки", "Workouts"); }, format: int },
  activeDays: { get label() { return L("Дни", "Days"); }, format: int },
  duration: { get label() { return L("Длительность", "Duration"); }, format: (v) => formatDuration(v || null) },
  volume: { get label() { return L("Тоннаж", "Tonnage"); }, format: (v) => formatVolume(v) },
  distance: { get label() { return L("Дистанция", "Distance"); }, format: km },
  exercises: { get label() { return L("Упражнения", "Exercises"); }, format: int },
  sets: { get label() { return L("Подходы", "Sets"); }, format: int },
  reps: { get label() { return L("Повторы", "Reps"); }, format: int },
};

/** Метрики главного графика в порядке показа (activeDays только в KPI). */
export const CHART_METRICS: MetricKey[] = [
  "workouts",
  "volume",
  "sets",
  "reps",
  "duration",
  "distance",
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
