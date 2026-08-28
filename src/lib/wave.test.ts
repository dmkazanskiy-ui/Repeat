import { describe, expect, it } from "vitest";
import type { ProgramWave, ProgramWorkout, Session, Exercise, TrainingProgram } from "./types";
import {
  currentWeekType,
  defaultWave,
  lastSameTypeSession,
  setCurrentWeek,
  waveIndexFor,
  wavePlan,
} from "./wave";

let seq = 0;
const id = () => `w${seq++}`;

const squat: Exercise = {
  id: "base:Присед",
  name: "Приседания со штангой на спине",
  muscleGroup: "legs",
  custom: false,
};

const wave: ProgramWave = {
  startWeek: "2026-08-03", // понедельник
  startIndex: 0,
  weeks: [
    { id: "light", name: "Лёгкая", sets: 2, repMin: 8, repMax: 10, percent: 80, light: true },
    { id: "medium", name: "Средняя", sets: 3, repMin: 6, repMax: 8, percent: 100 },
    { id: "heavy", name: "Тяжёлая", sets: 4, repMin: 4, repMax: 6, percent: 105 },
  ],
};

const workout: ProgramWorkout = {
  id: "wA",
  name: "День A",
  order: 0,
  exercises: [
    { id: "pe1", exerciseId: "base:Присед", order: 0, targetSets: 3, targetRepMin: 5 },
  ],
};

const program: TrainingProgram = {
  id: "p",
  name: "Сплит",
  workouts: [workout],
  currentWorkoutIndex: 0,
  cycleNumber: 1,
  createdAt: "2026-08-01T00:00:00.000Z",
  wave,
};

function session(
  date: string,
  weekTypeId: string | null,
  sets: Array<[number, number]>,
): Session {
  return {
    id: id(),
    date,
    kind: "strength",
    cardioKind: null,
    title: null,
    notes: null,
    createdAt: `${date}T10:00:00.000Z`,
    endedAt: `${date}T11:00:00.000Z`,
    programId: "p",
    programWorkoutId: "wA",
    weekType: weekTypeId ? { id: weekTypeId, name: weekTypeId } : null,
    exercises: [
      {
        id: id(),
        exerciseId: "base:Присед",
        plannedExerciseId: "pe1",
        notes: null,
        sets: sets.map(([weight, reps]) => ({ id: id(), weight, reps, done: true })),
      },
    ],
    cardio: null,
  };
}

describe("календарь волны", () => {
  it("крутится по неделям от даты старта", () => {
    expect(waveIndexFor(wave, "2026-08-05")).toBe(0); // та же неделя
    expect(waveIndexFor(wave, "2026-08-10")).toBe(1);
    expect(waveIndexFor(wave, "2026-08-17")).toBe(2);
    expect(waveIndexFor(wave, "2026-08-24")).toBe(0); // круг замкнулся
  });

  it("работает и назад во времени", () => {
    expect(waveIndexFor(wave, "2026-07-27")).toBe(2);
  });

  it("поправка «сейчас другая неделя» сдвигает волну", () => {
    const fixed = setCurrentWeek(wave, "2026-08-12", 2);
    expect(waveIndexFor(fixed, "2026-08-12")).toBe(2);
    expect(waveIndexFor(fixed, "2026-08-19")).toBe(0);
  });

  it("тип недели программы читается по дате", () => {
    expect(currentWeekType(program, "2026-08-17")?.name).toBe("Тяжёлая");
    expect(currentWeekType({ ...program, wave: null }, "2026-08-17")).toBeNull();
  });

  it("волна по умолчанию — лёгкая/средняя/тяжёлая 2-3-4", () => {
    expect(defaultWave("2026-08-05").weeks.map((w) => w.sets)).toEqual([2, 3, 4]);
  });
});

describe("план недели", () => {
  const heavy = wave.weeks[2];

  it("подходы берутся из типа недели, а не из плана", () => {
    const plan = wavePlan({
      workout,
      weekType: heavy,
      lastSameType: null,
      lastAny: null,
      exercises: [squat],
      modifier: "normal",
    });
    expect(plan.byPlanned.pe1.sets).toBe(4);
    expect(plan.byPlanned.pe1.reps).toBe(4);
  });

  it("вес — от прошлой недели ТОГО ЖЕ типа, с прибавкой за верх диапазона", () => {
    const plan = wavePlan({
      workout,
      weekType: heavy,
      // на прошлой тяжёлой все подходы взяли верх (6) → +5 кг (ноги)
      lastSameType: session("2026-08-03", "heavy", [[100, 6], [100, 6], [100, 6]]),
      lastAny: session("2026-08-10", "medium", [[80, 8]]),
      exercises: [squat],
      modifier: "normal",
    });
    expect(plan.byPlanned.pe1.weight).toBe(105);
    expect(plan.byPlanned.pe1.deltaWeight).toBe(5);
    expect(plan.byPlanned.pe1.estimate).toBe(false);
  });

  it("не добрал верх — держим тот же вес", () => {
    const plan = wavePlan({
      workout,
      weekType: heavy,
      lastSameType: session("2026-08-03", "heavy", [[100, 6], [100, 4]]),
      lastAny: null,
      exercises: [squat],
      modifier: "normal",
    });
    expect(plan.byPlanned.pe1.weight).toBe(100);
    expect(plan.byPlanned.pe1.deltaWeight).toBe(0);
  });

  it("без истории такой недели берём процент — и честно помечаем ориентиром", () => {
    const plan = wavePlan({
      workout,
      weekType: wave.weeks[0], // лёгкая, 80%
      lastSameType: null,
      lastAny: session("2026-08-10", "heavy", [[100, 5]]),
      exercises: [squat],
      modifier: "normal",
    });
    expect(plan.byPlanned.pe1.weight).toBe(80);
    expect(plan.byPlanned.pe1.estimate).toBe(true);
    expect(plan.byPlanned.pe1.sets).toBe(2);
  });

  it("низкая готовность гасит прибавку и срезает подход, но замысел недели остаётся", () => {
    const plan = wavePlan({
      workout,
      weekType: heavy,
      lastSameType: session("2026-08-03", "heavy", [[100, 6], [100, 6]]),
      lastAny: null,
      exercises: [squat],
      modifier: "easy",
    });
    expect(plan.byPlanned.pe1.weight).toBe(100); // без +5
    expect(plan.byPlanned.pe1.sets).toBe(3); // 4 − 1
  });

  it("упражнение с флагом waveExempt волна не трогает", () => {
    const withExempt: ProgramWorkout = {
      ...workout,
      exercises: [{ ...workout.exercises[0], waveExempt: true }],
    };
    const plan = wavePlan({
      workout: withExempt,
      weekType: heavy,
      lastSameType: null,
      lastAny: null,
      exercises: [squat],
      modifier: "normal",
    });
    expect(plan.byPlanned.pe1.sets).toBe(3); // из плана, а не 4
  });
});

describe("поиск прошлой недели того же типа", () => {
  it("берёт последнюю завершённую с тем же типом", () => {
    const sessions = [
      session("2026-08-03", "heavy", [[100, 5]]),
      session("2026-08-10", "medium", [[90, 8]]),
      session("2026-08-17", "heavy", [[105, 5]]),
    ];
    expect(lastSameTypeSession(sessions, "wA", "heavy")?.date).toBe("2026-08-17");
    expect(lastSameTypeSession(sessions, "wA", "light")).toBeNull();
  });
});
