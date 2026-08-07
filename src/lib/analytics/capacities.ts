// «Прогресс способностей»: сила / выносливость / скорость по неделям периода.
// Каждое качество — один понятный сигнал из имеющихся данных, без ложной
// точности: если данных мало, честно помечаем «предварительно», а качество без
// данных вовсе не показываем как «выросло».
//
//  • Сила        — средний e1RM силовых за неделю (насколько тяжелее работаешь).
//  • Выносливость — рабочий объём за неделю: рабочие подходы + минуты кардио
//                   (сколько работы удерживаешь).
//  • Скорость    — средний темп бега (мин/км); быстрее = лучше, поэтому знак
//                   тренда инвертируется.

import { addDays } from "../format";
import { bestE1rm } from "../types";
import type { CardioKind, Session } from "../types";
import { isWorkingSet } from "./metrics";
import { diffDays, weekStart } from "./period";
import type { AnalyticsPeriod, Confidence } from "./types";
import { L } from "../i18n";

export type CapacityKey = "strength" | "endurance" | "speed";
export type CapacityDirection = "up" | "flat" | "down" | "none";

export interface CapacityProgress {
  key: CapacityKey;
  label: string;
  /** Недельный ряд: null — неделя без данных этого качества. */
  series: (number | null)[];
  direction: CapacityDirection;
  /** Изменение от первой к последней неделе с данными, %. */
  deltaPercent: number | null;
  confidence: Confidence;
  /** Есть ли вообще данные для оценки. */
  hasData: boolean;
}

const CAPACITY_LABELS: Record<CapacityKey, string> = {
  get strength() { return L("Сила", "Strength"); },
  get endurance() { return L("Выносливость", "Endurance"); },
  get speed() { return L("Скорость", "Speed"); },
};

const RUN_KINDS: CardioKind[] = ["run", "treadmill_run"];

/** Начала недель, покрывающих период (по понедельникам). */
function weekBuckets(period: AnalyticsPeriod): string[] {
  const first = weekStart(period.startDate);
  const weeks: string[] = [];
  let cur = first;
  while (cur <= period.endDate) {
    weeks.push(cur);
    cur = addDays(cur, 7);
  }
  return weeks;
}

function inWeek(date: string, weekStartKey: string): boolean {
  return date >= weekStartKey && date <= addDays(weekStartKey, 6);
}

