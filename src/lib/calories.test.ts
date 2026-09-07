import { describe, expect, it } from "vitest";
import { newSession } from "./store";
import type { BodyEntry, Session } from "./types";
import {
  estimateCalories,
  isCaloriesEstimate,
  sessionCalories,
  weightOn,
  withCalorieEstimates,
} from "./calories";

function run(distanceM: number, durationSec: number): Session {
  const s = newSession("2026-03-01", "cardio", { cardioKind: "run" });
  s.cardio = { durationSec, distanceM, avgHr: null };
  return s;
}

function body(date: string, weightKg: number | null): BodyEntry {
  return {
    id: `b-${date}`,
    date,
    weightKg,
    chest: null,
    waist: null,
    hips: null,
    biceps: null,
    thigh: null,
    neck: null,
    notes: null,
  };
}

describe("оценка калорий", () => {
  it("бег 10 км/ч у 80 кг за час — около 840 ккал", () => {
    // MET бега на 10 км/ч ≈ 10,5 → 10,5 × 80 × 1 ч.
    const kcal = estimateCalories(run(10_000, 3600), 80)!;
    expect(kcal).toBeGreaterThan(780);
    expect(kcal).toBeLessThan(900);
  });

  it("быстрый бег дороже трусцы при той же длительности", () => {
    const slow = estimateCalories(run(8_000, 3600), 80)!;
    const fast = estimateCalories(run(14_000, 3600), 80)!;
    expect(fast).toBeGreaterThan(slow);
  });

  it("наклон дорожки увеличивает расход", () => {
    const flat = newSession("2026-03-01", "cardio", { cardioKind: "treadmill" });
    flat.cardio = { durationSec: 3600, distanceM: 5000, avgHr: null };
    const hill = newSession("2026-03-01", "cardio", { cardioKind: "treadmill" });
    hill.cardio = { durationSec: 3600, distanceM: 5000, avgHr: null, inclineDeg: 6 };
    expect(estimateCalories(hill, 80)!).toBeGreaterThan(estimateCalories(flat, 80)!);
  });

  it("ватты на велотренажёре считаются напрямую", () => {
    const easy = newSession("2026-03-01", "cardio", { cardioKind: "bike" });
    easy.cardio = { durationSec: 3600, distanceM: null, avgHr: null, powerW: 100 };
    const hard = newSession("2026-03-01", "cardio", { cardioKind: "bike" });
    hard.cardio = { durationSec: 3600, distanceM: null, avgHr: null, powerW: 200 };
    expect(estimateCalories(hard, 80)!).toBeGreaterThan(estimateCalories(easy, 80)!);
  });

  it("силовая считается по тяжести и таймеру", () => {
    const s = newSession("2026-03-01", "strength");
    s.startedAt = "2026-03-01T10:00:00.000Z";
    s.endedAt = "2026-03-01T11:00:00.000Z";
    s.intensity = "hard";
    // 6 MET × 80 кг × 1 ч.
    expect(estimateCalories(s, 80)).toBe(480);
  });

  it("без веса или без длительности расчёта нет", () => {
    expect(estimateCalories(run(10_000, 3600), null)).toBeNull();
    const noTime = newSession("2026-03-01", "cardio", { cardioKind: "run" });
    noTime.cardio = { durationSec: null, distanceM: 5000, avgHr: null };
    expect(estimateCalories(noTime, 80)).toBeNull();
  });

  it("восстановление расхода не получает", () => {
    const s = newSession("2026-03-01", "recovery");
    s.startedAt = "2026-03-01T10:00:00.000Z";
    s.endedAt = "2026-03-01T11:00:00.000Z";
    expect(estimateCalories(s, 80)).toBeNull();
  });
});

describe("вес на дату", () => {
  const entries = [body("2026-01-10", 82), body("2026-02-10", 80), body("2026-03-10", 78)];

  it("берёт ближайший замер не позже даты", () => {
    expect(weightOn(entries, "2026-02-20")).toBe(80);
  });

  it("до первого замера берёт самый ранний", () => {
    expect(weightOn(entries, "2026-01-01")).toBe(82);
  });

  it("замеры без веса игнорируются", () => {
    expect(weightOn([body("2026-01-10", null)], "2026-02-01")).toBeNull();
  });
});

describe("калории тренировки", () => {
  it("введённое руками важнее расчёта", () => {
    const s = { ...run(10_000, 3600), calories: 700, caloriesEst: 840 };
    expect(sessionCalories(s)).toBe(700);
    expect(isCaloriesEstimate(s)).toBe(false);
  });

  it("без ручного числа показываем оценку и помечаем её", () => {
    const s = { ...run(10_000, 3600), caloriesEst: 840 };
    expect(sessionCalories(s)).toBe(840);
    expect(isCaloriesEstimate(s)).toBe(true);
  });

  it("простановка оценок не создаёт новый массив без изменений", () => {
    const sessions = withCalorieEstimates([run(10_000, 3600)], [body("2026-02-10", 80)]);
    expect(sessions[0].caloriesEst).toBeGreaterThan(0);
    expect(withCalorieEstimates(sessions, [body("2026-02-10", 80)])).toBe(sessions);
  });
});
