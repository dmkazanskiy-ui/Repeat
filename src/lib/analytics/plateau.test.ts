import { describe, expect, it } from "vitest";
import type { Exercise, Session, WorkoutSet } from "../types";
import { plateauDetail, plateauWeeks } from "./plateau";

let seq = 0;
const id = () => `p${seq++}`;

const EX_ID = "base:Жим лёжа";
const exercises: Exercise[] = [
  { id: EX_ID, name: "Жим лёжа", nameEn: "Bench press", muscleGroup: "chest", custom: false },
];

function set(weight: number | null, reps: number | null, warmup = false): WorkoutSet {
  return { id: id(), weight, reps, done: true, warmup };
}

function strength(date: string, sets: WorkoutSet[]): Session {
  return {
    id: id(),
    date,
    kind: "strength",
    cardioKind: null,
    title: null,
    notes: null,
    createdAt: `${date}T10:00:00.000Z`,
    exercises: [{ id: id(), exerciseId: EX_ID, sets, notes: null }],
    cardio: null,
  };
}

/** N понедельников подряд, начиная с 2026-06-01 (это понедельник). */
function mondays(count: number): string[] {
  const days: string[] = [];
  const start = new Date("2026-06-01T00:00:00Z");
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i * 7);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

describe("недельные показатели упражнения", () => {
  it("берёт самый тяжёлый рабочий подход и считает подходы", () => {
    const weeks = plateauWeeks(
      [strength("2026-06-01", [set(60, 10, true), set(80, 6), set(80, 8), set(70, 10)])],
      EX_ID,
    );
    expect(weeks).toHaveLength(1);
    expect(weeks[0].topWeight).toBe(80);
    expect(weeks[0].topReps).toBe(8); // при равном весе — больше повторов
    expect(weeks[0].workingSets).toBe(3); // разминка не считается
    expect(weeks[0].sessions).toBe(1);
  });

  it("исключает разгрузочные недели", () => {
    const deload: Session = { ...strength("2026-06-08", [set(60, 8)]), deload: true };
    const weeks = plateauWeeks([strength("2026-06-01", [set(80, 8)]), deload], EX_ID);
    expect(weeks.map((w) => w.week)).toEqual(["2026-06-01"]);
  });
});

describe("разбор плато", () => {
  it("видит застрявший вес и советует сменить схему", () => {
    const sessions = mondays(7).map((d) => strength(d, [set(80, 8), set(80, 8), set(80, 7)]));
    const detail = plateauDetail(sessions, exercises, EX_ID);
    expect(detail).not.toBeNull();
    expect(detail!.weeks).toBeGreaterThanOrEqual(3);
    expect(detail!.stuckWeight).toBe(80);
    expect(detail!.repsTrend).toBe("flat");
    expect(detail!.advice.some((a) => a.cause === "flat")).toBe(true);
  });

  it("при растущих повторах на том же весе советует прибавить вес", () => {
    const reps = [6, 6, 7, 8, 9, 10];
    const sessions = mondays(6).map((d, i) =>
      strength(d, [set(80, reps[i]), set(80, reps[i])]),
    );
    const detail = plateauDetail(sessions, exercises, EX_ID);
    expect(detail!.repsTrend).toBe("up");
    expect(detail!.advice[0].cause).toBe("reps_up");
  });

  it("замечает падение объёма", () => {
    const setsPerWeek = [4, 4, 4, 2, 2, 1];
    const sessions = mondays(6).map((d, i) =>
      strength(
        d,
        Array.from({ length: setsPerWeek[i] }, () => set(80, 8)),
      ),
    );
    const detail = plateauDetail(sessions, exercises, EX_ID);
    expect(detail!.setsTrend).toBe("down");
    expect(detail!.advice.some((a) => a.cause === "volume_down")).toBe(true);
  });

  it("на долгом плато предлагает разгрузку", () => {
    const sessions = mondays(10).map((d) => strength(d, [set(100, 5), set(100, 5)]));
    const detail = plateauDetail(sessions, exercises, EX_ID);
    expect(detail!.weeks).toBeGreaterThanOrEqual(8);
    expect(detail!.advice.some((a) => a.cause === "long")).toBe(true);
  });

  it("без истории по упражнению возвращает null", () => {
    expect(plateauDetail([], exercises, EX_ID)).toBeNull();
  });

  it("даёт не больше трёх рекомендаций", () => {
    const setsPerWeek = [4, 4, 3, 2, 2, 1, 1, 1, 1, 1];
    const reps = [5, 5, 6, 6, 7, 7, 8, 8, 9, 9];
    const sessions = mondays(10).map((d, i) =>
      strength(
        d,
        Array.from({ length: setsPerWeek[i] }, () => set(90, reps[i])),
      ),
    );
    const detail = plateauDetail(sessions, exercises, EX_ID);
    expect(detail!.advice.length).toBeLessThanOrEqual(3);
  });
});
