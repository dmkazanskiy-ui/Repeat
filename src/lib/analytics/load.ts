// Персональная нагрузка и календарная heatmap. Нагрузку в MVP считаем в
// рабочих подходах (универсально: работает и со свободным весом, и с
// собственным). Пульса, RPE и сна нет — поэтому оценка честно помечается как
// предварительная. Baseline — среднее по последним активным неделям, чтобы
// «норма» была персональной, а не универсальной.

import { addDays, today } from "../format";
import type { Session } from "../types";
import { isWorkingSet } from "./metrics";
import { weekStart } from "./period";
import type { Confidence } from "./types";
import type { LoadLevel } from "./muscle";

/** Рабочие подходы силовой сессии (разминка не в счёт). */
export function workingSetsOf(session: Session): number {
  if (session.kind !== "strength") return 0;
  return session.exercises.reduce(
    (n, e) => n + e.sets.filter(isWorkingSet).length,
    0,
  );
}

function inWeek(date: string, weekStartKey: string): boolean {
  return date >= weekStartKey && date <= addDays(weekStartKey, 6);
}

/** Суммарные рабочие подходы за неделю (с понедельника недели). */
export function weekLoad(sessions: Session[], weekStartKey: string): number {
  return sessions
    .filter((s) => inWeek(s.date, weekStartKey))
    .reduce((n, s) => n + workingSetsOf(s), 0);
}

function isDeloadWeek(sessions: Session[], weekStartKey: string): boolean {
  return sessions.some((s) => inWeek(s.date, weekStartKey) && s.deload);
}

const LEVEL_FROM_RATIO = (ratio: number): LoadLevel =>
  ratio < 0.8 ? "below" : ratio <= 1.2 ? "usual" : ratio <= 1.6 ? "above" : "wellAbove";

const LOAD_LABEL: Record<LoadLevel, string> = {
  below: "ниже обычного",
  usual: "в пределах обычного",
  above: "выше обычного",
  wellAbove: "значительно выше обычного",
};

export interface LoadBaseline {
  currentSets: number;
  baselineSets: number;
  ratio: number | null;
  level: LoadLevel;
  levelLabel: string;
  weeksUsed: number;
  confidence: Confidence;
}

/**
 * Нагрузка текущей недели против персонального baseline — среднего по
 * последним активным неделям (разгрузочные исключаются). ratio = null, когда
 * истории ещё нет.
 */
export function loadBaseline(
  sessions: Session[],
  asOf: string = today(),
): LoadBaseline {
  const thisWeek = weekStart(asOf);
  const current = weekLoad(sessions, thisWeek);

  const prior: number[] = [];
  for (let i = 1; i <= 6 && prior.length < 4; i++) {
    const wk = addDays(thisWeek, -7 * i);
    if (isDeloadWeek(sessions, wk)) continue;
    const load = weekLoad(sessions, wk);
    if (load > 0) prior.push(load); // только недели, когда тренировался
  }

  const baseline = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : 0;
  const ratio = baseline > 0 ? current / baseline : null;
  const level = ratio == null ? "usual" : LEVEL_FROM_RATIO(ratio);

  return {
    currentSets: current,
    baselineSets: baseline,
    ratio,
    level,
    levelLabel: LOAD_LABEL[level],
    weeksUsed: prior.length,
    // Без пульса/RPE/сна выше «предварительной» оценка не поднимается.
    confidence: "preliminary",
  };
}

export interface HeatCell {
  date: string;
  sets: number;
  hasSession: boolean;
  level: number; // 0 нет тренировки, 1 лёгкая … 4 высокая
}

/**
 * Календарная heatmap как contribution graph: колонки — недели, строки —
 * дни (Пн→Вс). Интенсивность — от объёма относительно личного среднего, а не
 * от одинаковых для всех порогов.
 */
export function heatmap(
  sessions: Session[],
  weeks = 12,
  asOf: string = today(),
): HeatCell[][] {
  const firstWeek = weekStart(addDays(asOf, -7 * (weeks - 1)));
  const byDate = new Map<string, { sets: number; any: boolean }>();
  for (const s of sessions) {
    const cur = byDate.get(s.date) ?? { sets: 0, any: false };
    cur.sets += workingSetsOf(s);
    cur.any = true;
    byDate.set(s.date, cur);
  }

  const loads = [...byDate.values()].map((v) => v.sets).filter((v) => v > 0);
  const mean = loads.length ? loads.reduce((a, b) => a + b, 0) / loads.length : 1;

  const grid: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(firstWeek, w * 7 + d);
      const entry = byDate.get(date);
      const sets = entry?.sets ?? 0;
      const hasSession = Boolean(entry?.any);
      let level = 0;
      if (hasSession) {
        if (sets === 0) level = 1; // активность без рабочих подходов (кардио)
        else {
          const r = sets / mean;
          level = r < 0.66 ? 1 : r < 1.15 ? 2 : r < 1.75 ? 3 : 4;
        }
      }
      col.push({ date, sets, hasSession, level });
    }
    grid.push(col);
  }
  return grid;
}
