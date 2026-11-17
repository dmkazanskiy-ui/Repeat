import { describe, expect, it } from "vitest";
import { exercisePerformance } from "./strength";
import { newSession, newSessionExercise } from "../store";
import { countedSession } from "../types";

function session(doneFlags: boolean[], ended = true) {
  const s = newSession("2026-11-10", "strength");
  const e = newSessionExercise("bench");
  e.sets = doneFlags.map((done, i) => ({ ...e.sets[0], id: `x${i}`, weight: i === 0 ? 140 : 80, reps: 8, done }));
  s.exercises = [e];
  if (ended) s.endedAt = "2026-11-10T20:00:00.000Z";
  return s;
}

describe("засчитанные подходы", () => {
  it("неотмеченный плановый подход не завышает e1RM, если в тренировке есть отметки", () => {
    const s = session([false, true, true]);
    const [p] = exercisePerformance([s], "bench");
    expect(p.weight).toBe(80);
  });

  it("старая запись без единой отметки считается целиком", () => {
    const s = session([false, false, false]);
    expect(countedSession(s)).toBe(s);
    const [p] = exercisePerformance([s], "bench");
    expect(p.weight).toBe(140);
  });
});
