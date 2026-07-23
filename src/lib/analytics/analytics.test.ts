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
import {
  classifyExercise,
  heatmap,
  loadBaseline,
  movementBalance,
  muscleLoads,
  periodSummary,
  programProgress,
  readiness,
  summaryFacts,
} from "./index";
import type { Exercise, TrainingProgram } from "../types";

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
    const period = buildPeriod("week", "2026-07-22", undefined, undefined, "2026-07-26");
    const cmp = compareMetric(sessions, period, "volume");
    expect(cmp.current).toBe(550);
    expect(cmp.previous).toBe(500);
    expect(cmp.absolute).toBe(50);
    expect(cmp.percent).toBeCloseTo(10);
    expect(cmp.trend).toBe("up");
  });

  it("процент null, когда прошлый период пуст", () => {
    const sessions = [strength("2026-07-22", [set(100, 5)])];
    const period = buildPeriod("week", "2026-07-22", undefined, undefined, "2026-07-26");
    const cmp = compareMetric(sessions, period, "volume");
    expect(cmp.previous).toBe(0);
    expect(cmp.percent).toBeNull();
    expect(cmp.trend).toBe("up");
  });

  it("неполная неделя сравнивается с той же частью прошлой (Пн–Чт)", () => {
    const sessions = [
      strength("2026-07-16", [set(100, 5)]), // прошлый Чт: в окно Пн–Чт попадает
      strength("2026-07-18", [set(100, 5)]), // прошлая Сб: НЕ должна попасть
      strength("2026-07-23", [set(110, 5)]), // текущий Чт
    ];
    // asOf — четверг текущей недели, неделя ещё не завершена
    const period = buildPeriod("week", "2026-07-23", undefined, undefined, "2026-07-23");
    expect(period.comparison).toEqual({
      startDate: "2026-07-13",
      endDate: "2026-07-16",
    });
    const cmp = compareMetric(sessions, period, "volume");
    expect(cmp.previous).toBe(500); // только Чт прошлой недели, без Сб
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

  it("длительность < 60 c не становится рекордом", () => {
    const s = strength("2026-07-22", [set(80, 5)]);
    s.startedAt = "2026-07-22T10:00:00.000Z";
    s.endedAt = "2026-07-22T10:00:30.000Z"; // 30 секунд
    const recs = newRecordsInPeriod([s], exercises, "2026-07-20", "2026-07-26");
    expect(recs.find((r) => r.type === "duration")).toBeUndefined();
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

describe("справочник мышц", () => {
  const bench: Exercise = {
    id: "base:Жим",
    name: "Жим штанги лёжа",
    muscleGroup: "chest",
    custom: false,
  };

  it("жим лёжа: грудь основная, трицепс и перед. дельта вторичные", () => {
    const cls = classifyExercise(bench);
    expect(cls.confidence).toBe("high");
    const chest = cls.muscles.find((m) => m.muscle === "chest");
    expect(chest?.role).toBe("primary");
    expect(chest?.coef).toBe(1);
    expect(cls.muscles.find((m) => m.muscle === "triceps")?.coef).toBe(0.5);
    expect(cls.patterns).toContain("horizPush");
  });

  it("неизвестное упражнение — запасной вариант по грубой группе", () => {
    const custom: Exercise = {
      id: "x",
      name: "Странное движение",
      muscleGroup: "back",
      custom: true,
    };
    const cls = classifyExercise(custom);
    expect(cls.confidence).toBe("preliminary");
    expect(cls.muscles[0].muscle).toBe("lats");
  });

  it("прямые и эквивалентные подходы", () => {
    const sessions = [strength("2026-07-22", [set(80, 5), set(80, 5), set(80, 5)])];
    const period = buildPeriod("week", "2026-07-22", undefined, undefined, "2026-07-26");
    const loads = muscleLoads(sessions, [bench], period);
    const chest = loads.find((l) => l.muscle === "chest")!;
    expect(chest.directSets).toBe(3);
    expect(chest.adjustedSets).toBe(3);
    const triceps = loads.find((l) => l.muscle === "triceps")!;
    expect(triceps.directSets).toBe(0); // только вторичная
    expect(triceps.adjustedSets).toBeCloseTo(1.5); // 3 × 0.5
  });

  it("баланс движений: жим против тяги", () => {
    const row: Exercise = { id: "row", name: "Тяга штанги в наклоне", muscleGroup: "back", custom: false };
    const sessions = [
      strength("2026-07-22", [set(80, 5), set(80, 5)], "base:Жим"),
      strength("2026-07-22", [set(60, 8)], "row"),
    ];
    const balance = movementBalance(sessions, [bench, row], "2026-07-20", "2026-07-26");
    const pushpull = balance.find((b) => b.key === "pushpull")!;
    expect(pushpull.left).toBe(2); // жимовые подходы
    expect(pushpull.right).toBe(1); // тяговые
  });
});

describe("прогресс по программе A→A", () => {
  const bench: Exercise = {
    id: "base:Жим",
    name: "Жим штанги лёжа",
    muscleGroup: "chest",
    custom: false,
  };

  function doneWorkout(date: string, weight: number): Session {
    const s = strength(date, [set(weight, 5), set(weight, 5), set(weight, 5)]);
    s.programWorkoutId = "wA";
    s.programId = "p";
    s.endedAt = `${date}T11:00:00.000Z`;
    s.startedAt = `${date}T10:00:00.000Z`;
    s.plan = [
      { id: "pe1", exerciseId: "base:Жим", order: 0, targetSets: 3, targetRepMin: 5 },
    ];
    s.exercises[0].plannedExerciseId = "pe1";
    return s;
  }

  const program: TrainingProgram = {
    id: "p",
    name: "Программа",
    workouts: [
      {
        id: "wA",
        name: "A",
        order: 0,
        exercises: [
          { id: "pe1", exerciseId: "base:Жим", order: 0, targetSets: 3, targetRepMin: 5 },
        ],
      },
    ],
    currentWorkoutIndex: 0,
    cycleNumber: 1,
    createdAt: "2026-07-01T00:00:00.000Z",
  };

  it("сравнивает две последние тренировки дня, прогресс веса", () => {
    const sessions = [doneWorkout("2026-07-15", 80), doneWorkout("2026-07-22", 90)];
    const progress = programProgress(program, sessions, [bench]);
    expect(progress).toHaveLength(1);
    const a = progress[0];
    expect(a.intervalDays).toBe(7);
    expect(a.plannedSets).toBe(3);
    expect(a.actualSets).toBe(3);
    expect(a.missed).toEqual([]);
    expect(a.deltas[0].status).toBe("up");
    expect(a.deltas[0].currWeight).toBe(90);
    expect(a.deltas[0].prevWeight).toBe(80);
  });

  it("нужно ≥2 выполненных тренировки дня", () => {
    const progress = programProgress(program, [doneWorkout("2026-07-22", 80)], [bench]);
    expect(progress).toEqual([]);
  });
});

describe("нагрузка и baseline", () => {
  const three = () => [set(80, 5), set(80, 5), set(80, 5)];

  it("baseline из активных недель, ratio и уровень", () => {
    const sessions = [
      strength("2026-07-20", three()),
      strength("2026-07-22", three()), // текущая неделя: 6 подходов
      strength("2026-07-15", three()), // −1 нед: 3
      strength("2026-07-08", three()), // −2 нед: 3
    ];
    const b = loadBaseline(sessions, "2026-07-23");
    expect(b.currentSets).toBe(6);
    expect(b.baselineSets).toBe(3);
    expect(b.ratio).toBeCloseTo(2);
    expect(b.level).toBe("wellAbove");
    expect(b.weeksUsed).toBe(2);
  });

  it("разгрузочная неделя исключается из baseline", () => {
    const deloadWk = strength("2026-07-15", three());
    deloadWk.deload = true;
    const sessions = [
      strength("2026-07-22", three()),
      deloadWk, // −1 нед разгрузка → мимо baseline
      strength("2026-07-08", [set(80, 5)]), // −2 нед: 1 подход
    ];
    const b = loadBaseline(sessions, "2026-07-23");
    expect(b.baselineSets).toBe(1); // только неразгрузочная неделя
    expect(b.weeksUsed).toBe(1);
  });

  it("нет истории — ratio null", () => {
    const b = loadBaseline([strength("2026-07-22", three())], "2026-07-23");
    expect(b.ratio).toBeNull();
    expect(b.level).toBe("usual");
  });

  it("heatmap: сетка недель × 7, активный день подсвечен", () => {
    const grid = heatmap([strength("2026-07-22", three())], 4, "2026-07-23");
    expect(grid).toHaveLength(4);
    expect(grid.every((col) => col.length === 7)).toBe(true);
    const cells = grid.flat();
    expect(cells.find((c) => c.date === "2026-07-22")?.level).toBeGreaterThan(0);
    expect(cells.find((c) => c.date === "2026-07-21")?.level).toBe(0);
  });
});

describe("резюме периода", () => {
  const bench: Exercise = {
    id: "base:Жим",
    name: "Жим штанги лёжа",
    muscleGroup: "chest",
    custom: false,
  };

  it("пустой период — короткая подсказка", () => {
    const period = buildPeriod("week", "2026-07-22", undefined, undefined, "2026-07-26");
    expect(periodSummary([], [], [], period, "За неделю")).toEqual([
      "За неделю тренировок не было.",
    ]);
  });

  it("факты и предложения по данным", () => {
    const sessions = [strength("2026-07-22", [set(90, 5), set(90, 5), set(90, 5)])];
    const period = buildPeriod("week", "2026-07-22", undefined, undefined, "2026-07-26");
    const f = summaryFacts(sessions, [bench], [], period);
    expect(f.workouts).toBe(1);
    expect(f.volume).toBe(90 * 5 * 3);
    expect(f.bestE1rm?.value).toBeCloseTo(105, 0);
    expect(f.topMuscles).toContain("Грудь");

    const lines = periodSummary(sessions, [bench], [], period, "За неделю");
    expect(lines[0]).toContain("1 тренировка");
    expect(lines.join(" ")).toContain("Жим штанги лёжа");
  });
});

describe("готовность", () => {
  it("без чек-ина — предварительная, по истории нагрузки", () => {
    const sessions = [strength("2026-07-21", [set(80, 5)])];
    const r = readiness(sessions, [], "2026-07-23");
    expect(r.hasSubjective).toBe(false);
    expect(r.confidence).toBe("preliminary");
    expect(r.daysSinceStrength).toBe(2);
    expect(r.subjective).toBeNull();
  });

  it("свежий чек-ин даёт субъективную оценку", () => {
    const entry = {
      id: "r1",
      date: "2026-07-23",
      wellbeing: 4,
      sleep: 5,
      freshness: 3,
      motivation: 4,
    };
    const r = readiness([], [entry], "2026-07-23");
    expect(r.hasSubjective).toBe(true);
    expect(r.subjective).toBeCloseTo(4);
    expect(r.confidence).toBe("medium");
  });

  it("старый чек-ин (>2 дней) не берётся", () => {
    const entry = {
      id: "r1",
      date: "2026-07-19",
      wellbeing: 4,
      sleep: 4,
      freshness: 4,
      motivation: 4,
    };
    expect(readiness([], [entry], "2026-07-23").hasSubjective).toBe(false);
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
