// Готовые программы для «Библиотеки». Хранятся по НАЗВАНИЯМ упражнений (id у
// каталога нет — он появляется при первом выборе). При добавлении в «мои»
// упражнения находятся по имени или создаются (см. store.buildProgramFromPreset).
// Имена упражнений — русские ключи каталога, НЕ переводим (резолвятся в каталог).
// Отображаемые строки (название/подзаголовок/описание/названия дней) — L-геттеры.

import type { MuscleGroup } from "./types";
import { L } from "./i18n";

export interface PresetExercise {
  name: string;
  group: MuscleGroup;
  sets: number;
  repMin: number;
  repMax: number;
}

export interface PresetWorkout {
  name: string;
  exercises: PresetExercise[];
}

export interface ProgramPreset {
  key: string;
  name: string;
  /** Короткий подзаголовок для карточки: «3 дня · для массы». */
  subtitle: string;
  description: string;
  workouts: PresetWorkout[];
}

const e = (
  name: string,
  group: MuscleGroup,
  sets = 3,
  repMin = 8,
  repMax = 12,
): PresetExercise => ({ name, group, sets, repMin, repMax });

export const PROGRAM_PRESETS: ProgramPreset[] = [
  {
    key: "fullbody",
    get name() { return L("Фуллбоди 3×", "Full Body 3×"); },
    get subtitle() { return L("3 дня · всё тело", "3 days · full body"); },
    get description() {
      return L(
        "Три тренировки на всё тело в неделю. Отлично для старта и для тех, кто ходит в зал 2–3 раза: каждая мышца получает нагрузку часто, восстановление между днями — сутки и больше.",
        "Three full-body workouts a week. Great for beginners and anyone training 2–3 times: every muscle is hit often, with a day or more of recovery between sessions.",
      );
    },
    workouts: [
      {
        get name() { return L("Фуллбоди A", "Full Body A"); },
        exercises: [
          e("Приседания со штангой", "legs", 4, 6, 10),
          e("Жим штанги лёжа", "chest", 4, 6, 10),
          e("Тяга штанги в наклоне", "back", 4, 8, 12),
          e("Жим гантелей сидя", "shoulders"),
          e("Скручивания", "core", 3, 12, 20),
        ],
      },
      {
        get name() { return L("Фуллбоди B", "Full Body B"); },
        exercises: [
          e("Румынская тяга", "legs", 4, 8, 12),
          e("Подтягивания прямым хватом", "back", 4, 6, 10),
          e("Жим гантелей на наклонной скамье", "chest"),
          e("Махи гантелями в стороны", "shoulders", 3, 12, 15),
          e("Планка", "core", 3, 30, 60),
        ],
      },
      {
        get name() { return L("Фуллбоди C", "Full Body C"); },
        exercises: [
          e("Жим ногами", "legs", 4, 10, 15),
          e("Тяга верхнего блока к груди", "back"),
          e("Жим штанги на наклонной скамье", "chest", 4, 6, 10),
          e("Подъём штанги на бицепс", "arms", 3, 10, 12),
          e("Разгибание рук на блоке", "arms", 3, 10, 12),
        ],
      },
    ],
  },
  {
    key: "upper_lower",
    get name() { return L("Верх / Низ", "Upper / Lower"); },
    get subtitle() { return L("4 дня · сила и масса", "4 days · strength & size"); },
    get description() {
      return L(
        "Классический сплит верх/низ на 4 дня. Верхняя и нижняя половина тела чередуются, каждая тренируется дважды в неделю — хороший баланс объёма и восстановления для набора массы и силы.",
        "A classic 4-day upper/lower split. Upper and lower body alternate, each trained twice a week — a good balance of volume and recovery for building size and strength.",
      );
    },
    workouts: [
      {
        get name() { return L("Верх A", "Upper A"); },
        exercises: [
          e("Жим штанги лёжа", "chest", 4, 6, 10),
          e("Тяга штанги в наклоне", "back", 4, 8, 12),
          e("Жим штанги стоя", "shoulders", 3, 8, 10),
          e("Подтягивания прямым хватом", "back", 3, 6, 10),
          e("Подъём штанги на бицепс", "arms", 3, 10, 12),
        ],
      },
      {
        get name() { return L("Низ A", "Lower A"); },
        exercises: [
          e("Приседания со штангой", "legs", 4, 6, 10),
          e("Румынская тяга", "legs", 3, 8, 12),
          e("Жим ногами", "legs", 3, 10, 15),
          e("Сгибание ног в тренажёре", "legs", 3, 10, 15),
          e("Подъёмы на носки стоя", "legs", 4, 12, 20),
        ],
      },
      {
        get name() { return L("Верх B", "Upper B"); },
        exercises: [
          e("Жим гантелей на наклонной скамье", "chest", 4, 8, 12),
          e("Тяга горизонтального блока", "back", 4, 10, 12),
          e("Махи гантелями в стороны", "shoulders", 4, 12, 15),
          e("Жим гантелей сидя", "shoulders"),
          e("Разгибание рук на блоке", "arms", 3, 10, 12),
        ],
      },
      {
        get name() { return L("Низ B", "Lower B"); },
        exercises: [
          e("Становая тяга", "legs", 4, 5, 8),
          e("Разгибание ног в тренажёре", "legs", 3, 12, 15),
          e("Выпады с гантелями", "legs", 3, 10, 12),
          e("Гиперэкстензия", "back", 3, 12, 15),
          e("Подъём ног в висе", "core", 3, 10, 15),
        ],
      },
    ],
  },
  {
    key: "ppl",
    name: "Push / Pull / Legs",
    get subtitle() { return L("3 дня · жим / тяга / ноги", "3 days · push / pull / legs"); },
    get description() {
      return L(
        "Push (жимовые: грудь, плечи, трицепс), Pull (тяговые: спина, бицепс), Legs (ноги). Мышцы группируются по движению — удобно набирать объём и легко масштабировать до 6 дней в неделю.",
        "Push (chest, shoulders, triceps), Pull (back, biceps), Legs. Muscles are grouped by movement — easy to add volume and scale up to 6 days a week.",
      );
    },
    workouts: [
      {
        get name() { return L("Push (жим)", "Push"); },
        exercises: [
          e("Жим штанги лёжа", "chest", 4, 6, 10),
          e("Жим гантелей на наклонной скамье", "chest", 3, 8, 12),
          e("Жим штанги стоя", "shoulders", 3, 8, 10),
          e("Махи гантелями в стороны", "shoulders", 3, 12, 15),
          e("Разгибание рук на блоке", "arms", 3, 10, 12),
        ],
      },
      {
        get name() { return L("Pull (тяга)", "Pull"); },
        exercises: [
          e("Подтягивания прямым хватом", "back", 4, 6, 10),
          e("Тяга штанги в наклоне", "back", 4, 8, 12),
          e("Тяга верхнего блока к груди", "back", 3, 10, 12),
          e("Тяга к лицу с верхнего блока", "back", 3, 12, 15),
          e("Подъём штанги на бицепс", "arms", 3, 10, 12),
        ],
      },
      {
        get name() { return L("Legs (ноги)", "Legs"); },
        exercises: [
          e("Приседания со штангой", "legs", 4, 6, 10),
          e("Румынская тяга", "legs", 3, 8, 12),
          e("Жим ногами", "legs", 3, 10, 15),
          e("Сгибание ног в тренажёре", "legs", 3, 10, 15),
          e("Подъёмы на носки стоя", "legs", 4, 12, 20),
        ],
      },
    ],
  },
  {
    key: "split_abcd",
    get name() { return L("Сплит A/B/C/D", "Split A/B/C/D"); },
    get subtitle() { return L("4 дня · по группам мышц", "4 days · by muscle group"); },
    get description() {
      return L(
        "Четырёхдневный сплит по группам мышц: грудь+трицепс, спина+бицепс, ноги, плечи. Много объёма на каждую группу за тренировку — вариант для опытных, кто восстанавливается за неделю.",
        "A 4-day split by muscle group: chest+triceps, back+biceps, legs, shoulders. Lots of volume per group per session — best for advanced lifters who recover over a week.",
      );
    },
    workouts: [
      {
        get name() { return L("A · Грудь + трицепс", "A · Chest + triceps"); },
        exercises: [
          e("Жим штанги лёжа", "chest", 4, 6, 10),
          e("Жим гантелей на наклонной скамье", "chest", 3, 8, 12),
          e("Сведение рук в кроссовере", "chest", 3, 12, 15),
          e("Отжимания на брусьях", "chest", 3, 8, 12),
          e("Разгибание рук на блоке", "arms", 3, 10, 12),
        ],
      },
      {
        get name() { return L("B · Спина + бицепс", "B · Back + biceps"); },
        exercises: [
          e("Подтягивания прямым хватом", "back", 4, 6, 10),
          e("Тяга штанги в наклоне", "back", 4, 8, 12),
          e("Тяга горизонтального блока", "back", 3, 10, 12),
          e("Подъём штанги на бицепс", "arms", 3, 10, 12),
          e("Молотки с гантелями", "arms", 3, 10, 12),
        ],
      },
      {
        get name() { return L("C · Ноги", "C · Legs"); },
        exercises: [
          e("Приседания со штангой", "legs", 4, 6, 10),
          e("Румынская тяга", "legs", 3, 8, 12),
          e("Жим ногами", "legs", 3, 10, 15),
          e("Разгибание ног в тренажёре", "legs", 3, 12, 15),
          e("Подъёмы на носки стоя", "legs", 4, 12, 20),
        ],
      },
      {
        get name() { return L("D · Плечи", "D · Shoulders"); },
        exercises: [
          e("Жим штанги стоя", "shoulders", 4, 6, 10),
          e("Жим гантелей сидя", "shoulders", 3, 8, 12),
          e("Махи гантелями в стороны", "shoulders", 4, 12, 15),
          e("Тяга к лицу с верхнего блока", "shoulders", 3, 12, 15),
          e("Шраги с гантелями", "shoulders", 3, 12, 15),
        ],
      },
    ],
  },
  {
    key: "circuit",
    get name() { return L("Круговая", "Circuit"); },
    get subtitle() { return L("1 день · всё тело по кругу", "1 day · full-body circuit"); },
    get description() {
      return L(
        "Одна круговая тренировка на всё тело: упражнения идут подряд с коротким отдыхом, много повторов. Хорошо для выносливости, жиросжигания и занятых дней, когда времени мало.",
        "A single full-body circuit: exercises back-to-back with short rest and high reps. Good for endurance, fat loss, and busy days when time is short.",
      );
    },
    workouts: [
      {
        get name() { return L("Круг", "Circuit"); },
        exercises: [
          e("Приседания со штангой", "legs", 3, 12, 15),
          e("Жим гантелей на наклонной скамье", "chest", 3, 12, 15),
          e("Тяга гантели одной рукой в наклоне", "back", 3, 12, 15),
          e("Жим гантелей стоя", "shoulders", 3, 12, 15),
          e("Планка", "core", 3, 30, 45),
        ],
      },
    ],
  },
];

export function findPreset(key: string): ProgramPreset | undefined {
  return PROGRAM_PRESETS.find((p) => p.key === key);
}
