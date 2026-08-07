import { describe, expect, it } from "vitest";
import { newSession } from "./store";
import type { Exercise, Session } from "./types";
import { buildContext, buildSuggestion } from "./workoutBuilder";

function strengthDay(date: string, items: Array<{ id: string; weight: number }>): Session {
  const s = newSession(date, "strength");
  s.exercises = items.map((it) => ({
    id: `e-${it.id}-${date}`,
    exerciseId: it.id,
    notes: null,
    sets: [{ id: `s-${it.id}-${date}`, weight: it.weight, reps: 5, done: true }],
  }));
  return s;
}

const exercises: Exercise[] = [
  { id: "base:Жим штанги лёжа", name: "Жим штанги лёжа", muscleGroup: "chest", custom: false },
  { id: "base:Приседания со штангой", name: "Приседания со штангой", muscleGroup: "legs", custom: false },
];

describe("buildContext", () => {
  const asOf = "2026-07-30";

  it("собирает упражнения последней силовой в avoidNames", () => {
    const sessions = [strengthDay("2026-07-29", [{ id: "base:Жим штанги лёжа", weight: 90 }])];
    const ctx = buildContext(sessions, exercises, asOf);
    expect(ctx.avoidNames.has("жим штанги лёжа")).toBe(true);
  });

  it("группы за последние 2 дня попадают в tiredGroups", () => {
    const sessions = [strengthDay("2026-07-29", [{ id: "base:Приседания со штангой", weight: 100 }])];
    const ctx = buildContext(sessions, exercises, asOf);
    expect(ctx.tiredGroups.has("legs")).toBe(true);
  });

  it("старая тренировка (>2 дней) не делает группу уставшей", () => {
    const sessions = [strengthDay("2026-07-25", [{ id: "base:Приседания со штангой", weight: 100 }])];
    const ctx = buildContext(sessions, exercises, asOf);
    expect(ctx.tiredGroups.has("legs")).toBe(false);
  });

  it("запоминает последний рабочий вес по имени", () => {
    const sessions = [strengthDay("2026-07-29", [{ id: "base:Жим штанги лёжа", weight: 92 }])];
    const ctx = buildContext(sessions, exercises, asOf);
    expect(ctx.lastWeight.get("жим штанги лёжа")).toBe(92);
  });
});

describe("buildSuggestion с контекстом", () => {
  it("не повторяет упражнение из прошлой силовой, если есть замена", () => {
    const ctx = {
      avoidNames: new Set(["жим штанги лёжа"]),
      tiredGroups: new Set<never>(),
      lastWeight: new Map<string, number>(),
    };
    const s = buildSuggestion("strength", "m60_90", "gym", ctx);
    expect(s.exercises.some((e) => e.name === "Жим штанги лёжа")).toBe(false);
  });

  it("подставляет последний вес в план", () => {
    const ctx = {
      avoidNames: new Set<string>(),
      tiredGroups: new Set<never>(),
      lastWeight: new Map([["приседания со штангой", 120]]),
    };
    const s = buildSuggestion("strength", "m30_60", "gym", ctx);
    const squat = s.exercises.find((e) => e.name === "Приседания со штангой");
    expect(squat?.lastWeight).toBe(120);
  });

  it("без контекста работает как раньше", () => {
    const s = buildSuggestion("strength", "s30");
    expect(s.exercises.length).toBe(3);
    expect(s.kind).toBe("strength");
  });

  it("дома — упражнения со своим весом, без штанговых весов", () => {
    const ctx = {
      avoidNames: new Set<string>(),
      tiredGroups: new Set<never>(),
      lastWeight: new Map([["приседания без веса", 999]]),
    };
    const s = buildSuggestion("muscle", "m30_60", "home", ctx);
    expect(s.exercises.every((e) => e.lastWeight == null)).toBe(true);
    expect(s.exercises.some((e) => e.name === "Отжимания от пола")).toBe(true);
  });
});
