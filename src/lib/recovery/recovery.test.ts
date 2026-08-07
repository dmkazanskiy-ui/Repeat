import { describe, expect, it } from "vitest";
import { newSession } from "../store";
import {
  PERCEIVED_EFFECTS,
  PERCEIVED_EFFECT_LABELS,
  activityIcon,
  activityLabel,
  isTrainingSession,
  recoveryDurationSec,
  sessionSetCount,
  sessionVolume,
} from "../types";
import type { RecoveryType, Session } from "../types";
import { workingSetsOf } from "../analytics/load";
import {
  RECOVERY_CATEGORIES,
  RECOVERY_CATEGORY_OF,
  RECOVERY_ICONS,
  RECOVERY_LABELS,
  RECOVERY_PROCEDURES,
  proceduresOf,
} from "./catalog";
import { ICONS } from "../icons";

describe("каталог восстановления", () => {
  it("у каждой процедуры есть подпись, иконка и категория", () => {
    for (const proc of RECOVERY_PROCEDURES) {
      expect(RECOVERY_LABELS[proc.type]).toBeTruthy();
      expect(RECOVERY_ICONS[proc.type]).toBeTruthy();
      expect(ICONS[proc.icon]).toBeTruthy(); // иконка существует в наборе
      expect(RECOVERY_CATEGORY_OF[proc.type]).toBe(proc.category);
    }
  });

  it("типы процедур уникальны", () => {
    const types = RECOVERY_PROCEDURES.map((p) => p.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it("категории покрывают все процедуры без потерь", () => {
    const grouped = RECOVERY_CATEGORIES.flatMap((c) => proceduresOf(c.category));
    expect(grouped.length).toBe(RECOVERY_PROCEDURES.length);
  });
});

describe("создание записи восстановления", () => {
  it("newSession(recovery) заполняет процедуру и не создаёт кардио/упражнения", () => {
    const s = newSession("2026-07-26", "recovery", { recoveryType: "sauna" });
    expect(s.kind).toBe("recovery");
    expect(s.recovery?.type).toBe("sauna");
    expect(s.cardio).toBeNull();
    expect(s.exercises).toEqual([]);
    expect(s.cardioKind).toBeNull();
    expect(s.mobilityKind).toBeNull();
  });

  it("без явной процедуры — полный отдых по умолчанию", () => {
    const s = newSession("2026-07-26", "recovery");
    expect(s.recovery?.type).toBe("full_rest");
  });
});

describe("восстановление не протекает в тренировочную аналитику", () => {
  const rec = newSession("2026-07-26", "recovery", { recoveryType: "massage" });

  it("нулевой тоннаж, подходы и рабочие подходы", () => {
    expect(sessionVolume(rec)).toBe(0);
    expect(sessionSetCount(rec)).toBe(0);
    expect(workingSetsOf(rec)).toBe(0);
  });

  it("не считается тренировочной сессией", () => {
    expect(isTrainingSession(rec)).toBe(false);
    const strength = newSession("2026-07-26", "strength");
    expect(isTrainingSession(strength)).toBe(true);
  });
});

describe("подпись и иконка восстановления", () => {
  it("подпись — название процедуры, иконка — из каталога", () => {
    const s = newSession("2026-07-26", "recovery", { recoveryType: "cold_plunge" });
    expect(activityLabel(s)).toBe(RECOVERY_LABELS.cold_plunge);
    expect(activityIcon(s)).toBe(RECOVERY_ICONS.cold_plunge);
  });

  it("recovery без данных — дефолтная иконка spa, подпись null", () => {
    const s: Session = { ...newSession("2026-07-26", "recovery"), recovery: null };
    expect(activityIcon(s)).toBe("spa");
    expect(activityLabel(s)).toBeNull();
  });
});

describe("длительность восстановления", () => {
  it("минуты переводятся в секунды, пусто/ноль → null", () => {
    const base = newSession("2026-07-26", "recovery", { recoveryType: "sauna" });
    expect(recoveryDurationSec({ ...base, recovery: { type: "sauna", durationMin: 45 } })).toBe(2700);
    expect(recoveryDurationSec({ ...base, recovery: { type: "sauna", durationMin: 0 } })).toBeNull();
    expect(recoveryDurationSec(base)).toBeNull();
  });
});

describe("субъективный эффект процедуры", () => {
  it("шкала эффекта — 5 ступеней с уникальными подписями", () => {
    expect(PERCEIVED_EFFECTS).toHaveLength(5);
    const labels = PERCEIVED_EFFECTS.map((e) => e.label);
    expect(new Set(labels).size).toBe(5);
    expect(PERCEIVED_EFFECT_LABELS.much_better).toBe("Отлично восстановило");
  });

  it("эффект хранится в записи и показывается как подпись", () => {
    const base = newSession("2026-07-26", "recovery", { recoveryType: "sports_massage" });
    const s: Session = { ...base, recovery: { type: "sports_massage", effect: "much_better" } };
    expect(s.recovery?.effect).toBe("much_better");
    expect(PERCEIVED_EFFECT_LABELS[s.recovery!.effect!]).toBe("Отлично восстановило");
  });

  it("новые виды массажа есть в каталоге", () => {
    for (const type of ["relax_massage", "lymph_massage", "thai_massage", "spa_ritual"] as const) {
      expect(RECOVERY_LABELS[type]).toBeTruthy();
      expect(RECOVERY_CATEGORY_OF[type]).toBe("bodywork");
    }
  });
});

describe("миграция старых данных", () => {
  it("сессия без поля recovery продолжает работать", () => {
    // Старая силовая из IndexedDB — поля recovery в объекте нет вовсе.
    const legacy = {
      id: "x",
      date: "2026-01-01",
      kind: "strength" as const,
      cardioKind: null,
      title: null,
      notes: null,
      createdAt: "2026-01-01T10:00:00.000Z",
      exercises: [],
      cardio: null,
    } satisfies Session;
    expect(isTrainingSession(legacy)).toBe(true);
    expect(activityIcon(legacy)).toBe("gym");
    expect(recoveryDurationSec(legacy)).toBeNull();
  });

  it("для типов union: RecoveryType из каталога", () => {
    const types: RecoveryType[] = RECOVERY_PROCEDURES.map((p) => p.type);
    expect(types).toContain("full_rest");
    expect(types).toContain("other");
  });
});
