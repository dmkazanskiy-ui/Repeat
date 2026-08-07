import { describe, expect, it } from "vitest";
import type { Exercise, ProgramWorkout, Session, SessionExercise, WorkoutSet } from "../types";
import { newSession } from "../store";
import { autoregPlan, weightIncrement } from "./autoreg";

const BENCH: Exercise = { id: "bench", name: "Жим лёжа", muscleGroup: "chest", custom: false };
const SQUAT: Exercise = { id: "squat", name: "Приседания со штангой на спине", muscleGroup: "legs", custom: false };
const EXS = [BENCH, SQUAT];

function workout(exerciseId: string, opts: { sets: number; min: number; max: number }): ProgramWorkout {
  return {
    id: "w1",
    name: "A",
    order: 0,
    exercises: [
      {
        id: "pe1",
        exerciseId,
        order: 0,
        targetSets: opts.sets,
        targetRepMin: opts.min,
        targetRepMax: opts.max,
      },
    ],
  };
}

function lastWith(exerciseId: string, sets: Array<{ weight: number | null; reps: number }>): Session {
  const s = newSession("2026-08-01", "strength");
  const se: SessionExercise = {
    id: "se1",
    exerciseId,
    notes: null,
    plannedExerciseId: "pe1",
    sets: sets.map((x, i): WorkoutSet => ({ id: `s${i}`, weight: x.weight, reps: x.reps, done: true })),
  };
  s.exercises = [se];
  return s;
}

const NORMAL = { readinessScore: null, readinessHasSignal: false, acwrLevel: "optimal" as const };

describe("weightIncrement", () => {
  it("ноги → +5, верх → +2.5", () => {
    expect(weightIncrement("squat", EXS)).toBe(5);
    expect(weightIncrement("bench", EXS)).toBe(2.5);
  });
});

describe("autoregPlan — прогрессия по факту", () => {
  it("взял верх диапазона → +вес, повторы к низу", () => {
    const plan = autoregPlan({
      workout: workout("bench", { sets: 3, min: 6, max: 8 }),
      lastSession: lastWith("bench", [
        { weight: 50, reps: 8 },
        { weight: 50, reps: 8 },
        { weight: 50, reps: 8 },
      ]),
      exercises: EXS,
      ...NORMAL,
    });
    const a = plan.byPlanned["pe1"];
    expect(a.action).toBe("increase");
    expect(a.weight).toBe(52.5);
    expect(a.reps).toBe(6);
    expect(a.deltaWeight).toBe(2.5);
  });

  it("недобрал низ диапазона → держим вес", () => {
    const plan = autoregPlan({
      workout: workout("bench", { sets: 3, min: 6, max: 8 }),
      lastSession: lastWith("bench", [
        { weight: 50, reps: 5 },
        { weight: 50, reps: 4 },
      ]),
      exercises: EXS,
      ...NORMAL,
    });
    const a = plan.byPlanned["pe1"];
    expect(a.action).toBe("hold");
    expect(a.weight).toBe(50);
    expect(a.deltaWeight).toBe(0);
  });

  it("в диапазоне → добираем повторы, вес тот же", () => {
    const plan = autoregPlan({
      workout: workout("bench", { sets: 3, min: 6, max: 8 }),
      lastSession: lastWith("bench", [
        { weight: 50, reps: 7 },
        { weight: 50, reps: 6 },
      ]),
      exercises: EXS,
      ...NORMAL,
    });
    const a = plan.byPlanned["pe1"];
    expect(a.action).toBe("add_reps");
    expect(a.weight).toBe(50);
    expect(a.reps).toBe(8);
  });

  it("со своим весом: взял верх → +повтор", () => {
    const plan = autoregPlan({
      workout: workout("bench", { sets: 3, min: 10, max: 15 }),
      lastSession: lastWith("bench", [
        { weight: null, reps: 15 },
        { weight: null, reps: 15 },
      ]),
      exercises: EXS,
      ...NORMAL,
    });
    const a = plan.byPlanned["pe1"];
    expect(a.action).toBe("add_reps");
    expect(a.weight).toBeNull();
    expect(a.reps).toBe(16);
  });
});

describe("autoregPlan — модуляция дня", () => {
  const topSet = lastWith("bench", [
    { weight: 50, reps: 8 },
    { weight: 50, reps: 8 },
    { weight: 50, reps: 8 },
  ]);

  it("низкая готовность → лёгкий день: прибавку гасим, срезаем подход", () => {
    const plan = autoregPlan({
      workout: workout("bench", { sets: 3, min: 6, max: 8 }),
      lastSession: topSet,
      exercises: EXS,
      readinessScore: 0.3,
      readinessHasSignal: true,
      acwrLevel: "optimal",
    });
    expect(plan.modifier).toBe("easy");
    const a = plan.byPlanned["pe1"];
    expect(a.action).toBe("hold");
    expect(a.weight).toBe(50);
    expect(a.sets).toBe(2); // 3 − 1
  });

  it("ACWR high → тоже лёгкий день", () => {
    const plan = autoregPlan({
      workout: workout("bench", { sets: 3, min: 6, max: 8 }),
      lastSession: topSet,
      exercises: EXS,
      readinessScore: null,
      readinessHasSignal: false,
      acwrLevel: "high",
    });
    expect(plan.modifier).toBe("easy");
    expect(plan.byPlanned["pe1"].action).toBe("hold");
  });

  it("высокая готовность → push, прибавка остаётся", () => {
    const plan = autoregPlan({
      workout: workout("bench", { sets: 3, min: 6, max: 8 }),
      lastSession: topSet,
      exercises: EXS,
      readinessScore: 0.8,
      readinessHasSignal: true,
      acwrLevel: "optimal",
    });
    expect(plan.modifier).toBe("push");
    expect(plan.byPlanned["pe1"].action).toBe("increase");
    expect(plan.byPlanned["pe1"].weight).toBe(52.5);
  });
});
