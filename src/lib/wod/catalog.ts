// Каталог заданий с фиксированным результатом: HYROX и классические
// кроссфит-бенчмарки. Ценность каталога — в СРАВНИМОСТИ: одно и то же задание,
// выполненное в разные месяцы, даёт честный прогресс без всяких формул.
//
// Источники (оба MIT, взяты как сид и перепроверены):
//   HYROX-стандарты — moose-lab/hyrox-training-plan-skill (references/race-standards.json)
//   бенчмарки — PrinterFranklin/WoDMaster (Resources/BenchmarkWODs.json)
// Схемы движений храним текстом: разбирать их в упражнения не нужно — в задании
// сравнивается результат целиком, а не тоннаж по движениям.

import { L } from "../i18n";
import type { IconKey } from "../icons";
import type { WodScore } from "../types";

export type WodCategory = "hyrox" | "benchmark";

export interface WodPreset {
  /** Стабильный ключ — по нему сравниваются попытки. Не менять. */
  id: string;
  category: WodCategory;
  /** Имя. У бенчмарков — имя собственное (не переводится). */
  name: string;
  score: WodScore;
  /** Схема заданием, текстом. */
  scheme: string;
  /** Лимит времени / окно AMRAP, сек. */
  capSec: number | null;
  icon: IconKey;
}

export const WOD_CATEGORY_LABELS: Record<WodCategory, string> = {
  get hyrox() { return L("HYROX", "HYROX"); },
  get benchmark() { return L("Кроссфит-бенчмарки", "CrossFit benchmarks"); },
};

/** Веса станций по дивизионам — одной строкой, чтобы не плодить настройки. */
const DIV = {
  get sledPush() { return L("Open: Ж 102 / М 152 · Pro: М 202 кг", "Open: W 102 / M 152 · Pro: M 202 kg"); },
  get sledPull() { return L("Open: Ж 78 / М 103 · Pro: М 153 кг", "Open: W 78 / M 103 · Pro: M 153 kg"); },
  get farmers() { return L("Open: 2×16 / 2×24 · Pro: 2×32 кг", "Open: 2×16 / 2×24 · Pro: 2×32 kg"); },
  get sandbag() { return L("Open: 10 / 20 · Pro: 30 кг", "Open: 10 / 20 · Pro: 30 kg"); },
  get wallBalls() { return L("Open: 4 / 6 · Pro: 9 кг", "Open: 4 / 6 · Pro: 9 kg"); },
};

