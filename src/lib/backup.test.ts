import { describe, expect, it } from "vitest";
import { buildExport, parseExport, planMerge } from "./backup";
import type { BackupData } from "./backup";
import { newSession, newSessionExercise } from "./store";
import { addDays, today } from "./format";
import type { Exercise } from "./types";

const exercises: Exercise[] = [
  { id: "base:Жим штанги лёжа", name: "Жим штанги лёжа", nameEn: "Barbell bench press", muscleGroup: "chest", custom: false },
  { id: "my1", name: "Жим в своём тренажёре", muscleGroup: "chest", custom: true },
];

function strength(date: string, weight: number) {
  const s = newSession(date, "strength");
  const e = newSessionExercise("base:Жим штанги лёжа");
  e.sets = e.sets.map((x, i) => ({
    ...x,
    weight,
    reps: 8,
    done: true,
    ...(i === 2 ? { drops: [{ id: "d1", weight: weight - 15, reps: 6 }] } : {}),
  }));
  s.exercises = [e];
  s.endedAt = `${date}T20:00:00.000Z`;
  s.notes = "тяжело зашло";
  return s;
}

function data(): BackupData {
  const old = strength(addDays(today(), -40), 80);
  const recent = strength(addDays(today(), -2), 85);
  return {
    sessions: [old, recent],
    customExercises: [exercises[1]],
    cardioKinds: [{ name: "Гребля", icon: "bolt" }],
    mobilityKinds: [],
    bodyEntries: [
      { id: "b1", date: addDays(today(), -3), weightKg: 82.4, chest: null, waist: null, hips: null, biceps: null, thigh: null, neck: null, notes: null },
    ],
    programs: [],
    recovery: [],
    focusGoal: "strength",
  };
}

describe("backup export/import", () => {
  it("всё время: восстанавливает данные один в один", () => {
    const src = data();
    const text = buildExport(src, exercises, "all");
    const parsed = parseExport(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.file.data.sessions).toEqual(
      [...src.sessions].sort((a, b) => a.date.localeCompare(b.date)),
    );
    expect(parsed.file.data.customExercises).toEqual(src.customExercises);
    expect(parsed.file.data.bodyEntries).toEqual(src.bodyEntries);
    expect(parsed.file.data.focusGoal).toBe("strength");
  });

  it("сводка читаема: упражнения, подходы, дропы, заметки, вес", () => {
    const text = buildExport(data(), exercises, "all");
    expect(text).toContain("Жим штанги лёжа: 85×8, 85×8, 85×8 → 70×6");
    expect(text).toContain("тяжело зашло");
    expect(text).toContain("82,4");
    expect(text).toContain("Проанализируй");
  });

  it("период: неделя берёт только свежие тренировки, справочники — целиком", () => {
    const parsed = parseExport(buildExport(data(), exercises, "week"));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.file.data.sessions).toHaveLength(1);
    expect(parsed.file.data.customExercises).toHaveLength(1);
  });

  it("вставка в пустую базу добавляет всё, повторная — ничего", () => {
    const src = data();
    const parsed = parseExport(buildExport(src, exercises, "all"));
    if (!parsed.ok) throw new Error(parsed.error);
    const empty: BackupData = {
      sessions: [], customExercises: [], cardioKinds: [], mobilityKinds: [],
      bodyEntries: [], programs: [], recovery: [], focusGoal: null,
    };
    const first = planMerge(empty, parsed.file.data);
    expect(first.added.sessions).toBe(2);
    expect(first.next.cardioKinds).toHaveLength(1);
    expect(first.next.focusGoal).toBe("strength");
    const again = planMerge(first.next, parsed.file.data);
    expect(again.added.sessions).toBe(0);
    expect(again.skipped).toBe(2);
    expect(again.next.sessions).toHaveLength(2);
  });

  it("не затирает то, что уже внесено на новом месте", () => {
    const src = data();
    const parsed = parseExport(buildExport(src, exercises, "all"));
    if (!parsed.ok) throw new Error(parsed.error);
    const mine = strength(today(), 90);
    const plan = planMerge({ ...parsed.file.data, sessions: [mine], focusGoal: "muscle" }, parsed.file.data);
    expect(plan.next.sessions).toHaveLength(3);
    expect(plan.next.focusGoal).toBe("muscle");
  });

  it("обрезанный или чужой текст — понятная ошибка", () => {
    const text = buildExport(data(), exercises, "all");
    expect(parseExport(text.slice(0, text.length - 40)).ok).toBe(false);
    expect(parseExport("привет").ok).toBe(false);
    const broken = text.replace('"format":"repeat-export"', '"format":"other"');
    expect(parseExport(broken).ok).toBe(false);
  });
});
