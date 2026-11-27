import { describe, expect, it } from "vitest";
import { applyEnrich, clock, findBySource, lapPace, migrateSourceNotes, minMaxDownsample, pace } from "./activityDetail";
import { newSession } from "./store";
import { sessionDurationSec } from "./types";

function corosRun() {
  const s = newSession("2026-11-25", "cardio", { cardioKind: "run" });
  s.notes = "Бодро!\nИмпорт из COROS. ID: 482013868569166128";
  s.cardio = { durationSec: 3240, distanceM: 11880, avgHr: 161 };
  s.startedAt = "2026-11-25T17:03:00.000Z";
  s.endedAt = "2026-11-25T17:57:00.000Z";
  s.photos = [{ id: "p1", w: 1, h: 1 }];
  return s;
}

describe("связь с COROS и обогащение", () => {
  it("ID из служебной строки заметки — в source, остальной текст заметки цел", () => {
    const { sessions, changed } = migrateSourceNotes([corosRun(), newSession("2026-11-25", "strength")]);
    expect(changed).toBe(1);
    expect(sessions[0].source).toEqual({ provider: "coros", externalId: "482013868569166128", verified: false });
    expect(sessions[0].notes).toBe("Бодро!");
    // Похожий текст, но не служебная строка — не трогаем.
    const other = newSession("2026-11-25", "cardio");
    other.notes = "мой ID: 123456789 в клубе";
    expect(migrateSourceNotes([other]).changed).toBe(0);
  });

  it("обогащение: точное время с секундами, реальный конец, фото и заметки на месте, ID тот же", () => {
    const s = migrateSourceNotes([corosRun()]).sessions[0];
    expect(findBySource([s], "coros", "482013868569166128")?.id).toBe(s.id);
    const p = {
      source: "coros", externalActivityId: "482013868569166128", level: "streams" as const,
      summary: { startedAt: "2026-11-25T17:03:00.000Z", timerSec: 3258, elapsedSec: 5485, distanceM: 11877.31, avgHr: 161, maxHr: 181, calories: 810, trainingLoad: 199, aerobicTE: 3.3 },
    };
    let e = applyEnrich(s, p);
    e = applyEnrich(applyEnrich(e, p), p); // три раза — то же самое
    expect(e.id).toBe(s.id);
    expect(e.cardio?.durationSec).toBe(3258);
    expect(e.cardio?.distanceM).toBe(11877.31);
    expect(e.endedAt).toBe("2026-11-25T18:34:25.000Z"); // начало + 1:31:25
    expect(sessionDurationSec(e)).toBe(3258); // длительность = таймер, паузы учтены
    expect(e.stats).toMatchObject({ elapsedSec: 5485, maxHr: 181, trainingLoad: 199, aerobicTE: 3.3 });
    expect(e.photos).toEqual(s.photos);
    expect(e.notes).toBe("Бодро!");
    expect(e.source).toMatchObject({ verified: true, detail: "streams" });
  });

  it("форматы: секунды и сотые, темп при нулевой дистанции — прочерк", () => {
    expect(clock(3258)).toBe("54:18");
    expect(clock(5485)).toBe("1:31:25");
    expect(clock(1.98, true)).toBe("0:01,98");
    expect(pace(274)).toBe("4:34");
    expect(lapPace({ group: "recorded", index: 1, distanceM: 0, timerSec: 1.98 })).toBeNull();
    expect(pace(lapPace({ group: "recorded", index: 2, distanceM: 176.84, timerSec: 52.14 }))).toBe("4:55");
  });

  it("прореживание сохраняет пики и разрывы", () => {
    const x = Array.from({ length: 1000 }, (_, i) => i);
    const y: (number | null)[] = x.map((i) => (i === 500 ? 200 : i >= 700 && i < 720 ? null : 100));
    const d = minMaxDownsample(x, y, 50);
    expect(d.length).toBeLessThan(200);
    expect(d.some((p) => p.y === 200)).toBe(true);
    expect(d.some((p) => p.y === null)).toBe(true);
  });
});