export const HYROX_STATIONS: WodPreset[] = [
  {
    id: "hyrox:skierg",
    category: "hyrox",
    score: "for_time",
    capSec: null,
    icon: "rowing",
    get name() { return L("SkiErg 1000 м", "SkiErg 1000m"); },
    get scheme() { return L("Станция 1 HYROX. 1000 м на скиэрге.", "HYROX station 1. 1000m on the SkiErg."); },
  },
  {
    id: "hyrox:sled_push",
    category: "hyrox",
    score: "for_time",
    capSec: null,
    icon: "gym",
    get name() { return L("Толкание саней 50 м", "Sled Push 50m"); },
    get scheme() { return L(`Станция 2 HYROX. 4×12,5 м. ${DIV.sledPush} (вместе с санями).`, `HYROX station 2. 4×12.5m. ${DIV.sledPush} (sled included).`); },
  },
  {
    id: "hyrox:sled_pull",
    category: "hyrox",
    score: "for_time",
    capSec: null,
    icon: "gym",
    get name() { return L("Протяжка саней 50 м", "Sled Pull 50m"); },
    get scheme() { return L(`Станция 3 HYROX. 4×12,5 м. ${DIV.sledPull} (вместе с санями).`, `HYROX station 3. 4×12.5m. ${DIV.sledPull} (sled included).`); },
  },
  {
    id: "hyrox:burpee_broad_jump",
    category: "hyrox",
    score: "for_time",
    capSec: null,
    icon: "bolt",
    get name() { return L("Бёрпи с прыжком 80 м", "Burpee Broad Jump 80m"); },
    get scheme() { return L("Станция 4 HYROX. 80 м бёрпи с прыжком в длину.", "HYROX station 4. 80m of burpee broad jumps."); },
  },
  {
    id: "hyrox:row",
    category: "hyrox",
    score: "for_time",
    capSec: null,
    icon: "rowing",
    get name() { return L("Гребля 1000 м", "Rowing 1000m"); },
    get scheme() { return L("Станция 5 HYROX. 1000 м на гребном тренажёре.", "HYROX station 5. 1000m on the rower."); },
  },
  {
    id: "hyrox:farmers_carry",
    category: "hyrox",
    score: "for_time",
    capSec: null,
    icon: "walk",
    get name() { return L("Прогулка фермера 200 м", "Farmers Carry 200m"); },
    get scheme() { return L(`Станция 6 HYROX. 200 м с двумя гирями. ${DIV.farmers}.`, `HYROX station 6. 200m with two kettlebells. ${DIV.farmers}.`); },
  },
  {
    id: "hyrox:sandbag_lunges",
    category: "hyrox",
    score: "for_time",
    capSec: null,
    icon: "body",
    get name() { return L("Выпады с мешком 100 м", "Sandbag Lunges 100m"); },
    get scheme() { return L(`Станция 7 HYROX. 100 м выпадов с мешком. ${DIV.sandbag}.`, `HYROX station 7. 100m of sandbag lunges. ${DIV.sandbag}.`); },
  },
  {
    id: "hyrox:wall_balls",
    category: "hyrox",
    score: "for_time",
    capSec: null,
    icon: "gym",
    get name() { return L("Wall balls 100 повторов", "Wall Balls 100 reps"); },
    get scheme() { return L(`Станция 8 HYROX. 100 бросков мяча. ${DIV.wallBalls}.`, `HYROX station 8. 100 wall ball shots. ${DIV.wallBalls}.`); },
  },
];

const HYROX_RACES: WodPreset[] = [
  {
    id: "hyrox:race",
    category: "hyrox",
    score: "for_time",
    capSec: null,
    icon: "run",
    get name() { return L("HYROX — гонка", "HYROX — full race"); },
    get scheme() {
      return L(
        "8 × 1 км бег, после каждого — станция: скиэрг 1000 м · сани толкание 50 м · сани протяжка 50 м · бёрпи с прыжком 80 м · гребля 1000 м · прогулка фермера 200 м · выпады с мешком 100 м · wall balls 100.",
        "8 × 1km run, each followed by a station: SkiErg 1000m · Sled Push 50m · Sled Pull 50m · Burpee Broad Jump 80m · Row 1000m · Farmers Carry 200m · Sandbag Lunges 100m · Wall Balls 100.",
      );
    },
  },
  {
    id: "hyrox:half",
    category: "hyrox",
    score: "for_time",
    capSec: null,
    icon: "run",
    get name() { return L("HYROX — половина", "HYROX — half simulation"); },
    get scheme() {
      return L(
        "Прикидка: 4 × 1 км бег + первые четыре станции (скиэрг · сани толкание · сани протяжка · бёрпи с прыжком).",
        "Simulation: 4 × 1km run + the first four stations (SkiErg · Sled Push · Sled Pull · Burpee Broad Jump).",
      );
    },
  },
];

