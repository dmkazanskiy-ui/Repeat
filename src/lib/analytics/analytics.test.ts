import { describe, expect, it } from "vitest";
import type { Session, WorkoutSet } from "../types";
import { epley } from "../types";
import {
  buildPeriod,
  compareMetric,
  consistency,
  distribution,
  newRecordsInPeriod,
  previousRange,
  rangeLength,
  series,
  summarize,
  totalMetric,
  workingReps,
  workingVolume,
} from "./index";
import { exercisePerformance, strengthTrend } from "./strength";

let seq = 0;
const id = () => `id${seq++}`;

function set(
  weight: number | null,
  reps: number | null,
  opts: { warmup?: boolean; drops?: Array<[number, number]> } = {},
): WorkoutSet {
  return {
    id: id(),
    weight,
    reps,
    done: true,
    warmup: opts.warmup,
    drops: opts.drops?.map(([w, r]) => ({ id: id(), weight: w, reps: r })),
  };
}

function strength(
  date: string,
  sets: WorkoutSet[],
  exerciseId = "base:Жим",
): Session {
  return {
    id: id(),
    date,
    kind: "strength",
    cardioKind: null,
    title: null,
    notes: null,
    createdAt: `${date}T10:00:00.000Z`,
    exercises: [{ id: id(), exerciseId, sets, notes: null }],
    cardio: null,
  };
}

function cardio(date: string, distanceM: number, durationSec: number): Session {
  return {
    id: id(),
    date,
    kind: "cardio",
    cardioKind: "run",
    title: null,
    notes: null,
    createdAt: `${date}T08:00:00.000Z`,
    exercises: [],
    cardio: { durationSec, distanceM, avgHr: null },
  };
}

describe("e1RM (Эпли)", () => {
  it("считает по формуле", () => {
    expect(epley(100, 5)).toBeCloseTo(116.667, 2);
    expect(epley(80, 5)).toBeCloseTo(93.333, 2);
  });
  it("режет высокие повторы и пустые значения", () => {
    expect(epley(100, 13)).toBeNull();
    expect(epley(null, 5)).toBeNull();
    expect(epley(100, null)).toBeNull();
  });
});

describe("рабочий объём и повторы", () => {
  it("тоннаж = вес×повт с дропами", () => {
    const s = strength("2026-07-20", [set(80, 5, { drops: [[70, 6]] })]);
    expect(workingVolume(s)).toBe(80 * 5 + 70 * 6); // 820
    expect(workingReps(s)).toBe(11);
  });
  it("разминочные подходы не идут в рабочий объём", () => {
    const s = strength("2026-07-20", [set(40, 10, { warmup: true }), set(100, 5)]);
    expect(workingVolume(s)).toBe(500);
    expect(workingReps(s)).toBe(5);
    expect(totalMetric([s], "2026-07-20", "2026-07-20", "sets")).toBe(1);
  });
  it("подход без веса не выдумывает тоннаж", () => {
    const s = strength("2026-07-20", [set(null, 12)]);
    expect(workingVolume(s)).toBe(0);
    expect(workingReps(s)).toBe(12);
  });
});

describe("сводка и агрегация", () => {
  const week = [
    strength("2026-07-20", [set(80, 5)]),
    strength("2026-07-22", [set(90, 5)]),
    cardio("2026-07-24", 5000, 1500),
  ];

  it("summarize по диапазону", () => {
    const s = summarize(week, "2026-07-20", "2026-07-26");
    expect(s.workouts).toBe(3);
    expect(s.activeDays).toBe(3);
    expect(s.volume).toBe(80 * 5 + 90 * 5);
    expect(s.distance).toBe(5000);
    expect(s.sets).toBe(2);
  });

  it("ряд по дням с нулевыми днями", () => {
    const period = buildPeriod("week", "2026-07-22");
    const points = series(week, period, "volume");
    expect(points).toHaveLength(7); // Пн..Вс
    expect(points[0]).toEqual({ date: "2026-07-20", value: 400 });
    expect(points[1].value).toBe(0); // Вт без силовой
    expect(points[2].value).toBe(450);
    // Итог графика совпадает с summarize
    const sum = points.reduce((n, p) => n + p.value, 0);
    expect(sum).toBe(summarize(week, "2026-07-20", "2026-07-26").volume);
  });

  it("месяц агрегируется по неделям", () => {
    const period = buildPeriod("month", "2026-07-15");
    expect(period.aggregation).toBe("week");
    const points = series(week, period, "workouts");
    const bucket = points.find((p) => p.date === "2026-07-20");
    expect(bucket?.value).toBe(3); // все три тренировки в одной неделе
  });
});

