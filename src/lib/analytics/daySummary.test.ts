import { describe, expect, it } from "vitest";
import { newSession } from "../store";
import type { Session } from "../types";
import { daySummary } from "./daySummary";

const DAY = "2026-08-07";

function strength(reps = 5, weight = 100): Session {
  const s = newSession(DAY, "strength");
  s.endedAt = `${DAY}T11:00:00.000Z`;
  s.startedAt = `${DAY}T10:00:00.000Z`;
  s.exercises = [
    { id: "e", exerciseId: "squat", notes: null, sets: [{ id: "a", weight, reps, done: true }] },
  ];
  return s;
}

function recovery(): Session {
  return newSession(DAY, "recovery", { recoveryType: "sauna" });
}

function cardio(distanceM = 5000): Session {
  const s = newSession(DAY, "cardio", { cardioKind: "run" });
  s.cardio = { durationSec: 1800, distanceM, avgHr: null, segments: [] };
  return s;
}

describe("daySummary", () => {
  it("две силовые → «2 тренировки»", () => {
    const sum = daySummary([strength(), strength()]);
    expect(sum.headline).toBe("2 тренировки");
    expect(sum.recoveryOnly).toBe(false);
    expect(sum.tonnage).toBe(1000); // 2 × 100×5
  });

  it("только восстановление → «1 восстановление», не тренировка", () => {
    const sum = daySummary([recovery()]);
    expect(sum.headline).toBe("1 восстановление");
    expect(sum.recoveryOnly).toBe(true);
    expect(sum.tonnage).toBe(0);
  });

  it("смешанный день — порядок силовая → кардио → восстановление", () => {
    const sum = daySummary([recovery(), cardio(), strength()]);
    expect(sum.headline).toBe("1 тренировка · 1 кардио · 1 восстановление");
    expect(sum.recoveryOnly).toBe(false);
    expect(sum.distanceM).toBe(5000);
  });

  it("пустой день → пустой итог", () => {
    const sum = daySummary([]);
    expect(sum.headline).toBe("");
    expect(sum.items).toHaveLength(0);
    expect(sum.recoveryOnly).toBe(false);
  });
});
