import { setVolume } from "../types";
import type { Exercise, Session } from "../types";
import { today } from "../format";
import { isWorkingSet } from "./metrics";
import { diffDays } from "./period";
import { classifyExercise, MUSCLE_LABEL } from "./muscles";
import type { Muscle } from "./muscles";
import type { AnalyticsPeriod } from "./types";

type MuscleAgg = {
  directSets: number;
  adjustedSets: number;
  volume: number;
  lastTrainedAt: string | null;
  days: Set<string>;
};

function emptyAgg(): MuscleAgg {
  return { directSets: 0, adjustedSets: 0, volume: 0, lastTrainedAt: null, days: new Set() };
}

/** Накопить нагрузку по мышцам за диапазон. Разминочные подходы не в счёт. */
function aggregate(
  sessions: Session[],
  exercises: Exercise[],
  start: string,
  end: string,
): Map<Muscle, MuscleAgg> {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const map = new Map<Muscle, MuscleAgg>();

  for (const s of sessions) {
    if (s.kind !== "strength" || s.date < start || s.date > end) continue;
    for (const ex of s.exercises) {
      const exercise = byId.get(ex.exerciseId);
      if (!exercise) continue;
      const cls = classifyExercise(exercise);
      const workingSets = ex.sets.filter(isWorkingSet);
      if (workingSets.length === 0) continue;
      const volume = workingSets.reduce((n, set) => n + setVolume(set), 0);

      for (const contrib of cls.muscles) {
        const agg = map.get(contrib.muscle) ?? emptyAgg();
        agg.adjustedSets += workingSets.length * contrib.coef;
        if (contrib.role === "primary") agg.directSets += workingSets.length;
        agg.volume += volume * contrib.coef;
        agg.days.add(s.date);
        if (!agg.lastTrainedAt || s.date > agg.lastTrainedAt) agg.lastTrainedAt = s.date;
        map.set(contrib.muscle, agg);
      }
    }
  }
  return map;
}

export type LoadLevel = "below" | "usual" | "above" | "wellAbove";

const LEVEL_LABEL: Record<LoadLevel, string> = {
  below: "ниже обычного",
  usual: "в пределах обычного",
  above: "выше обычного",
  wellAbove: "заметно выше обычного",
};

function levelOf(current: number, previous: number): LoadLevel {
  if (previous === 0) return "usual";
  const ratio = current / previous;
  if (ratio < 0.8) return "below";
  if (ratio <= 1.2) return "usual";
  if (ratio <= 1.6) return "above";
  return "wellAbove";
}

export interface MuscleLoad {
  muscle: Muscle;
  label: string;
  directSets: number;
  adjustedSets: number;
  totalVolume: number;
  lastTrainedAt: string | null;
  daysSince: number | null;
  frequency: number; // дней в периоде с нагрузкой на эту мышцу
  prevAdjusted: number;
  changePct: number | null;
  level: LoadLevel;
  levelLabel: string;
}

/** Нагрузка по мышечным группам за период со сравнением с предыдущим. */
export function muscleLoads(
  sessions: Session[],
  exercises: Exercise[],
  period: AnalyticsPeriod,
): MuscleLoad[] {
  const cur = aggregate(sessions, exercises, period.startDate, period.endDate);
  const prev = aggregate(
    sessions,
    exercises,
    period.comparison.startDate,
    period.comparison.endDate,
  );

  const loads: MuscleLoad[] = [];
  for (const [muscle, agg] of cur) {
    const prevAdjusted = prev.get(muscle)?.adjustedSets ?? 0;
    const change =
      prevAdjusted === 0 ? null : ((agg.adjustedSets - prevAdjusted) / prevAdjusted) * 100;
    loads.push({
      muscle,
      label: MUSCLE_LABEL[muscle],
      directSets: agg.directSets,
      adjustedSets: agg.adjustedSets,
      totalVolume: agg.volume,
      lastTrainedAt: agg.lastTrainedAt,
      daysSince: agg.lastTrainedAt ? diffDays(agg.lastTrainedAt, today()) : null,
      frequency: agg.days.size,
      prevAdjusted,
      changePct: change,
      level: levelOf(agg.adjustedSets, prevAdjusted),
      levelLabel: LEVEL_LABEL[levelOf(agg.adjustedSets, prevAdjusted)],
    });
  }
  return loads.sort((a, b) => b.adjustedSets - a.adjustedSets);
}

export interface BalanceRow {
  key: string;
  leftLabel: string;
  left: number;
  rightLabel: string;
  right: number;
}

/** Баланс движений и мышц-антагонистов. Формулировки аналитические, не диагнозы. */
export function movementBalance(
  sessions: Session[],
  exercises: Exercise[],
  start: string,
  end: string,
): BalanceRow[] {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const patternSets = new Map<string, number>();
  const agg = aggregate(sessions, exercises, start, end);

  for (const s of sessions) {
    if (s.kind !== "strength" || s.date < start || s.date > end) continue;
    for (const ex of s.exercises) {
      const exercise = byId.get(ex.exerciseId);
      if (!exercise) continue;
      const working = ex.sets.filter(isWorkingSet).length;
      if (working === 0) continue;
      for (const p of classifyExercise(exercise).patterns) {
        patternSets.set(p, (patternSets.get(p) ?? 0) + working);
      }
    }
  }

  const pat = (k: string) => patternSets.get(k) ?? 0;
  const adj = (m: Muscle) => agg.get(m)?.adjustedSets ?? 0;

  const push = pat("horizPush") + pat("vertPush");
  const pull = pat("horizPull") + pat("vertPull");
  const upper = (["chest", "lats", "upperBack", "frontDelt", "sideDelt", "rearDelt", "biceps", "triceps"] as Muscle[]).reduce((n, m) => n + adj(m), 0);
  const lower = (["quads", "hamstrings", "glutes", "calves"] as Muscle[]).reduce((n, m) => n + adj(m), 0);

  const rows: BalanceRow[] = [
    { key: "pushpull", leftLabel: "Жим", left: push, rightLabel: "Тяга", right: pull },
    { key: "upperlower", leftLabel: "Верх", left: Math.round(upper), rightLabel: "Низ", right: Math.round(lower) },
    { key: "legs", leftLabel: "Квадрицепс", left: Math.round(adj("quads")), rightLabel: "Бицепс бедра", right: Math.round(adj("hamstrings")) },
    { key: "delts", leftLabel: "Передняя дельта", left: Math.round(adj("frontDelt")), rightLabel: "Задняя дельта", right: Math.round(adj("rearDelt")) },
  ];
  return rows.filter((r) => r.left > 0 || r.right > 0);
}
