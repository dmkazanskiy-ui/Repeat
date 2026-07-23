import { addDays, parseDateKey, toDateKey, today, weekGrid } from "../format";
import type { AggregationType, AnalyticsPeriod } from "./types";

export type PeriodMode = "week" | "month" | "custom";

/** Разница в днях (b − a) по календарным датам. */
export function diffDays(a: string, b: string): number {
  return Math.round(
    (parseDateKey(b).getTime() - parseDateKey(a).getTime()) / 86_400_000,
  );
}

/** Длина диапазона в днях, включительно. */
export function rangeLength(start: string, end: string): number {
  return diffDays(start, end) + 1;
}

/** Понедельник недели, в которую попадает дата. */
export function weekStart(key: string): string {
  return weekGrid(key)[0];
}

/** Все календарные дни диапазона включительно. */
export function dayKeys(start: string, end: string): string[] {
  const keys: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) keys.push(d);
  return keys;
}

/** Ключ корзины для даты: сам день или понедельник её недели. */
export function bucketKey(key: string, aggregation: AggregationType): string {
  return aggregation === "day" ? key : weekStart(key);
}

/** Список корзин, покрывающих период (дни или понедельники недель). */
export function bucketStarts(period: AnalyticsPeriod): string[] {
  if (period.aggregation === "day") {
    return dayKeys(period.startDate, period.endDate);
  }
  const starts: string[] = [];
  const last = weekStart(period.endDate);
  for (let w = weekStart(period.startDate); w <= last; w = addDays(w, 7)) {
    starts.push(w);
  }
  return starts;
}

/** Короткие диапазоны показываем по дням, длинные — по неделям. */
export function chooseAggregation(start: string, end: string): AggregationType {
  return rangeLength(start, end) <= 16 ? "day" : "week";
}

/** Предыдущий период такой же длины, вплотную перед текущим. */
export function previousRange(
  start: string,
  end: string,
): { startDate: string; endDate: string } {
  const length = rangeLength(start, end);
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(length - 1));
  return { startDate: prevStart, endDate: prevEnd };
}

function monthRangeOf(anchor: string): [string, string] {
  const d = parseDateKey(anchor);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return [toDateKey(first), toDateKey(last)];
}

/**
 * Предыдущий период для сравнения. Если текущий период ещё не завершён
 * (сегодня внутри него), сравниваем только прошедшую часть с той же частью
 * прошлого цикла: понедельник–четверг с понедельник–четвергом, а не с полной
 * прошлой неделей — иначе неполная неделя даёт ложный регресс.
 */
function comparisonFor(
  mode: PeriodMode,
  start: string,
  end: string,
  asOf: string,
): { startDate: string; endDate: string } {
  const effEnd = end < asOf ? end : start > asOf ? start : asOf;
  const elapsed = diffDays(start, effEnd); // прошедших дней (0-based)

  if (mode === "month") {
    const d = parseDateKey(start);
    const prevFirst = toDateKey(new Date(d.getFullYear(), d.getMonth() - 1, 1));
    const prevLast = toDateKey(new Date(d.getFullYear(), d.getMonth(), 0));
    const complete = effEnd >= end;
    const prevEnd = complete ? prevLast : addDays(prevFirst, elapsed);
    return { startDate: prevFirst, endDate: prevEnd > prevLast ? prevLast : prevEnd };
  }

  // Неделя/произвольный: сдвиг ровно на длину периода — тот же участок цикла.
  const length = rangeLength(start, end);
  return { startDate: addDays(start, -length), endDate: addDays(effEnd, -length) };
}

/**
 * Собрать период по режиму. Неделя — по дням, месяц — по неделям,
 * произвольный — авто по длине. Предыдущий период выравнивается по прошедшей
 * части текущего (`asOf`, по умолчанию сегодня).
 */
export function buildPeriod(
  mode: PeriodMode,
  anchor: string,
  from?: string,
  to?: string,
  asOf: string = today(),
): AnalyticsPeriod {
  let start: string;
  let end: string;
  let aggregation: AggregationType;

  if (mode === "week") {
    const week = weekGrid(anchor);
    start = week[0];
    end = week[6];
    aggregation = "day";
  } else if (mode === "month") {
    [start, end] = monthRangeOf(anchor);
    aggregation = "week";
  } else {
    start = from ?? anchor;
    end = to ?? anchor;
    if (start > end) [start, end] = [end, start];
    aggregation = chooseAggregation(start, end);
  }

  return {
    startDate: start,
    endDate: end,
    aggregation,
    comparison: comparisonFor(mode, start, end, asOf),
  };
}

/** Идёт ли период прямо сейчас (сегодня внутри него и он ещё не закрыт). */
export function isOngoing(period: AnalyticsPeriod, asOf: string = today()): boolean {
  return period.startDate <= asOf && asOf < period.endDate;
}

/** Сдвиг опорной даты на предыдущий/следующий период (dir = ±1). */
export function shiftAnchor(mode: PeriodMode, anchor: string, dir: number): string {
  if (mode === "month") {
    const d = parseDateKey(anchor);
    return toDateKey(new Date(d.getFullYear(), d.getMonth() + dir, 1));
  }
  return addDays(anchor, dir * 7);
}
