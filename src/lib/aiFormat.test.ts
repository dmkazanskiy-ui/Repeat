import { describe, expect, it } from "vitest";
import { applyImport, extractJson, prepareImport, type ImportTarget } from "./aiFormat";
import { creditCandidates, goalLine, periodSummary, plannedOn, reconcilePlanned, slotState } from "./plan";
import { CATALOG } from "./catalog";
import { newSession, newSessionExercise } from "./store";
import { sessionVolume } from "./types";
import type { Exercise, Session, TrainingProgram } from "./types";

const base: Exercise[] = CATALOG.map((c) => ({ id: `base:${c.name}`, name: c.name, muscleGroup: c.muscleGroup, custom: false }));

const MINI = {
  format: "repeat-plan",
  version: 1,
  name: "Тест-план",
  start: "2026-11-30",
  end: "2026-12-01",
  program: {
    name: "Тест А/Б",
    progression: { type: "double", stepKg: 2.5, dumbbellStepKg: 2 },
    wave: null,
    deloadEveryWeeks: 6,
    workouts: {
      B: { name: "День Б", exercises: [
        { exercise: "Приседания со штангой на спине", sets: 3, repMin: 6, repMax: 10, startWeightKg: 95 },
        { exercise: "Подъём на носки стоя", sets: 3, repMin: 15, repMax: 12 },
      ] },
      A: { name: "День А", exercises: [{ exercise: "Скручивания на блоке", sets: 3, repMin: 12, repMax: 15 }] },
    },
  },
  days: [
    { date: "2026-11-30", sessions: [
      { slot: "morning", time: "05:45", kind: "strength", title: "Зал Б", programWorkout: "B" },
      { slot: "day", time: "11:00", kind: "cardio", title: "Дорожка в наклон", cardioKind: "Ходьба на дорожке", durationMin: 50, hrMin: 110, hrMax: 130, inclineDeg: [5, 8] },
    ] },
    { date: "2026-12-01", sessions: [
      { slot: "morning", time: "05:45", kind: "cardio", title: "Бег с клубом", cardioKind: "Бег", durationMin: 30, hrMin: 135, hrMax: 145, cadenceMin: 158, cadenceMax: 160 },
      { slot: "day", time: "11:00", kind: "recovery", title: "Бассейн + сауна + купель", items: [
        { kind: "Плавание", durationMin: [20, 30] },
        { kind: "Баня", durationMin: [20, 30], note: "2 захода" },
        { kind: "Холодная купель", durationMin: [2, 3], optional: true },
      ] },
    ] },
  ],
  rules: { coldAfterStrength: "холодную купель не ставить в дни силовых" },
};

function empty(): ImportTarget {
  return { exercises: base, programs: [], plans: [], plannedSessions: [], sessions: [] };
}

function benchSession(date: string): Session {
  const s = newSession(date, "strength");
  const e = newSessionExercise("base:Жим штанги лёжа");
  e.sets = e.sets.map((x) => ({ ...x, weight: 80, reps: 8, done: true }));
  s.exercises = [e];
  s.endedAt = `${date}T10:00:00.000Z`;
  return s;
}

describe("extractJson", () => {
  it("находит JSON в ответе ИИ с текстом и блоком кода", () => {
    const text = 'Вот план:\n```json\n{"format":"repeat-plan","version":1}\n```\nУдачи!';
    expect(extractJson(text)).toEqual({ format: "repeat-plan", version: 1 });
    expect(extractJson('Ответ: {"a": "}"} и всё')).toEqual({ a: "}" });
    expect(extractJson("просто текст")).toBeNull();
  });
});

