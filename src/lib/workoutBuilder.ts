// Подбор тренировки по двум ответам: цель + доступное время. Честно: без
// калорий/оборудования/«уровня» (мы их не трекаем) — только план упражнений из
// нашего каталога с схемой подходов/повторов под цель и объёмом под время.
// «Начать» превращает это в обычную силовую сессию (или мобилити для отдыха).

import type { IconKey } from "./icons";
import type { Exercise, MuscleGroup, Session, SessionKind } from "./types";
import { addDays, today } from "./format";
import { L } from "./i18n";

export type Goal =
  | "strength"
  | "endurance"
  | "muscle"
  | "weight_loss"
  | "recovery";

export type TimeBudget = "s30" | "m30_60" | "m60_90" | "m90p";

/** Где тренируешься — влияет на пул упражнений (зал / без инвентаря дома). */
export type Place = "gym" | "home";

export const PLACES: Array<{ place: Place; label: string; sub: string; icon: IconKey }> = [
  { place: "gym", get label() { return L("В зале", "At the gym"); }, get sub() { return L("Штанга, гантели, тренажёры", "Barbell, dumbbells, machines"); }, icon: "gym" },
  { place: "home", get label() { return L("Дома", "At home"); }, get sub() { return L("Без инвентаря, свой вес", "No equipment, bodyweight"); }, icon: "body" },
];

/** Постоянная цель-фокус из профиля (подмножество Goal без «восстановиться»). */
export type FocusGoal = "strength" | "muscle" | "endurance" | "weight_loss";

export const FOCUS_GOALS: Array<{ goal: FocusGoal; label: string; icon: IconKey; color: string }> = [
  { goal: "strength", get label() { return L("Растить силу", "Build strength"); }, icon: "gym", color: "#4ade80" },
  { goal: "muscle", get label() { return L("Набрать мышцы", "Gain muscle"); }, icon: "body", color: "#38bdf8" },
  { goal: "endurance", get label() { return L("Стать выносливее", "Get fitter"); }, icon: "run", color: "#f59e0b" },
  { goal: "weight_loss", get label() { return L("Скинуть вес", "Lose weight"); }, icon: "bolt", color: "#a78bfa" },
];

export interface PlanExercise {
  name: string;
  group: MuscleGroup;
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
  /** Последний рабочий вес этого упражнения из истории (для предзаполнения). */
  lastWeight?: number | null;
}

export interface Effect {
  label: string;
  icon: IconKey;
  color: string;
}

export interface WorkoutSuggestion {
  goal: Goal;
  time: TimeBudget;
  kind: SessionKind;
  focus: string;
  durationLabel: string;
  reason: string;
  effects: Effect[];
  exercises: PlanExercise[];
}

export const GOALS: Array<{ goal: Goal; label: string; sub: string; icon: IconKey; color: string }> = [
  { goal: "strength", get label() { return L("Развивать силу", "Build strength"); }, get sub() { return L("Увеличить силовые показатели", "Raise your strength numbers"); }, icon: "gym", color: "#4ade80" },
  { goal: "endurance", get label() { return L("Прокачать выносливость", "Boost endurance"); }, get sub() { return L("Улучшить кардио и выносливость", "Improve cardio and stamina"); }, icon: "run", color: "#f59e0b" },
  { goal: "muscle", get label() { return L("Набрать мышечную массу", "Gain muscle mass"); }, get sub() { return L("Увеличить объём мышц", "Increase muscle volume"); }, icon: "body", color: "#38bdf8" },
  { goal: "weight_loss", get label() { return L("Похудеть / сжечь жир", "Lose weight / burn fat"); }, get sub() { return L("Снизить вес и процент жира", "Cut weight and body fat"); }, icon: "bolt", color: "#a78bfa" },
  { goal: "recovery", get label() { return L("Восстановиться", "Recover"); }, get sub() { return L("Снять усталость и напряжение", "Ease fatigue and tension"); }, icon: "spa", color: "#2dd4bf" },
];

export const TIME_OPTIONS: Array<{ time: TimeBudget; label: string; sub: string }> = [
  { time: "s30", get label() { return L("До 30 минут", "Up to 30 min"); }, get sub() { return L("Короткая и эффективная", "Short and effective"); } },
  { time: "m30_60", get label() { return L("30–60 минут", "30–60 min"); }, get sub() { return L("Оптимальный вариант", "The sweet spot"); } },
  { time: "m60_90", get label() { return L("60–90 минут", "60–90 min"); }, get sub() { return L("Полноценная тренировка", "A full session"); } },
  { time: "m90p", get label() { return L("Больше 90 минут", "Over 90 min"); }, get sub() { return L("Длительная и объёмная", "Long and high-volume"); } },
];

const DURATION_LABEL: Record<TimeBudget, string> = {
  get s30() { return L("до 30 мин", "up to 30 min"); },
  get m30_60() { return L("30–60 мин", "30–60 min"); },
  get m60_90() { return L("60–90 мин", "60–90 min"); },
  get m90p() { return L("90+ мин", "90+ min"); },
};

