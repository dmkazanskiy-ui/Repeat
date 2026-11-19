// Единицы веса: кг или фунты. В хранилище и синке вес ВСЕГДА в кг —
// конвертация только на вводе и выводе. Общая единица — настройка профиля
// (localStorage); у упражнения может быть своя (тренажёр в фунтах) — карта
// exerciseId → единица живёт в данных и синхронизируется.
//
// Ввод в lb сохраняется точным значением в кг (без округления), поэтому
// показ обратно в lb даёт ровно введённое: 95 lb → 43.0913… кг → 95 lb.

import { useSyncExternalStore } from "react";
import { L, getLang } from "./i18n";

export type WeightUnit = "kg" | "lb";
export type ExerciseUnits = Record<string, WeightUnit>;

export const LB_IN_KG = 0.45359237;
const KEY = "repeat_weight_unit";

let unit: WeightUnit = readStored();
const listeners = new Set<() => void>();

function readStored(): WeightUnit {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "lb" ? "lb" : "kg";
  } catch {
    return "kg";
  }
}

/** Общая единица из профиля. */
export function globalUnit(): WeightUnit {
  return unit;
}

export function setGlobalUnit(next: WeightUnit): void {
  unit = next;
  try {
    if (next === "kg") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    /* приватный режим */
  }
  listeners.forEach((l) => l());
}

export function useGlobalUnit(): WeightUnit {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => unit,
    () => "kg",
  );
}

/** Единица упражнения: своя, если задана, иначе общая. */
export function unitFor(exerciseId: string, overrides: ExerciseUnits | undefined, fallback = unit): WeightUnit {
  return overrides?.[exerciseId] ?? fallback;
}

export function unitLabel(u: WeightUnit = unit): string {
  return u === "lb" ? L("lb", "lb") : L("кг", "kg");
}

/** кг → единица показа. Фунты — до 0,5; кг — как есть (форматирование решает округление). */
export function toUnit(kg: number, u: WeightUnit = unit): number {
  if (u === "kg") return kg;
  return Math.round((kg / LB_IN_KG) * 2) / 2;
}

/** То же для null-значений полей. */
export function toUnitOrNull(kg: number | null, u: WeightUnit = unit): number | null {
  return kg == null ? null : toUnit(kg, u);
}

/** Введённое в единице → кг, точно (без округления). */
export function fromUnit(value: number | null, u: WeightUnit = unit): number | null {
  if (value == null) return null;
  return u === "kg" ? value : value * LB_IN_KG;
}

/** Большие суммы (тоннаж): кг → единица, без округления до 0,5. */
export function massToUnit(kg: number, u: WeightUnit = unit): number {
  return u === "kg" ? kg : kg / LB_IN_KG;
}

/** Вес для показа: число в единице, до сотых, с запятой в RU. */
export function fmtWeight(kg: number | null, u: WeightUnit = unit): string {
  if (kg == null) return "—";
  const v = Number(toUnit(kg, u).toFixed(2));
  return getLang() === "ru" ? String(v).replace(".", ",") : String(v);
}

/** Округлённый вес с единицей: «139 кг», «306 lb». */
export function fmtWeightRound(kg: number, u: WeightUnit = unit): string {
  return `${Math.round(massToUnit(kg, u))} ${unitLabel(u)}`;
}