const BENCHMARKS: WodPreset[] = [
  {
    id: "wod:fran",
    category: "benchmark",
    name: "Fran",
    score: "for_time",
    capSec: 600,
    icon: "gym",
    get scheme() { return L("21-15-9\nТрастеры (43/30 кг)\nПодтягивания", "21-15-9\nThrusters (43/30 kg)\nPull-ups"); },
  },
  {
    id: "wod:murph",
    category: "benchmark",
    name: "Murph",
    score: "for_time",
    capSec: null,
    icon: "run",
    get scheme() {
      return L(
        "1,6 км бег\n100 подтягиваний\n200 отжиманий\n300 приседаний\n1,6 км бег\n*в жилете 9/6 кг",
        "1 mile run\n100 pull-ups\n200 push-ups\n300 air squats\n1 mile run\n*with a 20/14 lb vest",
      );
    },
  },
  {
    id: "wod:grace",
    category: "benchmark",
    name: "Grace",
    score: "for_time",
    capSec: 600,
    icon: "gym",
    get scheme() { return L("30 взятий на грудь и толчков (61/43 кг)", "30 clean & jerks (61/43 kg)"); },
  },
  {
    id: "wod:diane",
    category: "benchmark",
    name: "Diane",
    score: "for_time",
    capSec: 600,
    icon: "gym",
    get scheme() { return L("21-15-9\nСтановая тяга (102/70 кг)\nОтжимания в стойке на руках", "21-15-9\nDeadlifts (102/70 kg)\nHandstand push-ups"); },
  },
  {
    id: "wod:helen",
    category: "benchmark",
    name: "Helen",
    score: "for_time",
    capSec: null,
    icon: "run",
    get scheme() { return L("3 раунда:\n400 м бег\n21 мах гирей (24/16 кг)\n12 подтягиваний", "3 rounds:\n400m run\n21 KB swings (24/16 kg)\n12 pull-ups"); },
  },
  {
    id: "wod:cindy",
    category: "benchmark",
    name: "Cindy",
    score: "amrap",
    capSec: 1200,
    icon: "body",
    get scheme() { return L("AMRAP 20 минут:\n5 подтягиваний\n10 отжиманий\n15 приседаний", "AMRAP 20 minutes:\n5 pull-ups\n10 push-ups\n15 air squats"); },
  },
  {
    id: "wod:annie",
    category: "benchmark",
    name: "Annie",
    score: "for_time",
    capSec: null,
    icon: "bolt",
    get scheme() { return L("50-40-30-20-10\nДвойные прыжки на скакалке\nСкручивания", "50-40-30-20-10\nDouble unders\nSit-ups"); },
  },
  {
    id: "wod:jackie",
    category: "benchmark",
    name: "Jackie",
    score: "for_time",
    capSec: null,
    icon: "rowing",
    get scheme() { return L("1000 м гребля\n50 трастеров (20/15 кг)\n30 подтягиваний", "1000m row\n50 thrusters (20/15 kg)\n30 pull-ups"); },
  },
  {
    id: "wod:elizabeth",
    category: "benchmark",
    name: "Elizabeth",
    score: "for_time",
    capSec: null,
    icon: "gym",
    get scheme() { return L("21-15-9\nВзятия на грудь (61/43 кг)\nОтжимания на кольцах", "21-15-9\nCleans (61/43 kg)\nRing dips"); },
  },
  {
    id: "wod:isabel",
    category: "benchmark",
    name: "Isabel",
    score: "for_time",
    capSec: 600,
    icon: "gym",
    get scheme() { return L("30 рывков (61/43 кг)", "30 snatches (61/43 kg)"); },
  },
  {
    id: "wod:karen",
    category: "benchmark",
    name: "Karen",
    score: "for_time",
    capSec: null,
    icon: "gym",
    get scheme() { return L("150 бросков мяча (9/6 кг)", "150 wall balls (9/6 kg)"); },
  },
  {
    id: "wod:filthy_fifty",
    category: "benchmark",
    name: "Filthy Fifty",
    score: "for_time",
    capSec: null,
    icon: "bolt",
    get scheme() {
      return L(
        "По 50 повторов:\nзапрыгивания на тумбу · подтягивания с прыжка · махи гирей · выпады в ходьбе · колени к локтям · жим над головой · разгибания спины · броски мяча · бёрпи · двойные прыжки",
        "50 reps of each:\nbox jumps · jumping pull-ups · KB swings · walking lunges · knees-to-elbows · push press · back extensions · wall balls · burpees · double unders",
      );
    },
  },
];

export const WOD_PRESETS: WodPreset[] = [...HYROX_RACES, ...HYROX_STATIONS, ...BENCHMARKS];

export function findWodPreset(id: string | null | undefined): WodPreset | null {
  if (!id) return null;
  return WOD_PRESETS.find((p) => p.id === id) ?? null;
}

export function wodPresetsByCategory(category: WodCategory): WodPreset[] {
  return WOD_PRESETS.filter((p) => p.category === category);
}
