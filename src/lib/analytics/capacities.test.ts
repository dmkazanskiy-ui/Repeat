import { describe, expect, it } from "vitest";
import { newSession } from "../store";
import type { Session } from "../types";
import { buildPeriod } from "./period";
import { capacityProgress, capacitySummary } from "./capacities";

/** Силовая сессия с одним упражнением: вес×повторы задают e1RM. */
function strengthDay(date: string, weight: number, reps: number): Session {
  const s = newSession(date, "strength");
  s.exercises = [
    {
      id: `e-${date}`,
      exerciseId: "squat",
      notes: null,
      sets: [{ id: `s-${date}`, weight, reps, done: true }],
    },
  ];
  return s;
}

/** Бег с дистанцией и временем — задаёт темп. */
function runDay(date: string, distanceM: number, durationSec: number): Session {
  const s = newSession(date, "cardio", { cardioKind: "run" });
  s.cardio = { durationSec, distanceM, avgHr: null };
  return s;
}

// Период, охватывающий ~6 недель до 2026-03-01.
const period = buildPeriod("custom", "2026-03-01", "2026-01-19", "2026-03-01");

describe("прогресс способностей", () => {
  it("растущий e1RM по неделям → сила вверх", () => {
    const sessions = [
      strengthDay("2026-01-20", 100, 5),
      strengthDay("2026-02-03", 105, 5),
      strengthDay("2026-02-17", 110, 5),
      strengthDay("2026-02-24", 115, 5),
    ];
    const strength = capacityProgress(sessions, period).find((c) => c.key === "strength")!;
    expect(strength.hasData).toBe(true);
    expect(strength.direction).toBe("up");
    expect(strength.deltaPercent).toBeGreaterThan(0);
  });

  it("темп бега падает (сек/км меньше) → скорость вверх", () => {
    const sessions = [
      runDay("2026-01-20", 5000, 1800), // 6:00/км
      runDay("2026-02-03", 5000, 1710),
      runDay("2026-02-17", 5000, 1650),
      runDay("2026-02-24", 5000, 1600), // 5:20/км
    ];
    const speed = capacityProgress(sessions, period).find((c) => c.key === "speed")!;
    expect(speed.hasData).toBe(true);
    expect(speed.direction).toBe("up"); // быстрее = лучше
    expect(speed.deltaPercent).toBeGreaterThan(0);
  });

  it("нет данных качества → hasData=false, direction=none", () => {
    const only = [strengthDay("2026-02-01", 100, 5), strengthDay("2026-02-15", 100, 5)];
    const speed = capacityProgress(only, period).find((c) => c.key === "speed")!;
    expect(speed.hasData).toBe(false);
    expect(speed.direction).toBe("none");
    expect(speed.deltaPercent).toBeNull();
  });

  it("одна неделя данных → недостаточно для тренда (preliminary, none)", () => {
    const one = [strengthDay("2026-02-10", 100, 5)];
    const strength = capacityProgress(one, period).find((c) => c.key === "strength")!;
    expect(strength.hasData).toBe(true);
    expect(strength.direction).toBe("none");
    expect(strength.confidence).toBe("preliminary");
  });

  it("резюме: без данных — честная строка", () => {
    const empty = capacityProgress([], period);
    expect(capacitySummary(empty)).toMatch(/мало данных/i);
  });

  it("резюме упоминает растущее качество", () => {
    const sessions = [
      strengthDay("2026-01-20", 100, 5),
      strengthDay("2026-02-10", 108, 5),
      strengthDay("2026-02-24", 116, 5),
    ];
    const items = capacityProgress(sessions, period);
    expect(capacitySummary(items).toLowerCase()).toContain("сила");
  });
});