describe("сравнение периодов", () => {
  it("previousRange — та же длина вплотную перед", () => {
    const prev = previousRange("2026-07-20", "2026-07-26");
    expect(prev).toEqual({ startDate: "2026-07-13", endDate: "2026-07-19" });
    expect(rangeLength(prev.startDate, prev.endDate)).toBe(7);
  });

  it("процент и тренд", () => {
    const sessions = [
      strength("2026-07-15", [set(100, 5)]), // прошлая неделя: 500
      strength("2026-07-22", [set(110, 5)]), // текущая: 550
    ];
    const period = buildPeriod("week", "2026-07-22");
    const cmp = compareMetric(sessions, period, "volume");
    expect(cmp.current).toBe(550);
    expect(cmp.previous).toBe(500);
    expect(cmp.absolute).toBe(50);
    expect(cmp.percent).toBeCloseTo(10);
    expect(cmp.trend).toBe("up");
  });

  it("процент null, когда прошлый период пуст", () => {
    const sessions = [strength("2026-07-22", [set(100, 5)])];
    const period = buildPeriod("week", "2026-07-22");
    const cmp = compareMetric(sessions, period, "volume");
    expect(cmp.previous).toBe(0);
    expect(cmp.percent).toBeNull();
    expect(cmp.trend).toBe("up");
  });
});

describe("пустые и минимальные данные", () => {
  it("пустой период не падает", () => {
    const period = buildPeriod("week", "2026-07-22");
    expect(summarize([], "2026-07-20", "2026-07-26").workouts).toBe(0);
    expect(series([], period, "volume").every((p) => p.value === 0)).toBe(true);
    expect(newRecordsInPeriod([], [], "2026-07-20", "2026-07-26")).toEqual([]);
  });
});

describe("рекорды", () => {
  const exercises = [{ id: "base:Жим", name: "Жим", muscleGroup: "chest" as const, custom: false }];

  it("новый e1RM относительно истории до периода", () => {
    const sessions = [
      strength("2026-07-10", [set(100, 5)]), // до периода, e1RM 116.7
      strength("2026-07-22", [set(110, 5)]), // в периоде, e1RM 128.3 — рекорд
    ];
    const recs = newRecordsInPeriod(sessions, exercises, "2026-07-20", "2026-07-26");
    const e1rm = recs.find((r) => r.type === "e1rm");
    expect(e1rm).toBeTruthy();
    expect(e1rm!.previousValue).toBeCloseTo(116.667, 1);
    expect(e1rm!.newValue).toBeCloseTo(128.333, 1);
  });

  it("первый результат — рекорд с previousValue null", () => {
    const sessions = [strength("2026-07-22", [set(90, 5)])];
    const recs = newRecordsInPeriod(sessions, exercises, "2026-07-20", "2026-07-26");
    const e1rm = recs.find((r) => r.type === "e1rm");
    expect(e1rm!.previousValue).toBeNull();
  });

  it("не рекорд, если в периоде хуже прошлого", () => {
    const sessions = [
      strength("2026-07-10", [set(120, 5)]),
      strength("2026-07-22", [set(100, 5)]),
    ];
    const recs = newRecordsInPeriod(sessions, exercises, "2026-07-20", "2026-07-26");
    expect(recs.find((r) => r.type === "e1rm")).toBeUndefined();
  });
});

describe("прогресс силы", () => {
  it("точки e1RM по датам", () => {
    const sessions = [
      strength("2026-07-01", [set(80, 5)]),
      strength("2026-07-08", [set(85, 5)]),
    ];
    const points = exercisePerformance(sessions, "base:Жим");
    expect(points).toHaveLength(2);
    expect(points[0].e1rm).toBeCloseTo(93.333, 2);
    expect(points[1].weight).toBe(85);
  });

  it("тренд «недостаточно данных» при малом числе точек", () => {
    const sessions = [strength("2026-07-01", [set(80, 5)])];
    expect(strengthTrend(exercisePerformance(sessions, "base:Жим"))).toBe(
      "insufficient",
    );
  });

  it("растущий тренд при достаточных данных", () => {
    const sessions = [
      strength("2026-06-01", [set(80, 5)]),
      strength("2026-06-10", [set(85, 5)]),
      strength("2026-06-20", [set(90, 5)]),
      strength("2026-06-30", [set(95, 5)]),
    ];
    expect(strengthTrend(exercisePerformance(sessions, "base:Жим"))).toBe("up");
  });
});

describe("распределение и регулярность", () => {
  it("доли по видам активности", () => {
    const sessions = [
      strength("2026-07-20", [set(80, 5)]),
      cardio("2026-07-21", 5000, 1800),
    ];
    const dist = distribution(sessions, "2026-07-20", "2026-07-26");
    expect(dist.map((d) => d.key).sort()).toEqual(["run", "strength"]);
    expect(dist.reduce((n, d) => n + d.share, 0)).toBeCloseTo(1);
  });

  it("серии активных дней", () => {
    const sessions = [
      strength("2026-07-20", [set(80, 5)]),
      strength("2026-07-21", [set(80, 5)]),
      strength("2026-07-22", [set(80, 5)]),
      strength("2026-07-25", [set(80, 5)]),
    ];
    const period = buildPeriod("week", "2026-07-22");
    const c = consistency(sessions, period);
    expect(c.activeDays).toBe(4);
    expect(c.longestStreak).toBe(3);
  });
});