describe("импорт плана", () => {
  it("создаёт программу, свои упражнения и карточки; купель и баня — отдельные карточки", () => {
    const res = prepareImport(JSON.stringify(MINI), { ...empty(), source: "файл" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const p = res.prep;
    expect(p.program?.workouts.map((w) => w.name)).toEqual(["День А", "День Б"]);
    expect(p.program?.wave).toBeNull();
    expect(p.program?.deloadEveryWeeks).toBe(6);
    expect(p.program?.progression?.stepKg).toBe(2.5);
    // «Подъём на носки стоя» = каталожное «Подъёмы на носки стоя»; скручивания на блоке — своё, пресс.
    expect(p.newExercises.map((e) => [e.name, e.muscleGroup])).toEqual([["Скручивания на блоке", "core"]]);
    const b = p.program!.workouts.find((w) => w.name === "День Б")!;
    expect(b.exercises[1].exerciseId).toBe("base:Подъёмы на носки стоя");
    // Перепутанный диапазон чинится.
    expect([b.exercises[1].targetRepMin, b.exercises[1].targetRepMax]).toEqual([12, 15]);
    expect(b.exercises[0].targetWeight).toBe(95);
    expect(p.counts.plannedNew).toBe(6);
    const pool = p.planned.filter((c) => c.group === "Бассейн + сауна + купель");
    expect(pool.map((c) => [c.kind, c.cardioKind ?? c.recoveryType])).toEqual([
      ["cardio", "swim"],
      ["recovery", "banya"],
      ["recovery", "cold_plunge"],
    ]);
    expect(pool[2].optional).toBe(true);
    const tread = p.planned.find((c) => c.title === "Дорожка в наклон")!;
    expect(tread.cardioKind).toBe("treadmill");
    expect(goalLine(tread)).toBe("50 мин · пульс 110–130 · наклон 5–8°");
  });

  it("повторный импорт ничего не задваивает, история не меняется", () => {
    const history = [benchSession("2026-11-20"), benchSession("2026-11-25")];
    const before = { n: history.length, vol: history.reduce((a, s) => a + sessionVolume(s), 0) };
    const first = prepareImport(MINI, { ...empty(), sessions: history });
    if (!first.ok) throw new Error(first.error);
    const once = applyImport(first.prep, { ...empty(), sessions: history });
    const second = prepareImport(MINI, once);
    if (!second.ok) throw new Error(second.error);
    expect(second.prep.program).toBeNull();
    expect(second.prep.plan).toBeNull();
    expect(second.prep.planned).toHaveLength(0);
    expect(second.prep.newExercises).toHaveLength(0);
    const twice = applyImport(second.prep, once);
    expect(twice.programs).toHaveLength(1);
    expect(twice.plannedSessions).toHaveLength(6);
    expect(twice.exercises.filter((e) => e.custom)).toHaveLength(1);
    expect(twice.sessions.length).toBe(before.n);
    expect(twice.sessions.reduce((a, s) => a + sessionVolume(s), 0)).toBe(before.vol);
  });

  it("старая программа уходит в архив только по просьбе", () => {
    const old: TrainingProgram = { id: "old", name: "Цикл сплит", workouts: [], currentWorkoutIndex: 0, cycleNumber: 1, createdAt: "2026-01-01" };
    const res = prepareImport(MINI, { ...empty(), programs: [old] });
    if (!res.ok) throw new Error(res.error);
    expect(applyImport(res.prep, { ...empty(), programs: [old] }).programs.find((p) => p.id === "old")?.archivedAt).toBeFalsy();
    expect(applyImport(res.prep, { ...empty(), programs: [old] }, ["old"]).programs.find((p) => p.id === "old")?.archivedAt).toBeTruthy();
  });
});

describe("план ⇄ тренировки", () => {
  function imported() {
    const res = prepareImport(MINI, empty());
    if (!res.ok) throw new Error(res.error);
    return applyImport(res.prep, empty());
  }

  it("сегодня: утро — «Зал Б», день — «Дорожка 50 мин»", () => {
    const t = imported();
    const day = plannedOn(t.plannedSessions, t.plans, "2026-11-30");
    expect(day.map((d) => [d.slot, d.title])).toEqual([
      ["morning", "Зал Б"],
      ["day", "Дорожка в наклон"],
    ]);
    expect(day[1].durationMin).toBe(50);
  });

  it("завершённая тренировка закрывает карточку, удалённая — возвращает", () => {
    const t = imported();
    const card = t.plannedSessions.find((c) => c.title === "Бег с клубом")!;
    const run = newSession("2026-12-01", "cardio", { cardioKind: "run" });
    run.plannedSessionId = card.id;
    let planned = reconcilePlanned(t.plannedSessions, [run]);
    expect(planned.find((c) => c.id === card.id)?.status).toBe("planned");
    expect(planned.find((c) => c.id === card.id)?.linkedSessionId).toBe(run.id);
    run.endedAt = "2026-12-01T07:00:00.000Z";
    planned = reconcilePlanned(planned, [run]);
    expect(planned.find((c) => c.id === card.id)?.status).toBe("done");
    planned = reconcilePlanned(planned, []);
    expect(planned.find((c) => c.id === card.id)).toMatchObject({ status: "planned", linkedSessionId: null });
  });

  it("слот засчитан, когда закрыты обязательные карточки; итог недели", () => {
    const t = imported();
    const pool = t.plannedSessions.filter((c) => c.group);
    const done = pool.map((c) => (c.optional ? c : { ...c, status: "done" as const }));
    expect(slotState(done)).toBe("done");
    expect(slotState(pool)).toBe("planned");
    const walk = newSession("2026-11-30", "cardio", { cardioKind: "treadmill" });
    walk.cardio = { durationSec: 45 * 60, distanceM: null, avgHr: null };
    walk.endedAt = "2026-11-30T12:00:00.000Z";
    const sum = periodSummary(t.plannedSessions, [walk], ["2026-11-30", "2026-12-01"]);
    expect(sum.slots).toBe(4);
    expect(sum.minutes.treadmill).toEqual({ plan: 50, fact: 45 });
    expect(sum.minutes.run.plan).toBe(30);
    const card = t.plannedSessions.find((c) => c.title === "Дорожка в наклон")!;
    expect(creditCandidates(card, [walk], t.plannedSessions).map((s) => s.id)).toEqual([walk.id]);
  });

  it("тренировка того же вида, сделанная вручную, засчитывается сама", () => {
    const t = imported();
    const walk = newSession("2026-11-30", "cardio", { cardioKind: "treadmill" });
    walk.endedAt = "2026-11-30T12:00:00.000Z";
    const bike = newSession("2026-11-30", "cardio", { cardioKind: "bike" });
    bike.endedAt = "2026-11-30T13:00:00.000Z";
    const next = reconcilePlanned(t.plannedSessions, [bike, walk]);
    expect(next.find((c) => c.title === "Дорожка в наклон")).toMatchObject({ status: "done", linkedSessionId: walk.id });
    // Другой вид сам не засчитывается; силовая без тренировки так и ждёт.
    expect(next.filter((c) => c.linkedSessionId === bike.id)).toHaveLength(0);
    expect(next.find((c) => c.title === "Зал Б")?.status).toBe("planned");
  });

  it("записанная от ИИ тренировка закрывает карточку дня", () => {
    const t = imported();
    const res = prepareImport(
      { format: "repeat-workout", version: 1, workouts: [{ date: "2026-12-01", time: "06:00", kind: "cardio", cardioKind: "run", done: true, durationMin: 32, distanceKm: 5.1, avgHr: 141 }] },
      t,
    );
    if (!res.ok) throw new Error(res.error);
    expect(res.prep.links).toHaveLength(1);
    const next = applyImport(res.prep, t);
    expect(next.plannedSessions.find((c) => c.title === "Бег с клубом")?.status).toBe("done");
    expect(next.sessions[0].cardio?.distanceM).toBe(5100);
    // Повторная вставка — без дублей.
    const again = prepareImport(
      { format: "repeat-workout", version: 1, workouts: [{ date: "2026-12-01", time: "06:00", kind: "cardio", cardioKind: "run", done: true, durationMin: 32, distanceKm: 5.1, avgHr: 141 }] },
      next,
    );
    expect(again.ok && again.prep.sessions.length).toBe(0);
  });
});

// Реальный план на декабрь, если файл лежит в репозитории (plans/ не коммитится).
const REAL = Object.values(
  import.meta.glob<string>("../../plans/repeat-plan-2026-12.json", { eager: true, query: "?raw", import: "default" }),
)[0];
describe.skipIf(!REAL)("план на декабрь 2026", () => {
  it("4 тренировки, 28 упражнений, 56 слотов с 30.11 по 27.12", () => {
    const res = prepareImport(REAL!, empty());
    if (!res.ok) throw new Error(res.error);
    const p = res.prep;
    expect(p.counts.workouts).toBe(4);
    expect(p.counts.exercises).toBe(28);
    expect(p.range).toEqual({ start: "2026-11-30", end: "2026-12-27" });
    const slots = new Set(p.planned.map((c) => `${c.date}|${c.slot}`));
    expect(slots.size).toBe(56);
    expect(p.newExercises.map((e) => e.name)).toEqual(["Скручивания на блоке"]);
    expect(p.warnings).toEqual([]);
    const t = applyImport(p, empty());
    const first = plannedOn(t.plannedSessions, t.plans, "2026-11-30");
    expect(first.map((c) => `${c.slot}:${c.title}:${c.durationMin ?? ""}`)).toEqual(["morning:Зал Б:", "day:Дорожка в наклон:50"]);
  });
});
