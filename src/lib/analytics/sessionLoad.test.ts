import { describe, expect, it } from "vitest";
import { newSession } from "../store";
import { addDays } from "../format";
import type { Session, SessionIntensity } from "../types";
import { acuteChronicLoad, sessionLoad, INTENSITY_LOAD_FACTOR } from "./sessionLoad";

const ASOF = "2026-07-29";

/** Силовая сессия с таймером на `minutes` минут и заданным усилием. */
function timedStrength(
  date: string,
  minutes: number,
  intensity?: SessionIntensity,
): Session {
  const s = newSession(date, "strength");
  s.startedAt = `${date}T10:00:00.000Z`;
  s.endedAt = `${date}T${10 + Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:00.000Z`;
  if (intensity) s.intensity = intensity;
  return s;
}

function timedCardio(date: string, minutes: number, intensity?: SessionIntensity): Session {
  const s = newSession(date, "cardio", { cardioKind: "run" });
  s.cardio = { durationSec: minutes * 60, distanceM: null, avgHr: null, segments: [] };
  if (intensity) s.intensity = intensity;
  return s;
}

describe("sessionLoad", () => {
  it("множитель усилия × минуты", () => {
    expect(sessionLoad(timedStrength(ASOF, 60, "hard"))).toBeCloseTo(90); // 1.5 × 60
    expect(sessionLoad(timedStrength(ASOF, 60, "medium"))).toBeCloseTo(60);
    expect(sessionLoad(timedStrength(ASOF, 60, "easy"))).toBeCloseTo(30);
  });

  it("усилие не отмечено → нейтральный множитель (medium)", () => {
    expect(sessionLoad(timedStrength(ASOF, 40))).toBeCloseTo(40 * INTENSITY_LOAD_FACTOR.medium);
  });

  it("кардио берёт длительность из cardio.durationSec", () => {
    expect(sessionLoad(timedCardio(ASOF, 30, "medium"))).toBeCloseTo(30);
  });

  it("нет длительности → null (в sRPE не идёт)", () => {
    expect(sessionLoad(newSession(ASOF, "strength"))).toBeNull();
  });

  it("нетренировочная сессия (восстановление) → null", () => {
    expect(sessionLoad(newSession(ASOF, "recovery", { recoveryType: "sauna" }))).toBeNull();
  });
});

describe("acuteChronicLoad", () => {
  it("без 28-дневной базы → unknown", () => {
    const acwr = acuteChronicLoad([], ASOF);
    expect(acwr.ratio).toBeNull();
    expect(acwr.level).toBe("unknown");
  });

  it("ровная нагрузка → отношение около 1 (оптимум)", () => {
    // По одной средней 60-мин сессии в неделю все 4 недели.
    const sessions = [0, 1, 2, 3].map((w) => timedStrength(addDays(ASOF, -7 * w), 60, "medium"));
    const acwr = acuteChronicLoad(sessions, ASOF);
    // acute = 60 (эта неделя), chronic = 240/4 = 60 → ratio 1.
    expect(acwr.ratio).toBeCloseTo(1);
    expect(acwr.level).toBe("optimal");
  });

  it("резкий скачок последней недели → high", () => {
    const sessions: Session[] = [
      timedStrength(addDays(ASOF, -21), 60, "medium"),
      timedStrength(addDays(ASOF, -14), 60, "medium"),
      timedStrength(addDays(ASOF, -7), 60, "medium"),
      // Эта неделя — три тяжёлых длинных.
      timedStrength(ASOF, 90, "hard"),
      timedStrength(addDays(ASOF, -1), 90, "hard"),
      timedStrength(addDays(ASOF, -2), 90, "hard"),
    ];
    const acwr = acuteChronicLoad(sessions, ASOF);
    expect(acwr.ratio).not.toBeNull();
    expect(acwr.ratio!).toBeGreaterThan(1.5);
    expect(acwr.level).toBe("high");
  });

  it("отмеченное усилие поднимает confidence до medium", () => {
    const sessions = [0, 1, 2, 3].map((w) => timedStrength(addDays(ASOF, -7 * w), 60, "medium"));
    expect(acuteChronicLoad(sessions, ASOF).confidence).toBe("medium");
  });
});
