import { describe, expect, it } from "vitest";
import type { ExercisePerformancePoint } from "./types";
import { metricDelta, metricSeries, metricValue, metricTrend } from "./strength";

const pt = (date: string, weight: number, reps: number, vol: number): ExercisePerformancePoint => ({
  date,
  weight,
  reps,
  e1rm: weight * (1 + reps / 30),
  topSetVolume: weight * reps,
  workoutVolume: vol,
});

describe("metricValue", () => {
  it("выбирает поле по метрике; тоннаж 0 → null", () => {
    const p = pt("2026-08-01", 100, 5, 3000);
    expect(metricValue(p, "weight")).toBe(100);
    expect(metricValue(p, "volume")).toBe(3000);
    expect(metricValue({ ...p, workoutVolume: 0 }, "volume")).toBeNull();
  });
});

describe("metricDelta", () => {
  const pts = [
    pt("2026-07-01", 100, 5, 3000),
    pt("2026-07-08", 100, 5, 3000),
    pt("2026-07-15", 110, 5, 3300),
  ];
  it("«К прошлой» — последняя к предыдущей", () => {
    expect(metricDelta(pts, "weight", "session")).toBeCloseTo(10); // 110 vs 100
  });
  it("«За период» — последняя к первой", () => {
    expect(metricDelta(pts, "volume", "period")).toBeCloseTo(10); // 3300 vs 3000
  });
  it("мало точек → null", () => {
    expect(metricDelta([pts[0]], "weight", "session")).toBeNull();
  });
});

describe("metricSeries", () => {
  it("тоннаж агрегируется по неделям (сумма), вес — по тренировкам", () => {
    const pts = [
      pt("2026-07-06", 100, 5, 2000), // неделя A (Пн 06.07)
      pt("2026-07-08", 100, 5, 2500), // та же неделя A
      pt("2026-07-15", 110, 5, 3000), // неделя B
    ];
    const vol = metricSeries(pts, "volume");
    expect(vol).toHaveLength(2); // две недели
    expect(vol[0].v).toBe(4500); // 2000 + 2500
    expect(vol[1].v).toBe(3000);
    // Вес — по каждой тренировке, без агрегации.
    expect(metricSeries(pts, "weight")).toHaveLength(3);
  });
});

describe("metricTrend", () => {
  it("растущий тоннаж за ≥3 недели и ≥4 точки → up", () => {
    const rising = [
      pt("2026-07-01", 100, 5, 3000),
      pt("2026-07-10", 105, 5, 3200),
      pt("2026-07-20", 110, 5, 3400),
      pt("2026-07-30", 115, 5, 3600),
    ];
    expect(metricTrend(rising, "volume")).toBe("up");
  });
  it("мало данных → insufficient", () => {
    expect(metricTrend([pt("2026-08-01", 100, 5, 3000)], "weight")).toBe("insufficient");
  });
});
