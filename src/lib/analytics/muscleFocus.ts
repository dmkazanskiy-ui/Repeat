// Сводка «чему уделить внимание» по мышцам. Карта и полоски показывают
// картину, но вывод из неё читатель делает сам — этот модуль делает вывод.
//
// Принципы: сравниваем тебя с тобой же (перекосы пар, пропуски, частота), а
// внешний ориентир по объёму включаем только под цель «набрать мышцы» и честно
// называем ориентиром. Окно фиксированное — четыре недели: на недельном окне
// один пропущенный день ног превращается в «дыру», а баланс инерционен.

import { L } from "../i18n";
import { MUSCLE_LABEL } from "./muscles";
import type { Muscle } from "./muscles";
import type { BalanceRow, MuscleLoad } from "./muscle";
import type { FocusGoal } from "../workoutBuilder";

export const FOCUS_WINDOW_DAYS = 28;
const WEEKS = FOCUS_WINDOW_DAYS / 7;

/** Почему пункт попал в сводку — для иконки и порядка. */
export type FocusReason = "imbalance" | "gap" | "stale" | "rare" | "volume";

export interface FocusItem {
  reason: FocusReason;
  /** Мышца, к которой относится пункт (у перекоса — отстающая сторона). */
  muscle: Muscle | null;
  /** Что не так. */
  text: string;
  /** Что с этим сделать. */
  action: string;
}

export interface MuscleFocus {
  /** Хватает ли данных, чтобы вообще делать вывод. */
  hasData: boolean;
  headline: string;
  items: FocusItem[];
  /** Короткая строка «что в порядке» — чтобы это не был список претензий. */
  okLabel: string | null;
}

export interface FocusInput {
  loads: MuscleLoad[];
  balance: BalanceRow[];
  /** Силовых тренировок в окне — меньше четырёх выводов не делаем. */
  strengthSessions: number;
  goal: FocusGoal | null;
}

/** Мышца пары баланса — чтобы подсветить её на карте по тапу. */
const PAIR_MUSCLE: Record<string, { left: Muscle | null; right: Muscle | null }> = {
  pushpull: { left: null, right: "upperBack" },
  upperlower: { left: null, right: "quads" },
  legs: { left: "quads", right: "hamstrings" },
  delts: { left: "frontDelt", right: "rearDelt" },
};

/** Что делать, когда просела одна сторона пары. */
function pairAction(key: string, weakIsRight: boolean): string {
  if (key === "pushpull") {
    return weakIsRight
      ? L("добавь горизонтальную тягу", "add horizontal rows")
      : L("добавь жимовое движение", "add a pressing movement");
  }
  if (key === "upperlower") {
    return weakIsRight
      ? L("поставь день ног", "add a leg day")
      : L("добавь работу на верх", "add upper-body work")
  }
  if (key === "legs") {
    return weakIsRight
      ? L("добавь румынскую тягу или сгибания", "add Romanian deadlifts or leg curls")
      : L("добавь присед или жим ногами", "add squats or leg press");
  }
  return weakIsRight
    ? L("добавь разведения в наклоне", "add rear-delt flyes")
    : L("добавь жим над головой", "add overhead pressing");
}

function ruPlural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function num(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return L(String(rounded).replace(".", ","), String(rounded));
}

/**
 * Сводка по мышцам: до трёх пунктов по приоритету — перекос пары, полный
 * пропуск, давняя нагрузка, редкая частота, малый объём (только под рост).
 * На одну мышцу приходится максимум один пункт.
 */
