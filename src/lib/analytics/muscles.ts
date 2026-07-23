// Справочник мышц и паттернов движений. У Exercise в модели только одна грубая
// muscleGroup, поэтому здесь по названию упражнения выводим основные/вторичные
// мышцы с коэффициентами нагрузки и паттерн движения. Классификация
// эвристическая — честно помечаем уровень доверия (confidence). Пользователь
// сможет переопределить её позже (архитектура готова: см. classifyExercise —
// достаточно подменить источник на сохранённый override).

import type { Exercise } from "../types";
import type { Confidence } from "./types";

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
  chest: "Грудь",
  lats: "Широчайшие",
  upperBack: "Верх спины",
  frontDelt: "Передняя дельта",
  sideDelt: "Средняя дельта",
  rearDelt: "Задняя дельта",
  biceps: "Бицепс",
  triceps: "Трицепс",
  quads: "Квадрицепс",
  hamstrings: "Бицепс бедра",
  glutes: "Ягодичные",
  calves: "Икры",
  core: "Кор",
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

/**
 * Классификация упражнения: основные/вторичные мышцы с коэффициентами и
 * паттерн движения. confidence «high» — сработало точное правило по названию;
 * «preliminary» — только запасной вариант по грубой группе.
 */
export function classifyExercise(exercise: Exercise): ExerciseClassification {
  const n = exercise.name.toLowerCase();
  for (const rule of RULES) {
    if (rule.test(n)) {
      return { muscles: rule.muscles, patterns: rule.patterns, confidence: "high" };
    }
  }
  const fallback = COARSE_FALLBACK[exercise.muscleGroup];
  if (fallback) {
    return {
      muscles: [{ muscle: fallback, coef: 1, role: "primary" }],
      patterns: ["other"],
      confidence: "preliminary",
    };
  }
  return { muscles: [], patterns: ["other"], confidence: "preliminary" };
}
