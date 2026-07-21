import type { Exercise, MuscleGroup, SplitCode } from "./types";

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  back: "Спина",
  chest: "Грудь",
  shoulders: "Плечи",
  quads: "Квадрицепс",
  hamstrings: "Бицепс бедра",
  glutes: "Ягодицы",
  biceps: "Бицепс",
  triceps: "Трицепс",
  core: "Кор",
};

/**
 * Стартовый справочник — заготовка под сплит Дмитрия, а не догма.
 * Правится в экране «Упражнения»; каждый день сплита получает свой набор,
 * чтобы день C не предлагал те же движения, что день A.
 */
const SEED: Array<Omit<Exercise, "id"> & { days: SplitCode[] }> = [
  // A — спина / грудь / плечи
  { name: "Подтягивания", aliases: ["подтягивания", "турник"], muscleGroup: "back", trackingType: "bodyweight_reps", days: ["A"] },
  { name: "Тяга штанги в наклоне", aliases: ["тяга штанги", "тяга в наклоне"], muscleGroup: "back", trackingType: "weight_reps", days: ["A"] },
  { name: "Жим лёжа", aliases: ["жим", "жим лежа", "скамья"], muscleGroup: "chest", trackingType: "weight_reps", days: ["A"] },
  { name: "Жим гантелей на наклонной", aliases: ["наклонный жим", "гантели наклон"], muscleGroup: "chest", trackingType: "weight_reps", days: ["A"] },
  { name: "Жим стоя", aliases: ["армейский жим", "жим стоя"], muscleGroup: "shoulders", trackingType: "weight_reps", days: ["A"] },
  { name: "Махи гантелями в стороны", aliases: ["махи", "разводка"], muscleGroup: "shoulders", trackingType: "weight_reps", days: ["A"] },

  // B — ноги (перёд) / руки
  { name: "Присед со штангой", aliases: ["присед", "приседания"], muscleGroup: "quads", trackingType: "weight_reps", days: ["B"] },
  { name: "Жим ногами", aliases: ["жим ногами", "платформа"], muscleGroup: "quads", trackingType: "weight_reps", days: ["B"] },
  { name: "Разгибания ног", aliases: ["разгибания"], muscleGroup: "quads", trackingType: "weight_reps", days: ["B"] },
  { name: "Подъём на бицепс со штангой", aliases: ["бицепс штанга", "подъем на бицепс"], muscleGroup: "biceps", trackingType: "weight_reps", days: ["B"] },
  { name: "Французский жим", aliases: ["французский"], muscleGroup: "triceps", trackingType: "weight_reps", days: ["B"] },

  // C — спина / грудь / плечи, вариант 2
  { name: "Тяга верхнего блока", aliases: ["верхний блок", "тяга блока"], muscleGroup: "back", trackingType: "weight_reps", days: ["C"] },
  { name: "Тяга гантели одной рукой", aliases: ["тяга гантели"], muscleGroup: "back", trackingType: "weight_reps", days: ["C"] },
  { name: "Жим гантелей лёжа", aliases: ["гантели лежа"], muscleGroup: "chest", trackingType: "weight_reps", days: ["C"] },
  { name: "Отжимания на брусьях", aliases: ["брусья"], muscleGroup: "chest", trackingType: "bodyweight_reps", days: ["C"] },
  { name: "Разведения в тренажёре", aliases: ["бабочка", "пек-дек"], muscleGroup: "chest", trackingType: "weight_reps", days: ["C"] },
  { name: "Тяга к подбородку", aliases: ["протяжка"], muscleGroup: "shoulders", trackingType: "weight_reps", days: ["C"] },

  // D — ноги (зад) / руки
  { name: "Румынская тяга", aliases: ["румынка", "становая румынская"], muscleGroup: "hamstrings", trackingType: "weight_reps", days: ["D"] },
  { name: "Сгибания ног лёжа", aliases: ["сгибания"], muscleGroup: "hamstrings", trackingType: "weight_reps", days: ["D"] },
  { name: "Ягодичный мост", aliases: ["мост"], muscleGroup: "glutes", trackingType: "weight_reps", days: ["D"] },
  { name: "Гиперэкстензия", aliases: ["гиперы"], muscleGroup: "hamstrings", trackingType: "bodyweight_reps", days: ["D"] },
  { name: "Молотки", aliases: ["молот", "хаммер"], muscleGroup: "biceps", trackingType: "weight_reps", days: ["D"] },
  { name: "Разгибания на блоке", aliases: ["трицепс блок"], muscleGroup: "triceps", trackingType: "weight_reps", days: ["D"] },
];

/** Какие упражнения предложить, когда день сплита делается впервые. */
export const SEED_DAY_MAP: Record<SplitCode, string[]> = {
  A: SEED.filter((e) => e.days.includes("A")).map((e) => e.name),
  B: SEED.filter((e) => e.days.includes("B")).map((e) => e.name),
  C: SEED.filter((e) => e.days.includes("C")).map((e) => e.name),
  D: SEED.filter((e) => e.days.includes("D")).map((e) => e.name),
};

export function seedExercises(makeId: () => string): Exercise[] {
  return SEED.map(({ days: _days, ...exercise }) => ({
    id: makeId(),
    ...exercise,
  }));
}

export function findExercise(
  exercises: Exercise[],
  id: string,
): Exercise | undefined {
  return exercises.find((e) => e.id === id);
}

export function exerciseName(exercises: Exercise[], id: string): string {
  return findExercise(exercises, id)?.name ?? "Упражнение";
}

/** Свой вес и время не имеют веса на штанге — поле веса для них прячем. */
export function usesWeight(exercise: Exercise | undefined): boolean {
  return exercise?.trackingType === "weight_reps";
}
