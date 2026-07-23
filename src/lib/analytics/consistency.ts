import { addDays, today } from "../format";
import type { Session } from "../types";
import { dayKeys, rangeLength, weekStart } from "./period";
import type { AnalyticsPeriod, ConsistencyStats } from "./types";

function activeDates(sessions: Session[]): Set<string> {
  return new Set(sessions.map((s) => s.date));
}

/** Самая длинная серия подряд идущих тренировочных дней за всю историю. */
export function longestStreak(sessions: Session[]): number {
  const dates = [...activeDates(sessions)].sort();
  let best = 0;
  let run = 0;
  let prev = "";
  for (const d of dates) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/**
 * Текущая серия активных дней, считая назад от сегодня. Если сегодня ещё
 * не тренировались, начинаем со вчера — серия не рвётся до конца дня.
 */
export function currentStreak(sessions: Session[], from = today()): number {
  const active = activeDates(sessions);
  let day = active.has(from) ? from : addDays(from, -1);
  let streak = 0;
  while (active.has(day)) {
    streak += 1;
    day = addDays(day, -1);
  }
  return streak;
}

export function consistency(
  sessions: Session[],
  period: AnalyticsPeriod,
): ConsistencyStats {
  const scoped = sessions.filter(
    (s) => s.date >= period.startDate && s.date <= period.endDate,
  );
  const activeDayCount = new Set(scoped.map((s) => s.date)).size;
  const workouts = scoped.length;
  const weeks = rangeLength(period.startDate, period.endDate) / 7;

  const allWeeks = new Set(
    dayKeys(period.startDate, period.endDate).map(weekStart),
  );
  const activeWeeks = new Set(scoped.map((s) => weekStart(s.date)));

  return {
    activeDays: activeDayCount,
    workouts,
    perWeek: weeks > 0 ? workouts / weeks : workouts,
    currentStreak: currentStreak(sessions),
    longestStreak: longestStreak(sessions),
    activeWeekRatio: allWeeks.size > 0 ? activeWeeks.size / allWeeks.size : 0,
  };
}
