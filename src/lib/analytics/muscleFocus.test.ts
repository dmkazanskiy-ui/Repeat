import { describe, expect, it } from "vitest";
import { muscleFocus } from "./muscleFocus";
import type { BalanceRow, MuscleLoad } from "./muscle";
import type { Muscle } from "./muscles";

function load(muscle: Muscle, patch: Partial<MuscleLoad> = {}): MuscleLoad {
  return {
    muscle,
    label: muscle,
    directSets: patch.adjustedSets ?? 40,
    adjustedSets: 40,
    totalVolume: 1000,
    lastTrainedAt: "2026-08-28",
    daysSince: 2,
    frequency: 8, // дважды в неделю за окно в 4 недели
    prevAdjusted: 40,
    changePct: 0,
    level: "usual",
    levelLabel: "в пределах обычного",
    ...patch,
  };
}

const balanced: BalanceRow[] = [
  { key: "pushpull", leftLabel: "Жим", left: 20, rightLabel: "Тяга", right: 18 },
];

describe("сводка по мышцам", () => {
  it("без четырёх силовых за окно вывод не делается", () => {
    const focus = muscleFocus({
      loads: [load("chest")],
      balance: balanced,
      strengthSessions: 3,
      goal: null,
    });
    expect(focus.hasData).toBe(false);
    expect(focus.items).toEqual([]);
  });

  it("ровный баланс — никаких претензий", () => {
    const focus = muscleFocus({
      loads: [load("chest"), load("lats"), load("quads")],
      balance: balanced,
      strengthSessions: 12,
      goal: null,
    });
    expect(focus.items).toEqual([]);
    expect(focus.headline).toContain("ровный");
    expect(focus.okLabel).toBeTruthy();
  });

  it("видит перекос пары и предлагает конкретное движение", () => {
    const focus = muscleFocus({
      loads: [load("chest"), load("upperBack")],
      balance: [
        { key: "pushpull", leftLabel: "Жим", left: 24, rightLabel: "Тяга", right: 8 },
      ],
      strengthSessions: 12,
      goal: null,
    });
    expect(focus.items[0].reason).toBe("imbalance");
    expect(focus.items[0].action).toContain("тягу");
    expect(focus.items[0].muscle).toBe("upperBack");
  });

  it("перекос на малом объёме не считается", () => {
    const focus = muscleFocus({
      loads: [load("chest")],
      balance: [
        { key: "pushpull", leftLabel: "Жим", left: 4, rightLabel: "Тяга", right: 1 },
      ],
      strengthSessions: 12,
      goal: null,
    });
    expect(focus.items.every((i) => i.reason !== "imbalance")).toBe(true);
  });

  it("выпавшую мышцу замечает только если раньше она работала", () => {
    const dropped = muscleFocus({
      loads: [load("chest"), load("rearDelt", { adjustedSets: 0, prevAdjusted: 12, daysSince: null })],
      balance: balanced,
      strengthSessions: 12,
      goal: null,
    });
    expect(dropped.items[0].reason).toBe("gap");
    expect(dropped.items[0].muscle).toBe("rearDelt");

    const never = muscleFocus({
      loads: [load("chest"), load("rearDelt", { adjustedSets: 0, prevAdjusted: 0, daysSince: null })],
      balance: balanced,
      strengthSessions: 12,
      goal: null,
    });
    expect(never.items).toEqual([]);
  });

  it("две недели без нагрузки — отдельный пункт", () => {
    const focus = muscleFocus({
      loads: [load("chest"), load("calves", { daysSince: 21 })],
      balance: balanced,
      strengthSessions: 12,
      goal: null,
    });
    expect(focus.items.some((i) => i.reason === "stale" && i.muscle === "calves")).toBe(true);
  });

  it("редкую частоту считает только на фоне более частых групп", () => {
    const focus = muscleFocus({
      loads: [load("chest"), load("lats"), load("quads", { frequency: 2 })],
      balance: balanced,
      strengthSessions: 12,
      goal: null,
    });
    expect(focus.items.some((i) => i.reason === "rare" && i.muscle === "quads")).toBe(true);
  });

  it("ориентир по объёму включается только под цель «набрать мышцы»", () => {
    const small = load("biceps", { adjustedSets: 8, frequency: 8 });
    const withoutGoal = muscleFocus({
      loads: [load("chest"), small],
      balance: balanced,
      strengthSessions: 12,
      goal: "strength",
    });
    expect(withoutGoal.items.every((i) => i.reason !== "volume")).toBe(true);

    const withGoal = muscleFocus({
      loads: [load("chest"), small],
      balance: balanced,
      strengthSessions: 12,
      goal: "muscle",
    });
    expect(withGoal.items.some((i) => i.reason === "volume" && i.muscle === "biceps")).toBe(true);
  });

  it("на одну мышцу — один пункт, и не больше трёх пунктов всего", () => {
    const focus = muscleFocus({
      loads: [
        load("chest"),
        load("rearDelt", { adjustedSets: 0, prevAdjusted: 10, daysSince: 30 }),
        load("calves", { daysSince: 20 }),
        load("hamstrings", { daysSince: 18 }),
        load("biceps", { daysSince: 16 }),
      ],
      balance: [
        { key: "delts", leftLabel: "Передняя дельта", left: 20, rightLabel: "Задняя дельта", right: 0 },
      ],
      strengthSessions: 12,
      goal: null,
    });
    expect(focus.items).toHaveLength(3);
    const muscles = focus.items.map((i) => i.muscle);
    expect(new Set(muscles).size).toBe(muscles.length);
  });
});
