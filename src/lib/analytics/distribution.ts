import { sessionDurationSec } from "../types";
import type { Session } from "../types";
import type { ActivitySlice } from "./types";

const LABELS: Record<string, string> = {
  strength: "Силовые",
  run: "Бег",
  bike: "Велосипед",
  swim: "Плавание",
  other: "Другое",
};

/** Категория активности для диаграммы распределения. */
export function activityKey(session: Session): string {
  if (session.kind === "strength") return "strength";
  if (session.kind === "cardio") {
    switch (session.cardioKind) {
      case "run":
      case "treadmill":
        return "run";
      case "bike":
        return "bike";
      case "swim":
        return "swim";
      default:
        return "other";
    }
  }
  return "other";
}

/**
 * Распределение по видам активности: сколько тренировок, сколько времени и
 * какая доля от общего. Если время нигде не проставлено, долю берём по числу
 * тренировок — иначе диаграмма была бы пустой.
 */
export function distribution(
  sessions: Session[],
  start: string,
  end: string,
): ActivitySlice[] {
  const scoped = sessions.filter((s) => s.date >= start && s.date <= end);
  const byKey = new Map<string, { count: number; duration: number }>();

  for (const s of scoped) {
    const key = activityKey(s);
    const cur = byKey.get(key) ?? { count: 0, duration: 0 };
    cur.count += 1;
    cur.duration += sessionDurationSec(s) ?? 0;
    byKey.set(key, cur);
  }

  const totalDuration = [...byKey.values()].reduce((n, v) => n + v.duration, 0);
  const totalCount = scoped.length || 1;

  return [...byKey.entries()]
    .map(([key, v]) => ({
      key,
      label: LABELS[key] ?? key,
      count: v.count,
      duration: v.duration,
      share: totalDuration > 0 ? v.duration / totalDuration : v.count / totalCount,
    }))
    .sort((a, b) => b.count - a.count);
}
