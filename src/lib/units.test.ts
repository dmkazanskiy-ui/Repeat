import { describe, expect, it } from "vitest";
import { fromUnit, LB_IN_KG, toUnit, unitFor } from "./units";
import { formatVolume, formatWeight } from "./format";

describe("единицы веса", () => {
  it("50 кг показываются как 110 lb", () => {
    expect(toUnit(50, "lb")).toBe(110);
  });

  it("100 lb сохраняются как 45.36 кг (точно)", () => {
    const kg = fromUnit(100, "lb")!;
    expect(kg).toBeCloseTo(45.359237, 6);
    expect(formatWeight(kg, "kg")).toBe("45,36");
  });

  it("без дрейфа: 95 lb → кг → 95 lb", () => {
    for (const lb of [95, 2.5, 137.5, 315]) expect(toUnit(fromUnit(lb, "lb")!, "lb")).toBe(lb);
  });

  it("фунты округляются до 0,5", () => {
    expect(toUnit(60 * LB_IN_KG + 0.1, "lb")).toBe(60);
    expect(toUnit(20, "lb")).toBe(44);
  });

  it("свою единицу упражнения можно не задавать", () => {
    expect(unitFor("a", { a: "lb" }, "kg")).toBe("lb");
    expect(unitFor("b", { a: "lb" }, "kg")).toBe("kg");
  });

  it("тоннаж в фунтах", () => {
    expect(formatVolume(1000, "lb")).toMatch(/^2\s?205 lb$/);
  });
});
