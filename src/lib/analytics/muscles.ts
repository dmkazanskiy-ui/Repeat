// Справочник мышц и паттернов движений. У Exercise в модели только одна грубая
// muscleGroup, поэтому здесь по названию упражнения выводим основные/вторичные
// мышцы с коэффициентами нагрузки и паттерн движения. Классификация
// эвристическая — честно помечаем уровень доверия (confidence). Пользователь
// сможет переопределить её позже (архитектура готова: см. classifyExercise —
// достаточно подменить источник на сохранённый override).

import type { Exercise } from "../types";
import type { Confidence } from "./types";
import { L } from "../i18n";
import { EXERCISE_MUSCLES } from "../exerciseMuscles";
import type { FedbMuscles } from "../exerciseMuscles";

export type Muscle =
  | "chest"
  | "lats"
  | "upperBack"
  | "frontDelt"
  | "sideDelt"
  | "rearDelt"
  | "biceps"
  | "triceps"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "core";

export const MUSCLE_LABEL: Record<Muscle, string> = {
  get chest() { return L("Грудь", "Chest"); },
  get lats() { return L("Широчайшие", "Lats"); },
  get upperBack() { return L("Верх спины", "Upper back"); },
  get frontDelt() { return L("Передняя дельта", "Front delt"); },
  get sideDelt() { return L("Средняя дельта", "Side delt"); },
  get rearDelt() { return L("Задняя дельта", "Rear delt"); },
  get biceps() { return L("Бицепс", "Biceps"); },
  get triceps() { return L("Трицепс", "Triceps"); },
  get quads() { return L("Квадрицепс", "Quads"); },
  get hamstrings() { return L("Бицепс бедра", "Hamstrings"); },
  get glutes() { return L("Ягодичные", "Glutes"); },
  get calves() { return L("Икры", "Calves"); },
  get core() { return L("Кор", "Core"); },
};

export type MovementPattern =
  | "horizPush"
  | "vertPush"
  | "horizPull"
  | "vertPull"
  | "squat"
  | "hinge"
  | "lunge"
  | "core"
  | "isolation"
  | "other";

export interface MuscleContribution {
  muscle: Muscle;
  coef: number;
  role: "primary" | "secondary";
}

export interface ExerciseClassification {
  muscles: MuscleContribution[];
  patterns: MovementPattern[];
  confidence: Confidence;
}

function mix(
  primary: [Muscle, number],
  ...secondary: Array<[Muscle, number]>
): MuscleContribution[] {
  return [
    { muscle: primary[0], coef: primary[1], role: "primary" as const },
    ...secondary.map(([muscle, coef]) => ({
      muscle,
      coef,
      role: "secondary" as const,
    })),
  ];
}

interface Rule {
  test: (n: string) => boolean;
  muscles: MuscleContribution[];
  patterns: MovementPattern[];
}

const has =
  (...words: string[]) =>
  (n: string) =>
    words.every((w) => n.includes(w));
const any =
  (...words: string[]) =>
  (n: string) =>
    words.some((w) => n.includes(w));

// Порядок важен: более специфичные правила выше. Первое совпадение выигрывает.
const RULES: Rule[] = [
  // Грудь / жимы горизонтальные
  {
    test: (n) => n.includes("жим") && any("лёж", "лежа", "гру")(n),
    muscles: mix(["chest", 1], ["triceps", 0.5], ["frontDelt", 0.5]),
    patterns: ["horizPush"],
  },
  {
    test: (n) => any("отжиман", "брусья", "брусьях")(n),
    muscles: mix(["chest", 1], ["triceps", 0.6], ["frontDelt", 0.4]),
    patterns: ["horizPush"],
  },
  {
    test: has("сведени"),
    muscles: mix(["chest", 1]),
    patterns: ["isolation"],
  },
  // Жимы вертикальные (плечи)
  {
    test: (n) => n.includes("жим") && any("сид", "стоя", "плеч", "армейск", "над голов")(n),
    muscles: mix(["frontDelt", 1], ["sideDelt", 0.5], ["triceps", 0.5]),
    patterns: ["vertPush"],
  },
  // Дельты изоляция
  {
    test: (n) => any("махи", "разведени")(n) && any("задн", "обратн")(n),
    muscles: mix(["rearDelt", 1]),
    patterns: ["isolation"],
  },
  {
    test: any("махи", "разведени в стороны", "махи в стороны"),
    muscles: mix(["sideDelt", 1]),
    patterns: ["isolation"],
  },
  { test: has("шраги"), muscles: mix(["upperBack", 1]), patterns: ["isolation"] },
  // Тяги вертикальные (широчайшие)
  {
    test: (n) => any("подтягиван", "подтягив")(n) || (n.includes("тяга") && any("верхн", "вертикальн")(n)),
    muscles: mix(["lats", 1], ["biceps", 0.5], ["upperBack", 0.4]),
    patterns: ["vertPull"],
  },
  // Становая / наклонные тяги — до горизонтальных, чтобы становая не ушла в них
  {
    test: has("становая"),
    muscles: mix(["hamstrings", 1], ["glutes", 0.8], ["upperBack", 0.5]),
    patterns: ["hinge"],
  },
  {
    test: (n) => n.includes("тяга") && any("горизонт", "поясу", "наклон", "т-гриф", "гантел")(n),
    muscles: mix(["upperBack", 1], ["lats", 0.7], ["biceps", 0.5]),
    patterns: ["horizPull"],
  },
  { test: has("тяга"), muscles: mix(["lats", 1], ["biceps", 0.5], ["upperBack", 0.4]), patterns: ["horizPull"] },
  // Ноги
  { test: any("присед", "гакк"), muscles: mix(["quads", 1], ["glutes", 0.6], ["hamstrings", 0.3]), patterns: ["squat"] },
  { test: has("жим ногами"), muscles: mix(["quads", 1], ["glutes", 0.5]), patterns: ["squat"] },
  { test: any("выпад", "болгарск", "зашагиван"), muscles: mix(["quads", 1], ["glutes", 0.6], ["hamstrings", 0.3]), patterns: ["lunge"] },
  { test: (n) => n.includes("разгибани") && n.includes("ног"), muscles: mix(["quads", 1]), patterns: ["isolation"] },
  { test: (n) => n.includes("сгибани") && n.includes("ног"), muscles: mix(["hamstrings", 1]), patterns: ["isolation"] },
  { test: any("ягодичн", "мост", "гиперэкстенз", "ягодичный мост"), muscles: mix(["glutes", 1], ["hamstrings", 0.5]), patterns: ["hinge"] },
  { test: any("икр", "голен", "носк"), muscles: mix(["calves", 1]), patterns: ["isolation"] },
  // Руки
  { test: any("бицепс", "подъём на", "сгибание рук", "молот"), muscles: mix(["biceps", 1]), patterns: ["isolation"] },
  { test: any("трицепс", "разгибание рук", "французск"), muscles: mix(["triceps", 1]), patterns: ["isolation"] },
  // Кор
  { test: any("пресс", "скручиван", "планк", "живот", "кор ", "ролик"), muscles: mix(["core", 1]), patterns: ["core"] },
];

