import { describe, expect, it } from "vitest";
import { applyCheckins, bodySignals, parseCheckinDays } from "./bodySignals";
import { addDays } from "./format";
import type { RecoveryEntry } from "./types";

const day = (date: string, hrvMs: number, restingHr: number): RecoveryEntry => ({ id: date, date, wellbeing: null, sleep: null, freshness: null, motivation: null, hrvMs, restingHr });

function history(end: string, n = 20, hrv = 60, rhr = 48): RecoveryEntry[] {
  return Array.from({ length: n }, (_, i) => day(addDays(end, -(i + 2)), hrv, rhr));
}

describe("данные с часов", () => {
  it("разбор: только даты и числа в разумных пределах", () => {
    const days = parseCheckinDays({ days: [{ date: "2026-11-26", hrvMs: 44.4, restingHr: 300, sleepMin: 410 }, { date: "плохо", hrvMs: 50 }, { date: "2026-11-25" }] });
    expect(days).toEqual([{ date: "2026-11-26", hrvMs: 44, sleepMin: 410 }]);
  });

  it("вписываются в самочувствие, не затирая отметку настроения", () => {
    const mine: RecoveryEntry = { id: "m", date: "2026-11-26", wellbeing: null, sleep: null, freshness: null, motivation: null, mood: { x: 0.5, y: 0.8 } };
    const { next, changed } = applyCheckins([mine], [{ date: "2026-11-26", hrvMs: 52, restingHr: 50 }, { date: "2026-11-25", sleepMin: 400 }]);
    expect(changed).toBe(2);
    expect(next.find((e) => e.date === "2026-11-26")).toMatchObject({ mood: { x: 0.5, y: 0.8 }, hrvMs: 52, restingHr: 50, device: "Garmin" });
    expect(applyCheckins(next, [{ date: "2026-11-26", hrvMs: 52 }]).changed).toBe(0);
  });

  it("перегруз: HRV ниже нормы на 10%+ два дня подряд или пульс покоя +5", () => {
    const end = "2026-11-26";
    const base = history(end);
    expect(bodySignals([...base, day(addDays(end, -1), 58, 48), day(end, 59, 49)], end).overreach).toBe(false);
    const low = bodySignals([...base, day(addDays(end, -1), 50, 48), day(end, 51, 49)], end);
    expect(low).toMatchObject({ overreach: true, lowHrvDays: 2, hrvBase: 60 });
    expect(low.score!).toBeLessThan(0.5);
    const rhr = bodySignals([...base, day(end, 60, 54)], end);
    expect(rhr).toMatchObject({ overreach: true, rhrHigh: true, lowHrvDays: 0 });
    // Без истории — пороги из плана: HRV < 50 и пульс покоя > 52.
    expect(bodySignals([day(addDays(end, -1), 45, 50), day(end, 47, 50)], end).overreach).toBe(true);
  });
});
