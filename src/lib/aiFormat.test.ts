import { describe, expect, it } from "vitest";
import { applyImport, extractJson, importRecord, prepareImport, undoImport, type ImportTarget } from "./aiFormat";
import { archivePlans, cardCompliance, creditCandidates, goalLine, overlappingPlans, periodSummary, plannedOn, reconcilePlanned, slotState } from "./plan";
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

  it("отмена импорта убирает ровно добавленное и возвращает программу из архива", () => {
    const old: TrainingProgram = { id: "old", name: "Цикл сплит", workouts: [], currentWorkoutIndex: 0, cycleNumber: 1, createdAt: "2026-01-01" };
    const history = [benchSession("2026-11-20")];
    const before = { ...empty(), programs: [old], sessions: history };
    const res = prepareImport(MINI, before);
    if (!res.ok) throw new Error(res.error);
    const after = applyImport(res.prep, before, ["old"]);
    const rec = importRecord(res.prep, before, after, ["old"]);
    expect([rec.programIds.length, rec.planIds.length, rec.plannedIds.length, rec.exerciseIds.length]).toEqual([1, 1, 6, 1]);
    const back = undoImport(rec, after);
    expect(back.programs).toEqual([{ ...old, archivedAt: null }]);
    expect(back.plans).toHaveLength(0);
    expect(back.plannedSessions).toHaveLength(0);
    expect(back.sessions).toEqual(history);
    expect(back.exercises.filter((e) => e.custom)).toHaveLength(0);
  });

  it("второй план на те же даты: видно пересечение, замена архивирует старый с программой, отмена возвращает", () => {
    const first = prepareImport(MINI, empty());
    if (!first.ok) throw new Error(first.error);
    const one = applyImport(first.prep, empty());
    const v2 = { ...MINI, name: "Тест-план (v2)", program: { ...MINI.program, name: "Тест А/Б v2" } };
    const second = prepareImport(v2, one);
    if (!second.ok) throw new Error(second.error);
    const over = overlappingPlans(one.plans, second.prep.range!.start, second.prep.range!.end, second.prep.plan!.id);
    expect(over.map((p) => p.name)).toEqual(["Тест-план"]);
    let two = applyImport(second.prep, one);
    const res = archivePlans(over.map((p) => p.id), two);
    two = { ...two, plans: res.plans, programs: res.programs };
    expect(res.archivedProgramIds).toEqual([over[0].programId]);
    // Карточки старого плана пропали с экрана дня, новые на месте.
    expect(plannedOn(two.plannedSessions, two.plans, "2026-11-30").every((c) => c.planId === second.prep.plan!.id)).toBe(true);
    const rec = importRecord(second.prep, one, two, res.archivedProgramIds, new Date(), over.map((p) => p.id));
    const back = undoImport(rec, two);
    expect(back.plans.map((p) => [p.name, p.archivedAt ?? null])).toEqual([["Тест-план", null]]);
    expect(back.programs.map((p) => [p.name, p.archivedAt ?? null])).toEqual([["Тест А/Б", null]]);
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

  it("точность выполнения: время к цели и пульс в коридоре", () => {
    const t = imported();
    const card = t.plannedSessions.find((c) => c.title === "Бег с клубом")!; // 30 мин, пульс 135–145
    const run = newSession("2026-12-01", "cardio", { cardioKind: "run" });
    run.cardio = { durationSec: 30 * 60, distanceM: 5000, avgHr: 140 };
    run.endedAt = "2026-12-01T07:00:00.000Z";
    expect(cardCompliance(card, run)).toBe(100);
    run.cardio = { durationSec: 24 * 60, distanceM: 4000, avgHr: 150 }; // 80% времени, пульс на 5 выше коридора шириной 10
    expect(cardCompliance(card, run)).toBe(65);
    run.plannedSessionId = card.id;
    const next = reconcilePlanned(t.plannedSessions, [run]);
    expect(next.find((c) => c.id === card.id)).toMatchObject({ status: "done", compliance: 65 });
    expect(periodSummary(next, [run], ["2026-12-01"]).accuracy).toBe(65);
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

describe("тренировки с часов (автоимпорт)", () => {
  const w = (extra: Record<string, unknown> = {}) => ({
    format: "repeat-workout", version: 1,
    workouts: [{ date: "2026-11-25", time: "06:02", kind: "cardio", cardioKind: "run", done: true, durationMin: 34.66,
      source: { provider: "garmin", externalId: "25190042001", detail: "streams" },
      summary: { startedAt: "2026-11-24T22:02:59Z", timerSec: 2079.9, elapsedSec: 2355.7, distanceM: 5009.97, avgHr: 151, maxHr: 166 }, ...extra }],
  });
  it("новая — со связью с источником и точной сводкой; повтор — без дубля", () => {
    const r = prepareImport(w(), empty());
    if (!r.ok) throw new Error(r.error);
    const s = r.prep.sessions[0];
    expect(s.id).toBe("garmin_25190042001");
    expect(s.source).toMatchObject({ provider: "garmin", externalId: "25190042001", detail: "streams" });
    expect(s.cardio?.durationSec).toBe(2079.9);
    expect(s.stats?.elapsedSec).toBe(2355.7);
    const t = applyImport(r.prep, empty());
    const again = prepareImport(w(), t);
    expect(again.ok && [again.prep.sessions.length, again.prep.counts.sessionsKnown]).toEqual([0, 1]);
  });
  it("та же пробежка, записанная вручную или из другого источника без связи, — дополняется, а не дублируется", () => {
    const manual = newSession("2026-11-25", "cardio", { cardioKind: "run" });
    manual.time = "06:00";
    manual.notes = "моя заметка";
    const cur = { ...empty(), sessions: [manual] };
    const r = prepareImport(w(), cur);
    if (!r.ok) throw new Error(r.error);
    expect([r.prep.sessions.length, r.prep.merges.length]).toEqual([0, 1]);
    const next = applyImport(r.prep, cur);
    expect(next.sessions).toHaveLength(1);
    expect(next.sessions[0]).toMatchObject({ id: manual.id, notes: "моя заметка", source: { provider: "garmin", externalId: "25190042001" } });
    expect(next.sessions[0].cardio?.distanceM).toBe(5009.97);
  });
});

describe("часы ⇄ дневник: по дню и виду", () => {
  const run = (id: string, time: string, km: number) => ({
    date: "2026-11-25", time, kind: "cardio", cardioKind: "run", done: true, durationMin: 30,
    source: { provider: "garmin", externalId: id, detail: "streams" },
    summary: { timerSec: 1800, distanceM: km * 1000, avgHr: 150 },
  });
  const doc = (...workouts: unknown[]) => ({ format: "repeat-workout", version: 1, workouts });

  it("время в дневнике на глаз (разница 3 часа) — всё равно та же пробежка, данные часов точнее", () => {
    const mine = newSession("2026-11-25", "cardio", { cardioKind: "run" });
    mine.time = "09:00";
    mine.cardio = { durationSec: 1500, distanceM: 4000, avgHr: null };
    const cur = { ...empty(), sessions: [mine] };
    const r = prepareImport(doc(run("a", "06:02", 5.01)), cur);
    if (!r.ok) throw new Error(r.error);
    const next = applyImport(r.prep, cur);
    expect(next.sessions).toHaveLength(1);
    expect(next.sessions[0].cardio).toMatchObject({ durationSec: 1800, distanceM: 5010 });
  });

  it("две пробежки на часах, одна в дневнике — пара по ближайшему времени и +1 новая", () => {
    const mine = newSession("2026-11-25", "cardio", { cardioKind: "run" });
    mine.time = "18:30";
    const cur = { ...empty(), sessions: [mine] };
    const r = prepareImport(doc(run("am", "06:00", 5), run("pm", "18:10", 8)), cur);
    if (!r.ok) throw new Error(r.error);
    expect(r.prep.merges.map((m) => [m.sessionId, m.payload.externalActivityId])).toEqual([[mine.id, "pm"]]);
    expect(r.prep.sessions.map((s) => s.source?.externalId)).toEqual(["am"]);
    const next = applyImport(r.prep, cur);
    expect(next.sessions).toHaveLength(2);
  });

  it("силовая — монумент: упражнения, подходы и время дневника не трогаются, с часов только пульс", () => {
    const gym = newSession("2026-11-25", "strength");
    gym.time = "10:00";
    gym.startedAt = "2026-11-25T02:00:00.000Z";
    gym.endedAt = "2026-11-25T03:10:00.000Z";
    const ex = newSessionExercise("base:Жим штанги лёжа");
    ex.sets = ex.sets.map((x) => ({ ...x, weight: 90, reps: 8, done: true }));
    gym.exercises = [ex];
    const cur = { ...empty(), sessions: [gym] };
    const watch = { date: "2026-11-25", time: "10:49", kind: "strength", title: "Силовая тренировка", done: true,
      source: { provider: "garmin", externalId: "g1", detail: "streams" },
      summary: { startedAt: "2026-11-25T02:49:00Z", timerSec: 3097, elapsedSec: 3097, avgHr: 119, maxHr: 150, calories: 300 } };
    const r = prepareImport(doc(watch), cur);
    if (!r.ok) throw new Error(r.error);
    const after = applyImport(r.prep, cur).sessions[0];
    expect(after.exercises).toEqual(gym.exercises);
    expect([after.startedAt, after.endedAt, after.title]).toEqual([gym.startedAt, gym.endedAt, gym.title]);
    expect(after).toMatchObject({ avgHr: 119, calories: 300, source: { provider: "garmin", externalId: "g1" } });
    expect(after.stats).toMatchObject({ watchTimerSec: 3097, maxHr: 150 });
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
