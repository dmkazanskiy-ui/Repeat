// Что показывать под каждый вид кардио.
//
// Раньше все виды спрашивали одно и то же — дистанцию, время, пульс, — и это
// врало: у степпера дистанции нет, у велотренажёра важнее мощность, а темп
// «мин/км» осмыслен для бега, но не для ходьбы, где на табло стоит км/ч.
// Профиль описывает вид: какие поля спрашиваем, в чём меряем дистанцию и
// какую производную величину считаем сама. UI просто читает профиль.

import { formatPace, formatSpeed } from "./format";
import { L } from "./i18n";
import type { CardioKind } from "./types";

export type CardioFieldKey =
  | "distance"
  | "duration"
  | "incline"
  | "avgHr"
  | "resistance"
  | "powerW"
  | "floors"
  | "calories";

/** Производная величина под полями — считается, а не вводится. */
export type CardioRate = "pace_km" | "pace_100m" | "kph" | null;

export interface CardioProfile {
  /** Единица дистанции; null — у вида дистанции нет. */
  distance: "km" | "m" | null;
  rate: CardioRate;
  fields: CardioFieldKey[];
  /** Имеет ли смысл разбивка на интервалы («10 × 400 м»). */
  intervals: boolean;
}

const DEFAULT_PROFILE: CardioProfile = {
  distance: "km",
  rate: "pace_km",
  fields: ["distance", "duration", "avgHr", "calories"],
  intervals: true,
};

const PROFILES: Record<CardioKind, CardioProfile> = {
  run: DEFAULT_PROFILE,
  treadmill_run: {
    distance: "km",
    rate: "pace_km",
    fields: ["distance", "duration", "incline", "avgHr", "calories"],
    intervals: true,
  },
  // Ходьба идёт по скорости с табло, а не по темпу: «5,5 км/ч» понятнее,
  // чем «10:54/км».
  treadmill: {
    distance: "km",
    rate: "kph",
    fields: ["distance", "duration", "incline", "avgHr", "calories"],
    intervals: false,
  },
  bike: {
    distance: "km",
    rate: "kph",
    fields: ["distance", "duration", "powerW", "avgHr", "calories"],
    intervals: true,
  },
  swim: {
    distance: "m",
    rate: "pace_100m",
    fields: ["distance", "duration", "avgHr", "calories"],
    intervals: true,
  },
  elliptical: {
    distance: "km",
    rate: "kph",
    fields: ["duration", "distance", "resistance", "avgHr", "calories"],
    intervals: false,
  },
  // У степпера дистанции нет — на табло этажи и уровень.
  stairs: {
    distance: null,
    rate: null,
    fields: ["duration", "floors", "resistance", "avgHr", "calories"],
    intervals: false,
  },
  hiit: {
    distance: null,
    rate: null,
    fields: ["duration", "avgHr", "calories"],
    intervals: false,
  },
};

/** Профиль вида. Свой вид (`customKind`) идёт по умолчанию — бег/ходьба. */
export function cardioProfile(kind: CardioKind | null | undefined): CardioProfile {
  return kind ? (PROFILES[kind] ?? DEFAULT_PROFILE) : DEFAULT_PROFILE;
}

/** Подпись поля с единицей — как её видит пользователь. */
export const CARDIO_FIELD_LABELS: Record<CardioFieldKey, string> = {
  get distance() { return L("Дистанция", "Distance"); },
  get duration() { return L("Время, мин", "Time, min"); },
  get incline() { return L("Наклон, °", "Incline, °"); },
  get avgHr() { return L("Средний пульс", "Avg heart rate"); },
  get resistance() { return L("Уровень", "Resistance"); },
  get powerW() { return L("Мощность, Вт", "Power, W"); },
  get floors() { return L("Этажи", "Floors"); },
  get calories() { return L("Калории, ккал", "Calories, kcal"); },
};

/** Подпись производной величины. */
export function rateLabel(rate: CardioRate): string | null {
  switch (rate) {
    case "pace_km":
    case "pace_100m":
      return L("Темп", "Pace");
    case "kph":
      return L("Скорость", "Speed");
    default:
      return null;
  }
}

/** Готовая строка производной величины под поля вида. */
export function formatRate(
  rate: CardioRate,
  meters: number | null,
  seconds: number | null,
): string {
  switch (rate) {
    case "pace_km":
      return formatPace(meters, seconds, null);
    case "pace_100m":
      return formatPace(meters, seconds, "swim");
    case "kph":
      return formatSpeed(meters, seconds);
    default:
      return "—";
  }
}
