import { describe, expect, it } from "vitest";
import { autoFinishStale, fixDurationOutliers } from "./staleSessions";
import { sessionDurationSec } from "./types";
import type { Session } from "./types";

const H = 3_600_000;
const T0 = Date.parse("2026-11-10T10:00:00Z");

function strength(extra: Partial<Session> = {}): Session {
  return {
    id: "s1",
    date: "2026-11-10",
    kind: "strength",
    cardioKind: null,
    title: null,
    notes: null,
    createdAt: new Date(T0).toISOString(),
    exercises: [
      {
        id: "e1",
        exerciseId: "bench",
        sets: Array.from({ length: 10 }, (_, i) => ({
          id: `x${i}`,
          weight: 80,
          reps: 8,
          done: true,
        })),
      },
    ] as Session["exercises"],
    cardio: null,
    startedAt: new Date(T0).toISOString(),
    endedAt: null,
    ...extra,
  } as Session;
}

describe("autoFinishStale", () => {
  it("закрывает силовую через час без правок: финиш = последняя правка + 2 мин", () => {
    const s = strength({ lastActivityAt: new Date(T0 + 0.75 * H).toISOString() });
    const { sessions, closed } = autoFinishStale([s], T0 + 3 * H);
    expect(closed).toBe(1);
    expect(sessions[0].autoEnded).toBe(true);
    expect(sessionDurationSec(sessions[0])).toBe(47 * 60);
  });

  it("не трогает идущую тренировку с недавней активностью", () => {
    const s = strength({ lastActivityAt: new Date(T0 + 0.5 * H).toISOString() });
    const res = autoFinishStale([s], T0 + 1.2 * H);
    expect(res.closed).toBe(0);
    expect(res.sessions[0]).toBe(s);
  });

  it("кардио без касаний живёт до 4 часов, потом закрывается по введённому времени", () => {
    const c = strength({ kind: "cardio", exercises: [], cardio: { durationSec: 3000, distanceM: null, avgHr: null } });
    expect(autoFinishStale([c], T0 + 2 * H).closed).toBe(0);
    const res = autoFinishStale([c], T0 + 30 * H);
    expect(sessionDurationSec(res.sessions[0])).toBe(3000);
  });

  it("старая запись без отметки активности получает оценку по подходам", () => {
    const res = autoFinishStale([strength()], T0 + 108 * H);
    expect(sessionDurationSec(res.sessions[0])).toBe(30 * 60); // 10 подходов × 3 мин
  });
});

describe("fixDurationOutliers", () => {
  it("чинит 108-часовую тренировку и сохраняет исходный финиш", () => {
    const raw = new Date(T0 + 108 * H).toISOString();
    const res = fixDurationOutliers([strength({ endedAt: raw })]);
    expect(res.fixed).toBe(1);
    expect(res.sessions[0].rawEndedAt).toBe(raw);
    expect(sessionDurationSec(res.sessions[0])).toBe(30 * 60);
    // Повторный прогон ничего не меняет.
    expect(fixDurationOutliers(res.sessions).fixed).toBe(0);
  });

  it("нормальную двухчасовую не трогает", () => {
    const s = strength({ endedAt: new Date(T0 + 2 * H).toISOString() });
    expect(fixDurationOutliers([s]).fixed).toBe(0);
  });
});
