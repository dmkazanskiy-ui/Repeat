import { describe, expect, it } from "vitest";
import { newSession } from "../store";
import { addDays } from "../format";
import type { RecoveryEntry, Session, SessionIntensity } from "../types";
import { classifyDay, restBalance } from "./rest";

const ASOF = "2026-07-29";

function hardDay(date: string, intensity: SessionIntensity = "hard"): Session {
  const s = newSession(date, "strength");
  s.intensity = intensity;
  s.exercises = [
    {
      id: `e-${date}`,
      exerciseId: "squat",
      notes: null,
      sets: [
        { id: `a-${date}`, weight: 100, reps: 5, done: true },
        { id: `b-${date}`, weight: 100, reps: 5, done: true },
      ],
    },
  ];
  return s;
}

function recoverySession(date: string): Session {
  return newSession(date, "recovery", { recoveryType: "sauna" });
}

function checkin(date: string, value: number): RecoveryEntry {
  return { id: `r-${date}`, date, wellbeing: value, sleep: value, freshness: value, motivation: value };
}

describe("classifyDay", () => {
  it("нет силовой/кардио → день отдыха", () => {
    expect(classifyDay([recoverySession(ASOF)], ASOF, 0)).toBe("rest");
    expect(classifyDay([], ASOF, 0)).toBe("rest");
  });
  it("ручная отметка «тяжело» → heavy", () => {
    expect(classifyDay([hardDay(ASOF, "hard")], ASOF, 0)).toBe("heavy");
  });
  it("ручная отметка «легко» → light", () => {
    expect(classifyDay([hardDay(ASOF, "easy")], ASOF, 0)).toBe("light");
  });
});

describe("restBalance", () => {
  it("три тяжёлых дня подряд → heavyDaysInRow = 3", () => {
    const sessions = [hardDay(ASOF), hardDay(addDays(ASOF, -1)), hardDay(addDays(ASOF, -2))];
    const b = restBalance(sessions, [], ASOF);
    expect(b.heavyDaysInRow).toBe(3);
  });

  it("серия полного отдыха считается от asOf назад", () => {
    // Сегодня и вчера — отдых, позавчера была тяжёлая.
    const sessions = [hardDay(addDays(ASOF, -2))];
    const b = restBalance(sessions, [], ASOF);
    expect(b.fullRestStreak).toBe(2);
  });

  it("последнее восстановление — в днях назад", () => {
    const sessions = [recoverySession(addDays(ASOF, -4))];
    const b = restBalance(sessions, [], ASOF);
    expect(b.daysSinceLastRecovery).toBe(4);
  });

  it("один тяжёлый день + хорошее самочувствие → без предупреждения", () => {
    const b = restBalance([hardDay(ASOF)], [checkin(ASOF, 5)], ASOF);
    expect(b.heavyDaysInRow).toBe(1);
    expect(b.warning).toBeNull();
  });

  it("высокая нагрузка + низкое самочувствие → предупреждение high с причинами", () => {
    const sessions = [hardDay(ASOF), hardDay(addDays(ASOF, -1)), hardDay(addDays(ASOF, -2))];
    const b = restBalance(sessions, [checkin(ASOF, 1)], ASOF);
    expect(b.warning?.severity).toBe("high");
    expect(b.warning!.reasons.length).toBeGreaterThan(0);
  });

  it("два тяжёлых подряд + среднее самочувствие → attention", () => {
    const sessions = [hardDay(ASOF), hardDay(addDays(ASOF, -1))];
    const b = restBalance(sessions, [checkin(ASOF, 2)], ASOF); // sub = 0.25 < 0.6
    expect(b.warning?.severity).toBe("attention");
  });

  it("нет данных → нулевые счётчики, без предупреждения", () => {
    const b = restBalance([], [], ASOF);
    expect(b.heavyDaysInRow).toBe(0);
    expect(b.daysSinceLastRecovery).toBeNull();
    expect(b.warning).toBeNull();
  });
});