// Запасной вариант по грубой группе Exercise.muscleGroup — только основная мышца.
const COARSE_FALLBACK: Partial<Record<Exercise["muscleGroup"], Muscle>> = {
  chest: "chest",
  back: "lats",
  shoulders: "sideDelt",
  legs: "quads",
  glutes: "glutes",
  arms: "biceps",
  core: "core",
};

// Маппинг мышц free-exercise-db → наши 13 групп. Дельты у датасета одной
// «shoulders» — уточняем конкретную дельту из эвристики (см. fromDataset).
const FEDB_TO_MUSCLE: Record<string, Muscle | null> = {
  abdominals: "core",
  abductors: "glutes",
  adductors: "quads",
  biceps: "biceps",
  calves: "calves",
  chest: "chest",
  forearms: "biceps",
  glutes: "glutes",
  hamstrings: "hamstrings",
  lats: "lats",
  "lower back": "core",
  "middle back": "upperBack",
  neck: null,
  quadriceps: "quads",
  shoulders: "sideDelt", // общий дефолт, уточняется в fromDataset
  traps: "upperBack",
  triceps: "triceps",
};

function heuristicDelt(muscles: MuscleContribution[]): Muscle | null {
  const d = muscles.find(
    (m) => m.muscle === "frontDelt" || m.muscle === "sideDelt" || m.muscle === "rearDelt",
  );
  return d ? d.muscle : null;
}

/**
 * Из данных датасета (primary/secondary) собираем наши MuscleContribution.
 * primary → coef 1, secondary → coef 0.5. Общую «shoulders» уточняем конкретной
 * дельтой из эвристики (frontDelt/sideDelt/rearDelt), чтобы не потерять деление.
 */
function fromDataset(ds: FedbMuscles, heuristic: MuscleContribution[]): MuscleContribution[] {
  const delt = heuristicDelt(heuristic);
  const acc = new Map<Muscle, MuscleContribution>();
  const add = (slug: string, coef: number, role: "primary" | "secondary") => {
    let m = FEDB_TO_MUSCLE[slug];
    if (m == null) return;
    if (slug === "shoulders" && delt) m = delt;
    const cur = acc.get(m);
    if (!cur || coef > cur.coef) acc.set(m, { muscle: m, coef, role });
  };
  for (const s of ds.p) add(s, 1, "primary");
  for (const s of ds.s) add(s, 0.5, "secondary");
  return [...acc.values()];
}

/**
 * Классификация упражнения: основные/вторичные мышцы с коэффициентами и
 * паттерн движения. Где есть выверенный матч в free-exercise-db — берём реальные
 * primary/secondary (точнее эвристики); паттерн движения всегда из эвристики
 * (в датасете его нет). confidence «high» — точное правило или матч датасета;
 * «preliminary» — только запасной вариант по грубой группе.
 */
export function classifyExercise(exercise: Exercise): ExerciseClassification {
  const n = exercise.name.toLowerCase();
  let base: ExerciseClassification | null = null;
  for (const rule of RULES) {
    if (rule.test(n)) {
      base = { muscles: rule.muscles, patterns: rule.patterns, confidence: "high" };
      break;
    }
  }
  if (!base) {
    const fallback = COARSE_FALLBACK[exercise.muscleGroup];
    base = fallback
      ? { muscles: [{ muscle: fallback, coef: 1, role: "primary" }], patterns: ["other"], confidence: "preliminary" }
      : { muscles: [], patterns: ["other"], confidence: "preliminary" };
  }

  const ds = EXERCISE_MUSCLES[exercise.name];
  if (ds) {
    const muscles = fromDataset(ds, base.muscles);
    if (muscles.length > 0) {
      return { muscles, patterns: base.patterns, confidence: "high" };
    }
  }
  return base;
}