/** Сколько упражнений влезает по времени. */
const COUNT: Record<TimeBudget, number> = { s30: 3, m30_60: 4, m60_90: 5, m90p: 6 };

const e = (name: string, group: MuscleGroup): { name: string; group: MuscleGroup } => ({ name, group });

// Пулы упражнений под цель (порядок = приоритет). Имена — из каталога.
const POOLS: Record<Exclude<Goal, "recovery">, Array<{ name: string; group: MuscleGroup }>> = {
  strength: [
    e("Приседания со штангой", "legs"),
    e("Жим штанги лёжа", "chest"),
    e("Тяга штанги в наклоне", "back"),
    e("Жим штанги стоя", "shoulders"),
    e("Становая тяга", "legs"),
    e("Подтягивания прямым хватом", "back"),
  ],
  muscle: [
    e("Приседания со штангой", "legs"),
    e("Жим штанги лёжа", "chest"),
    e("Тяга верхнего блока к груди", "back"),
    e("Жим гантелей на наклонной скамье", "chest"),
    e("Подъём штанги на бицепс", "arms"),
    e("Разгибание рук на блоке", "arms"),
  ],
  endurance: [
    e("Приседания со штангой", "legs"),
    e("Жим гантелей на наклонной скамье", "chest"),
    e("Тяга горизонтального блока", "back"),
    e("Жим гантелей стоя", "shoulders"),
    e("Планка", "core"),
    e("Выпады с гантелями", "legs"),
  ],
  weight_loss: [
    e("Приседания со штангой", "legs"),
    e("Тяга гантели одной рукой в наклоне", "back"),
    e("Жим гантелей на наклонной скамье", "chest"),
    e("Выпады с гантелями", "legs"),
    e("Планка", "core"),
    e("Махи гантелями в стороны", "shoulders"),
  ],
};

const SCHEME: Record<Exclude<Goal, "recovery">, { sets: number; repMin: number; repMax: number; restSec: number }> = {
  strength: { sets: 4, repMin: 4, repMax: 6, restSec: 150 },
  muscle: { sets: 4, repMin: 8, repMax: 12, restSec: 75 },
  endurance: { sets: 3, repMin: 15, repMax: 20, restSec: 40 },
  weight_loss: { sets: 3, repMin: 12, repMax: 15, restSec: 30 },
};

// Дома — без инвентаря, со своим весом. Пул один на все цели, схема повторов
// подстраивается под цель ниже.
const HOME_POOL: Array<{ name: string; group: MuscleGroup }> = [
  e("Отжимания от пола", "chest"),
  e("Приседания без веса", "legs"),
  e("Выпады без веса", "legs"),
  e("Австралийские подтягивания", "back"),
  e("Отжимания с узкой постановкой рук", "arms"),
  e("Ягодичный мостик", "glutes"),
  e("Планка", "core"),
  e("Скручивания", "core"),
];

// Для цели «выносливость/жиросжигание» дома добавляем берпи в начало.
const HOME_CARDIO: { name: string; group: MuscleGroup } = e("Берпи", "other");

const HOME_SCHEME: Record<Exclude<Goal, "recovery">, { repMin: number; repMax: number; restSec: number }> = {
  strength: { repMin: 8, repMax: 12, restSec: 90 },
  muscle: { repMin: 12, repMax: 15, restSec: 60 },
  endurance: { repMin: 15, repMax: 20, restSec: 40 },
  weight_loss: { repMin: 15, repMax: 20, restSec: 30 },
};

const FOCUS: Record<Goal, string> = {
  get strength() { return L("Сила", "Strength"); },
  get endurance() { return L("Выносливость", "Endurance"); },
  get muscle() { return L("Гипертрофия", "Hypertrophy"); },
  get weight_loss() { return L("Жиросжигание", "Fat loss"); },
  get recovery() { return L("Восстановление", "Recovery"); },
};

const REASON: Record<Goal, string> = {
  get strength() { return L("Базовые движения с тяжёлыми подходами — то, что растит силу.", "Compound lifts with heavy sets — what builds strength."); },
  get endurance() { return L("Круговой формат с короткими паузами держит пульс и качает выносливость.", "Circuit format with short rests keeps the heart rate up and builds stamina."); },
  get muscle() { return L("Сочетание базы и изоляции с рабочим числом повторов — под рост мышц.", "Compound and isolation work at hypertrophy reps — built for muscle growth."); },
  get weight_loss() { return L("Много повторов и короткий отдых — высокий расход за тренировку.", "High reps and short rest — big energy burn per session."); },
  get recovery() { return L("Лёгкая мобилити и растяжка, чтобы снять напряжение и восстановиться.", "Light mobility and stretching to ease tension and recover."); },
};