/** Средний e1RM силовой сессии — среднее по упражнениям с рабочими подходами. */
function sessionStrength(session: Session): number | null {
  const values = session.exercises
    .map((ex) => bestE1rm(ex))
    .filter((v): v is number => v != null);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Наклон тренда методом наименьших квадратов по (индекс недели, значение). */
function slopeOf(points: Array<{ x: number; y: number }>): number {
  const n = points.length;
  const meanX = points.reduce((a, p) => a + p.x, 0) / n;
  const meanY = points.reduce((a, p) => a + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/**
 * Оценка одного качества по недельному ряду. `higherIsBetter=false` для темпа
 * (меньше сек/км — лучше): тогда снижение ряда считается ростом качества.
 */
function assess(
  key: CapacityKey,
  series: (number | null)[],
  weeks: string[],
  higherIsBetter: boolean,
): CapacityProgress {
  const present = series
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v != null);

  const base: CapacityProgress = {
    key,
    label: CAPACITY_LABELS[key],
    series,
    direction: "none",
    deltaPercent: null,
    confidence: "preliminary",
    hasData: present.length > 0,
  };

  if (present.length < 2) return base;

  const first = present[0];
  const last = present[present.length - 1];
  const rawDelta = first.v === 0 ? null : ((last.v - first.v) / Math.abs(first.v)) * 100;
  const deltaPercent = rawDelta == null ? null : higherIsBetter ? rawDelta : -rawDelta;

  const slope = slopeOf(present.map((p) => ({ x: p.i, y: p.v })));
  const meanY = present.reduce((a, p) => a + p.v, 0) / present.length;
  const projected = slope * (last.i - first.i);
  const deadband = Math.abs(meanY) * 0.02; // 2% — шум, а не тренд
  let dir: CapacityDirection = "flat";
  const effective = higherIsBetter ? projected : -projected;
  if (effective > deadband) dir = "up";
  else if (effective < -deadband) dir = "down";

  // Уверенность: ≥3 недель с данными и охват ≥21 дня — «средняя», иначе
  // «предварительная». Выше не поднимаем — нет пульса/HRV/сна.
  const spanDays = diffDays(weeks[first.i], weeks[last.i]);
  const confidence: Confidence =
    present.length >= 3 && spanDays >= 21 ? "medium" : "preliminary";

  return { ...base, direction: dir, deltaPercent, confidence };
}

/** Прогресс всех трёх качеств за период. */
export function capacityProgress(
  sessions: Session[],
  period: AnalyticsPeriod,
): CapacityProgress[] {
  const weeks = weekBuckets(period);

  const strengthSeries: (number | null)[] = [];
  const enduranceSeries: (number | null)[] = [];
  const speedSeries: (number | null)[] = [];

  for (const wk of weeks) {
    const week = sessions.filter((s) => inWeek(s.date, wk));

    // Сила — среднее e1RM силовых сессий недели.
    const strengthVals = week
      .filter((s) => s.kind === "strength")
      .map(sessionStrength)
      .filter((v): v is number => v != null);
    strengthSeries.push(
      strengthVals.length
        ? strengthVals.reduce((a, b) => a + b, 0) / strengthVals.length
        : null,
    );

    // Выносливость — рабочие подходы + минуты кардио за неделю.
    let workSets = 0;
    let cardioMin = 0;
    for (const s of week) {
      if (s.kind === "strength") {
        workSets += s.exercises.reduce(
          (n, ex) => n + ex.sets.filter(isWorkingSet).length,
          0,
        );
      } else if (s.kind === "cardio") {
        cardioMin += (s.cardio?.durationSec ?? 0) / 60;
      }
    }
    const enduranceRaw = workSets + cardioMin;
    enduranceSeries.push(enduranceRaw > 0 ? enduranceRaw : null);

    // Скорость — средний темп бега (сек/км) за неделю.
    const paces: number[] = [];
    for (const s of week) {
      if (s.kind !== "cardio" || !s.cardioKind || !RUN_KINDS.includes(s.cardioKind)) {
        continue;
      }
      const dist = s.cardio?.distanceM ?? 0;
      const dur = s.cardio?.durationSec ?? 0;
      if (dist > 0 && dur > 0) paces.push(dur / (dist / 1000));
    }
    speedSeries.push(
      paces.length ? paces.reduce((a, b) => a + b, 0) / paces.length : null,
    );
  }

  return [
    assess("strength", strengthSeries, weeks, true),
    assess("endurance", enduranceSeries, weeks, true),
    assess("speed", speedSeries, weeks, false),
  ];
}

/** Детерминированная строка-резюме «что развивается». */
export function capacitySummary(items: CapacityProgress[]): string {
  const rising = items.filter((c) => c.direction === "up").map((c) => c.label.toLowerCase());
  const falling = items.filter((c) => c.direction === "down").map((c) => c.label.toLowerCase());
  const anyData = items.some((c) => c.hasData);

  if (!anyData) return L("Пока мало данных, чтобы оценить прогресс.", "Not enough data to gauge progress yet.");
  const parts: string[] = [];
  if (rising.length) parts.push(`${L("растёт", "rising")} ${rising.join(", ")}`);
  if (falling.length) parts.push(`${L("снижается", "falling")} ${falling.join(", ")}`);
  if (parts.length === 0) return L("Показатели держатся на своём уровне.", "Your metrics are holding steady.");
  // Первая буква заглавная.
  const text = parts.join("; ");
  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
}
