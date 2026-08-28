import { describe, expect, it } from "vitest";
import type { Session, WodData } from "../types";
import {
  formatWodResult,
  isBetterAttempt,
  wodAttempts,
  wodBest,
  wodHistory,
  wodKey,
} from "./wod";

let seq = 0;
const id = () => `w${seq++}`;

function wod(date: string, data: Partial<WodData>, title: string | null = null): Session {
  return {
    id: id(),
    date,
    kind: "wod",
    cardioKind: null,
    title,
    notes: null,
    createdAt: `${date}T10:00:00.000Z`,
    exercises: [],
    cardio: null,
    wod: { presetId: null, scheme: null, score: "for_time", ...data },
  };
}

describe("ключ задания", () => {
  it("каталожное сравнивается по presetId", () => {
    expect(wodKey(wod("2026-08-01", { presetId: "wod:fran", timeSec: 300 }))).toBe("wod:fran");
  });

  it("своё — по названию без регистра", () => {
    expect(wodKey(wod("2026-08-01", { timeSec: 300 }, "  Мой WOD "))).toBe("name:мой wod");
  });

  it("не-задание ключа не имеет", () => {
    const s = { ...wod("2026-08-01", {}), kind: "strength" as const };
    expect(wodKey(s)).toBeNull();
  });
});

describe("попытки и лучший результат", () => {
  const sessions = [
    wod("2026-06-01", { presetId: "wod:fran", timeSec: 300 }),
    wod("2026-07-01", { presetId: "wod:fran", timeSec: 252 }),
    wod("2026-08-01", { presetId: "wod:fran", timeSec: 268 }),
    wod("2026-08-05", { presetId: "wod:fran" }), // результат ещё не занесён
    wod("2026-08-02", { presetId: "wod:grace", timeSec: 180 }),
  ];

  it("берёт только своё задание и только с результатом, по возрастанию даты", () => {
    const attempts = wodAttempts(sessions, "wod:fran");
    expect(attempts.map((a) => a.date)).toEqual(["2026-06-01", "2026-07-01", "2026-08-01"]);
  });

  it("на время лучший — минимальное время", () => {
    expect(wodBest(wodAttempts(sessions, "wod:fran"))?.timeSec).toBe(252);
  });

  it("уложился в лимит лучше, чем не уложился", () => {
    const attempts = wodAttempts(
      [
        wod("2026-06-01", { presetId: "wod:isabel", timeSec: 600, capped: true }),
        wod("2026-07-01", { presetId: "wod:isabel", timeSec: 640 }),
      ],
      "wod:isabel",
    );
    expect(wodBest(attempts)?.timeSec).toBe(640);
  });

  it("AMRAP: сначала раунды, потом добитые повторы", () => {
    const attempts = wodAttempts(
      [
        wod("2026-06-01", { presetId: "wod:cindy", score: "amrap", rounds: 18, reps: 5 }),
        wod("2026-07-01", { presetId: "wod:cindy", score: "amrap", rounds: 18, reps: 12 }),
        wod("2026-08-01", { presetId: "wod:cindy", score: "amrap", rounds: 17, reps: 25 }),
      ],
      "wod:cindy",
    );
    const best = wodBest(attempts);
    expect(best?.rounds).toBe(18);
    expect(best?.reps).toBe(12);
  });

  it("сравнение с пустым — всегда лучше", () => {
    const [a] = wodAttempts(sessions, "wod:grace");
    expect(isBetterAttempt(a, null)).toBe(true);
  });
});

describe("история заданий", () => {
  it("группирует по заданию, свежие сверху, помечает рекорд последней попыткой", () => {
    const history = wodHistory([
      wod("2026-06-01", { presetId: "wod:fran", timeSec: 300 }),
      wod("2026-07-01", { presetId: "wod:fran", timeSec: 252 }),
      wod("2026-08-02", { presetId: "wod:grace", timeSec: 180 }),
    ]);
    expect(history.map((h) => h.key)).toEqual(["wod:grace", "wod:fran"]);
    expect(history[1].attempts).toHaveLength(2);
    expect(history[1].bestIsLast).toBe(true); // 252 — как раз последняя
    expect(history[0].bestIsLast).toBe(true);
  });
});

describe("формат результата", () => {
  it("на время — мм:сс, с пометкой лимита", () => {
    const [plain] = wodAttempts([wod("2026-08-01", { presetId: "wod:fran", timeSec: 252 })], "wod:fran");
    expect(formatWodResult(plain)).toBe("4:12");
    const [capped] = wodAttempts(
      [wod("2026-08-01", { presetId: "wod:fran", timeSec: 600, capped: true })],
      "wod:fran",
    );
    expect(formatWodResult(capped)).toContain("10:00");
  });

  it("AMRAP — раунды плюс повторы", () => {
    const [a] = wodAttempts(
      [wod("2026-08-01", { presetId: "wod:cindy", score: "amrap", rounds: 18, reps: 12 })],
      "wod:cindy",
    );
    expect(formatWodResult(a)).toContain("18");
    expect(formatWodResult(a)).toContain("12");
  });

  it("без результата — прочерк", () => {
    expect(formatWodResult(null)).toBe("—");
  });
});