export function muscleFocus(input: FocusInput): MuscleFocus {
  const { loads, balance, strengthSessions, goal } = input;

  if (strengthSessions < 4) {
    return {
      hasData: false,
      headline: L("Мало данных для вывода", "Not enough data yet"),
      items: [],
      okLabel: null,
    };
  }

  const items: FocusItem[] = [];
  const used = new Set<Muscle>();
  // Мышцы, о которых уже зашла речь, — их не подставляем в «в порядке».
  const touched = new Set<Muscle>();

  const add = (item: FocusItem) => {
    if (item.muscle && used.has(item.muscle)) return;
    if (item.muscle) {
      used.add(item.muscle);
      touched.add(item.muscle);
    }
    items.push(item);
  };

  // 1. Перекос пары — самый честный сигнал: сравнение тебя с тобой же.
  for (const row of balance) {
    const { left, right } = row;
    const total = left + right;
    if (total < 6) continue;
    const weakIsRight = right < left;
    const weak = weakIsRight ? right : left;
    const strong = weakIsRight ? left : right;
    if (weak > 0 && strong < weak * 2) continue;

    const weakLabel = weakIsRight ? row.rightLabel : row.leftLabel;
    const strongLabel = weakIsRight ? row.leftLabel : row.rightLabel;
    const muscle = PAIR_MUSCLE[row.key]?.[weakIsRight ? "right" : "left"] ?? null;

    // Говорим про отстающую сторону: она и есть предмет разговора.
    add({
      reason: "imbalance",
      muscle,
      text:
        weak === 0
          ? L(
              `${weakLabel} — ноль подходов, ${weakLabel === strongLabel ? "" : `${strongLabel} — ${strong}`}`.trim(),
              `${weakLabel} — zero sets, ${strongLabel} — ${strong}`,
            )
          : L(
              `${weakLabel} вдвое меньше: ${weak} против ${strong}`,
              `${weakLabel} is half as much: ${weak} vs ${strong}`,
            ),
      action: pairAction(row.key, weakIsRight),
    });
    // Сильная сторона тоже «занята» — не хвалим её ниже в «в порядке».
    const strongMuscle = PAIR_MUSCLE[row.key]?.[weakIsRight ? "left" : "right"] ?? null;
    if (strongMuscle) touched.add(strongMuscle);
  }

  // 2. Мышца выпала совсем, хотя в прошлом окне работала.
  for (const load of loads) {
    if (load.adjustedSets > 0 || load.prevAdjusted <= 0) continue;
    add({
      reason: "gap",
      muscle: load.muscle,
      text: L(
        `${load.label}: ни одного подхода за месяц`,
        `${load.label}: not a single set this month`,
      ),
      action: L("верни в ротацию", "put it back in rotation"),
    });
  }

  // 3. Давно не было — две недели и больше.
  for (const load of loads) {
    if (load.adjustedSets <= 0 || load.daysSince == null || load.daysSince < 14) continue;
    add({
      reason: "stale",
      muscle: load.muscle,
      text: L(
        `${load.label}: ${load.daysSince} ${ruPlural(load.daysSince, "день", "дня", "дней")} без нагрузки`,
        `${load.label}: ${load.daysSince} days without work`,
      ),
      action: L("поставь в ближайшую тренировку", "fit it into the next session"),
    });
  }

  // 4. Редко: реже раза в неделю там, где остальное получает больше.
  const perWeek = (load: MuscleLoad) => load.frequency / WEEKS;
  const worked = loads.filter((l) => l.adjustedSets > 0);
  const median =
    worked.length > 0
      ? [...worked].map(perWeek).sort((a, b) => a - b)[Math.floor(worked.length / 2)]
      : 0;
  if (median >= 1.5) {
    for (const load of worked) {
      if (perWeek(load) >= 1) continue;
      add({
        reason: "rare",
        muscle: load.muscle,
        text: L(
          `${load.label}: реже раза в неделю`,
          `${load.label}: less than once a week`,
        ),
        action: L("раздели на две тренировки", "split it across two sessions"),
      });
    }
  }

  // 5. Объём — только под рост, и честно как ориентир, а не норма.
  if (goal === "muscle") {
    for (const load of worked) {
      const weekly = load.adjustedSets / WEEKS;
      if (weekly >= 6) continue;
      add({
        reason: "volume",
        muscle: load.muscle,
        text: L(
          `${load.label}: ${num(weekly)} подхода в неделю`,
          `${load.label}: ${num(weekly)} sets a week`,
        ),
        action: L("для роста ориентир — 10–20", "the growth guideline is 10–20"),
      });
    }
  }

  const top = items.slice(0, 3);

  // «В порядке» — то, что работает регулярно и не попало в список.
  const fine = worked
    .filter((l) => !touched.has(l.muscle) && l.adjustedSets / WEEKS >= 6)
    .sort((a, b) => b.adjustedSets - a.adjustedSets)
    .slice(0, 3)
    .map((l) => MUSCLE_LABEL[l.muscle]);

  const headline =
    top.length === 0
      ? L("Баланс ровный", "Balance looks even")
      : L(
          `${top.length} ${ruPlural(top.length, "группа просит", "группы просят", "групп просят")} внимания`,
          `${top.length} ${top.length === 1 ? "area needs" : "areas need"} attention`,
        );

  return {
    hasData: true,
    headline,
    items: top,
    okLabel:
      fine.length > 0
        ? L(`В порядке: ${fine.join(", ").toLowerCase()}`, `Solid: ${fine.join(", ").toLowerCase()}`)
        : null,
  };
}
