import type { SplitCode, SplitDay, Workout } from "./types";

/**
 * Сплит Дмитрия. Цикл вращается: следующий день определяется по последней
 * завершённой тренировке, а не по календарю. Пропустил неделю — цикл
 * продолжается с того же места. См. SPEC.md §2.4.
 */
export const SPLIT_DAYS: SplitDay[] = [
  {
    code: "A",
    title: "Спина / грудь / плечи",
    orderIndex: 0,
    muscleGroups: ["back", "chest", "shoulders"],
  },
  {
    code: "B",
    title: "Ноги (перёд) / руки",
    orderIndex: 1,
    muscleGroups: ["quads", "biceps", "triceps"],
  },
  {
    code: "C",
    title: "Спина / грудь / плечи — вариант 2",
    orderIndex: 2,
    muscleGroups: ["back", "chest", "shoulders"],
  },
  {
    code: "D",
    title: "Ноги (зад) / руки",
    orderIndex: 3,
    muscleGroups: ["hamstrings", "glutes", "biceps", "triceps"],
  },
];

export function splitDay(code: SplitCode): SplitDay {
  const day = SPLIT_DAYS.find((d) => d.code === code);
  if (!day) throw new Error(`Неизвестный день сплита: ${code}`);
  return day;
}

/** Последняя завершённая тренировка, или null если их ещё нет. */
export function lastCompleted(workouts: Workout[]): Workout | null {
  const done = workouts
    .filter((w) => w.status === "done")
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return done[0] ?? null;
}

/**
 * Следующий день цикла. Без истории начинаем с A.
 * Незавершённая тренировка на цикл не влияет — сдвигает его только `done`.
 */
export function nextSplitDay(workouts: Workout[]): SplitDay {
  const last = lastCompleted(workouts);
  if (!last) return SPLIT_DAYS[0];
  const current = splitDay(last.splitDayCode);
  const nextIndex = (current.orderIndex + 1) % SPLIT_DAYS.length;
  return SPLIT_DAYS[nextIndex];
}
