import { describe, expect, it } from "vitest";
import { setLine, setWeight } from "./snap";

describe("вес подхода в ленте", () => {
  it("фунты — в lb до 0,5, килограммы — не больше одного знака", () => {
    expect(setWeight(22.6796185)).toBe("22,7"); // 50 lb, записанные в кг
    expect(setWeight(22.6796185, "lb")).toBe("50");
    expect(setWeight(61.23497, "lb")).toBe("135");
    expect(setWeight(95)).toBe("95");
    expect(setWeight(null)).toBe("—");
  });
  it("строка подходов с единицей", () => {
    const w = 22.6796185;
    expect(setLine([{ w, r: 10 }, { w, r: 10 }, { w, r: 10 }], "lb")).toBe("50×10 · 3 lb");
    expect(setLine([{ w: 80, r: 8 }, { w: 82.5, r: 6 }])).toBe("80×8 · 82,5×6");
  });
});
