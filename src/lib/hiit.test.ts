import { describe, expect, it } from "vitest";
import { buildHiitPhases, clampHiit, hiitTotalSec, hiitWorkSec, type HiitConfig } from "./hiit";

const cfg = (o: Partial<HiitConfig> = {}): HiitConfig => ({
  workSec: 20, restSec: 10, rounds: 8, warmupSec: 0, cooldownSec: 0, prepSec: 0, ...o,
});

describe("buildHiitPhases", () => {
  it("чередует работу и отдых, без отдыха после последнего раунда", () => {
    const p = buildHiitPhases(cfg({ rounds: 3 }));
    expect(p.map((x) => x.kind)).toEqual(["work", "rest", "work", "rest", "work"]);
    expect(p[0].round).toBe(1);
    expect(p[4].round).toBe(3);
  });

  it("EMOM (restSec 0) — только работа", () => {
    const p = buildHiitPhases(cfg({ restSec: 0, rounds: 4 }));
    expect(p.every((x) => x.kind === "work")).toBe(true);
    expect(p).toHaveLength(4);
  });

  it("prep/warmup/cooldown добавляются только когда заданы", () => {
    const p = buildHiitPhases(cfg({ rounds: 2, prepSec: 10, warmupSec: 60, cooldownSec: 30 }));
    expect(p[0].kind).toBe("prep");
    expect(p[1].kind).toBe("warmup");
    expect(p[p.length - 1].kind).toBe("cooldown");
  });
});

describe("hiit totals", () => {
  it("рабочие секунды = раунды × работа", () => {
    expect(hiitWorkSec(cfg({ rounds: 8, workSec: 20 }))).toBe(160);
  });

  it("полная длительность учитывает все фазы без хвостового отдыха", () => {
    // Табата 20/10 ×8 = 8×20 + 7×10 = 230.
    expect(hiitTotalSec(cfg({ rounds: 8 }))).toBe(230);
  });

  it("с prep/warmup/cooldown", () => {
    // 2 раунда 20/10 = 20+10+20=50, +prep10 +warmup60 +cd30 = 150.
    expect(hiitTotalSec(cfg({ rounds: 2, prepSec: 10, warmupSec: 60, cooldownSec: 30 }))).toBe(150);
  });
});

describe("clampHiit", () => {
  it("зажимает в разумные границы и округляет", () => {
    const c = clampHiit({ workSec: 2, restSec: -5, rounds: 200, warmupSec: 0, cooldownSec: 0, prepSec: 999 });
    expect(c.workSec).toBe(5);
    expect(c.restSec).toBe(0);
    expect(c.rounds).toBe(99);
    expect(c.prepSec).toBe(60);
  });
});