const EFFECT: Record<string, Effect> = {
  strength: { get label() { return L("Силу", "Strength"); }, icon: "gym", color: "#4ade80" },
  endurance: { get label() { return L("Выносливость", "Endurance"); }, icon: "run", color: "#f59e0b" },
  muscle: { get label() { return L("Мышцы", "Muscle"); }, icon: "body", color: "#38bdf8" },
  recovery: { get label() { return L("Восстановление", "Recovery"); }, icon: "spa", color: "#2dd4bf" },
};

const EFFECTS: Record<Goal, Effect[]> = {
  strength: [EFFECT.strength, EFFECT.muscle],
  endurance: [EFFECT.endurance],
  muscle: [EFFECT.muscle, EFFECT.strength],
  weight_loss: [EFFECT.endurance],
  recovery: [EFFECT.recovery],
};

/** Контекст истории для умного подбора. */
export interface BuilderContext {
  /** Упражнения последней силовой — их не повторяем. */
  avoidNames: Set<string>;
  /** Группы мышц, тренированные за последние 2 дня (не восстановились). */
  tiredGroups: Set<MuscleGroup>;
  /** Имя упражнения → последний рабочий вес (для предзаполнения). */
  lastWeight: Map<string, number>;
}

export function buildContext(
  sessions: Session[],
  exercises: Exercise[],
  asOf: string = today(),
): BuilderContext {
  const nameOf = new Map(exercises.map((e) => [e.id, e.name] as const));
  const groupOf = new Map(exercises.map((e) => [e.id, e.muscleGroup] as const));
  const strengthDesc = sessions
    .filter((s) => s.kind === "strength" && s.date <= asOf)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const avoidNames = new Set<string>();
  const last = strengthDesc[0];
  if (last) {
    for (const ex of last.exercises) {
      const n = nameOf.get(ex.exerciseId);
      if (n) avoidNames.add(n.toLowerCase());
    }
  }

  const from = addDays(asOf, -2);
  const tiredGroups = new Set<MuscleGroup>();
  for (const s of sessions) {
    if (s.kind !== "strength" || s.date < from || s.date > asOf) continue;
    for (const ex of s.exercises) {
      const g = groupOf.get(ex.exerciseId);
      if (g) tiredGroups.add(g);
    }
  }

  const lastWeight = new Map<string, number>();
  for (const s of strengthDesc) {
    for (const ex of s.exercises) {
      const n = nameOf.get(ex.exerciseId);
      if (!n) continue;
      const key = n.toLowerCase();
      if (lastWeight.has(key)) continue;
      const w = Math.max(0, ...ex.sets.map((st) => st.weight ?? 0));
      if (w > 0) lastWeight.set(key, w);
    }
  }

  return { avoidNames, tiredGroups, lastWeight };
}

/**
 * Собрать предложение тренировки по цели и времени. С контекстом истории:
 * не повторяем упражнения прошлой силовой, отдохнувшие группы мышц — вперёд,
 * последний рабочий вес подставляется в план.
 */
export function buildSuggestion(
  goal: Goal,
  time: TimeBudget,
  place: Place = "gym",
  ctx?: BuilderContext,
): WorkoutSuggestion {
  const home = place === "home";
  const base = {
    goal,
    time,
    focus: FOCUS[goal],
    durationLabel: DURATION_LABEL[time],
    reason: home
      ? L("Тренировка со своим весом — без инвентаря, дома или в поездке.", "Bodyweight workout — no equipment, at home or on the road.")
      : REASON[goal],
    effects: EFFECTS[goal],
  };

  if (goal === "recovery") {
    return { ...base, kind: "mobility", exercises: [] };
  }

  const count = COUNT[time];
  const sets = time === "s30" ? Math.max(2, SCHEME[goal].sets - 1) : SCHEME[goal].sets;

  // Схема повторов/отдыха и подстановка веса зависят от места.
  const repMin = home ? HOME_SCHEME[goal].repMin : SCHEME[goal].repMin;
  const repMax = home ? HOME_SCHEME[goal].repMax : SCHEME[goal].repMax;
  const restSec = home ? HOME_SCHEME[goal].restSec : SCHEME[goal].restSec;

  let pool = home
    ? goal === "endurance" || goal === "weight_loss"
      ? [HOME_CARDIO, ...HOME_POOL]
      : HOME_POOL
    : POOLS[goal];

  if (ctx) {
    const noRepeat = pool.filter((ex) => !ctx.avoidNames.has(ex.name.toLowerCase()));
    if (noRepeat.length >= count) pool = noRepeat;
    pool = [...pool].sort(
      (a, b) => (ctx.tiredGroups.has(a.group) ? 1 : 0) - (ctx.tiredGroups.has(b.group) ? 1 : 0),
    );
  }

  const exercises: PlanExercise[] = pool.slice(0, count).map((ex) => ({
    name: ex.name,
    group: ex.group,
    sets,
    repMin,
    repMax,
    restSec,
    // Дома всё со своим весом — прошлые штанговые веса не подставляем.
    lastWeight: home ? null : (ctx?.lastWeight.get(ex.name.toLowerCase()) ?? null),
  }));

  return { ...base, kind: "strength", exercises };
}
