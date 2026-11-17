import { describe, expect, it } from "vitest";
import { applyRemote, diffAgainst, fromRecords, toRecords } from "./sync";
import type { BackupData } from "./backup";
import { newSession } from "./store";

function data(ids: string[]): BackupData {
  return {
    sessions: ids.map((id) => ({ ...newSession("2026-11-10", "strength"), id, createdAt: "x" })),
    customExercises: [],
    cardioKinds: [],
    mobilityKinds: [],
    bodyEntries: [],
    programs: [],
    recovery: [],
    focusGoal: "strength",
    consent: { version: 1, at: "2026-11-17T10:00:00.000Z" },
  };
}
const shadowOf = (d: BackupData) =>
  Object.fromEntries([...toRecords(d)].map(([k, r]) => [k, r.json]));

describe("sync", () => {
  it("записи туда-обратно без потерь", () => {
    const d = data(["a", "b"]);
    expect(fromRecords(toRecords(d), d)).toEqual(d);
  });

  it("diff: новые, правленые и удалённые", () => {
    const before = data(["a", "b"]);
    const after = data(["a", "c"]);
    after.sessions[0].notes = "правка";
    const ch = diffAgainst(toRecords(after), shadowOf(before), 1);
    const byId = Object.fromEntries(ch.filter((c) => c.c === "sessions").map((c) => [c.id, c.data]));
    expect(Object.keys(byId).sort()).toEqual(["a", "b", "c"]);
    expect(byId.b).toBeNull();
  });

  it("нет изменений — пустой diff", () => {
    const d = data(["a"]);
    expect(diffAgainst(toRecords(d), shadowOf(d), 1)).toEqual([]);
  });

  it("удалённое на другом устройстве удаляется, новое добавляется", () => {
    const d = data(["a", "b"]);
    const recs = toRecords(d);
    const remoteNew = { ...d.sessions[0], id: "z" };
    const res = applyRemote(recs, recs, shadowOf(d), [
      { c: "sessions", id: "b", ts: 2, data: null },
      { c: "sessions", id: "z", ts: 2, data: remoteNew },
    ]);
    expect(res.changed).toBe(true);
    expect(fromRecords(res.recs, d).sessions.map((s) => s.id)).toEqual(["a", "z"]);
  });

  it("правку, сделанную во время запроса, ответ сервера не затирает", () => {
    const d = data(["a"]);
    const sent = toRecords(d);
    const edited = data(["a"]);
    edited.sessions[0].notes = "пока шёл запрос";
    const res = applyRemote(sent, toRecords(edited), shadowOf(d), [
      { c: "sessions", id: "a", ts: 3, data: { ...d.sessions[0], notes: "с сервера" } },
    ]);
    expect(fromRecords(res.recs, edited).sessions[0].notes).toBe("пока шёл запрос");
    // Тень не обновлена — правка уйдёт в следующий обмен.
    expect(diffAgainst(res.recs, res.shadow, 4)).toHaveLength(1);
  });
});
