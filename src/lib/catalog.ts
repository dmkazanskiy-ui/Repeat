import type { MuscleGroup } from "./types";
import { L, getLang } from "./i18n";

export const MUSCLE_GROUPS: MuscleGroup[] = [
  "chest",
  "back",
  "shoulders",
  "legs",
  "glutes",
  "arms",
  "core",
  "other",
];

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  get chest() { return L("Грудь", "Chest"); },
  get back() { return L("Спина", "Back"); },
  get shoulders() { return L("Плечи", "Shoulders"); },
  get legs() { return L("Ноги", "Legs"); },
  get glutes() { return L("Ягодицы", "Glutes"); },
  get arms() { return L("Руки", "Arms"); },
  get core() { return L("Пресс и кор", "Core"); },
  get other() { return L("Другое", "Other"); },
};

/**
 * Базовый справочник популярных упражнений. Формат «Название|группа»,
 * чтобы список читался и правился глазами, а не через редактор объектов.
 * Свои упражнения пользователь добавляет поверх, они живут в хранилище.
 */
const RAW = `
Жим штанги лёжа|chest
Жим штанги лёжа узким хватом|chest
Жим штанги на наклонной скамье|chest
Жим штанги на скамье с обратным наклоном|chest
Жим гантелей лёжа|chest
Жим гантелей на наклонной скамье|chest
Жим гантелей на скамье с обратным наклоном|chest
Жим в тренажёре сидя|chest
Жим в тренажёре Смита|chest
Хаммер-жим|chest
Разведение гантелей лёжа|chest
Разведение гантелей на наклонной скамье|chest
Разведение в тренажёре (бабочка)|chest
Сведение рук в кроссовере|chest
Сведение рук в кроссовере снизу|chest
Сведение рук в кроссовере сверху|chest
Пуловер с гантелью|chest
Пуловер в тренажёре|chest
Отжимания от пола|chest
Отжимания с широкой постановкой рук|chest
Отжимания с узкой постановкой рук|chest
Отжимания с ногами на возвышении|chest
Отжимания на брусьях|chest
Отжимания на кольцах|chest
Отжимания с отягощением|chest
Плиометрические отжимания|chest
Жим гири лёжа|chest
Жим с резиной стоя|chest
Кроссовер одной рукой|chest
Сведение в тренажёре сидя|chest
Подтягивания прямым хватом|back
Подтягивания обратным хватом|back
Подтягивания широким хватом|back
Подтягивания нейтральным хватом|back
Подтягивания с отягощением|back
Подтягивания в гравитроне|back
Тяга верхнего блока к груди|back
Тяга верхнего блока за голову|back
Тяга верхнего блока обратным хватом|back
Тяга верхнего блока узким хватом|back
Тяга верхнего блока одной рукой|back
Тяга горизонтального блока|back
Тяга горизонтального блока широким хватом|back
Тяга штанги в наклоне|back
Тяга штанги в наклоне обратным хватом|back
Тяга Т-грифа|back
Тяга гантели одной рукой в наклоне|back
Тяга двух гантелей в наклоне|back
Тяга в тренажёре сидя|back
Хаммер-тяга|back
Становая тяга|back
Становая тяга сумо|back
Румынская тяга|back
Становая тяга с гантелями|back
Становая тяга рывковым хватом|back
Шраги со штангой|back
Шраги с гантелями|back
Шраги в тренажёре|back
Гиперэкстензия|back
Обратная гиперэкстензия|back
Наклоны со штангой (гуд морнинг)|back
Тяга к лицу с верхнего блока|back
Пулловер с верхнего блока|back
Австралийские подтягивания|back
Тяга штанги лёжа на скамье|back
Жим штанги стоя|shoulders
Жим штанги сидя|shoulders
Жим штанги из-за головы|shoulders
Жим гантелей сидя|shoulders
Жим гантелей стоя|shoulders
Жим Арнольда|shoulders
Жим в тренажёре на плечи|shoulders
Жим в Смите на плечи|shoulders
Швунг жимовой|shoulders
Махи гантелями в стороны|shoulders
Махи гантелями в стороны сидя|shoulders
Махи в кроссовере в сторону|shoulders
Махи в тренажёре в стороны|shoulders
Махи гантелями перед собой|shoulders
Подъём блина перед собой|shoulders
Тяга штанги к подбородку|shoulders
Тяга гантелей к подбородку|shoulders
Разведение гантелей в наклоне|shoulders
Обратная бабочка в тренажёре|shoulders
Тяга каната к лицу|shoulders
Отведение руки в кроссовере|shoulders
Подъём гантелей в стороны лёжа на боку|shoulders
Жим гири одной рукой|shoulders
Прогулка фермера над головой|shoulders
Стойка на руках у стены|shoulders
Приседания со штангой на спине|legs
Приседания со штангой на груди|legs
Приседания в Смите|legs
Приседания с гантелями|legs
Приседания гоблет|legs
Приседания сумо|legs
Приседания на одной ноге (пистолет)|legs
Болгарские выпады|legs
Выпады со штангой|legs
Выпады с гантелями|legs
Выпады назад|legs
Выпады в ходьбе|legs
Боковые выпады|legs
Жим ногами|legs
Жим ногами узкой постановкой|legs
Жим одной ногой|legs
Гакк-приседания|legs
Разгибания ног в тренажёре|legs
Сгибания ног лёжа|legs
Сгибания ног сидя|legs
Сгибания ног стоя|legs
Румынская тяга с гантелями|legs
Наклоны с гантелями на прямых ногах|legs
Зашагивания на тумбу|legs
Подъёмы на носки стоя|legs
Подъёмы на носки сидя|legs
Подъёмы на носки в жиме ногами|legs
Приседания у стены|legs
Сисси-приседания|legs
Нордические сгибания|legs
Приседания с прыжком|legs
Прыжки на тумбу|legs
Салазки (толкание саней)|legs
Разведение ног в тренажёре|legs
Сведение ног в тренажёре|legs
Присед со штангой над головой|legs
Прогулка выпадами с гирями|legs
Тяга на прямых ногах в Смите|legs
Степ-ап с гантелями|legs
Изометрический присед|legs
Ягодичный мост со штангой|glutes
Ягодичный мост с гантелью|glutes
Ягодичный мост на одной ноге|glutes
Ягодичный мостик в тренажёре|glutes
Отведение ноги назад в кроссовере|glutes
Отведение ноги назад в тренажёре|glutes
Отведение ноги в сторону в кроссовере|glutes
Махи ногой назад в упоре|glutes
Разведение ног с резиной сидя|glutes
Ходьба с резиной в стороны|glutes
Обратная гиперэкстензия на ягодицы|glutes
Тяга в наклоне на одной ноге|glutes
Подъём таза на скамье|glutes
Реверанс-выпады|glutes
Ягодичная тяга в кроссовере|glutes
Подъём штанги на бицепс|arms
Подъём штанги на бицепс обратным хватом|arms
Подъём EZ-штанги на бицепс|arms
Подъём гантелей на бицепс|arms
Подъём гантелей на бицепс сидя|arms
Подъём гантелей с супинацией|arms
Молотковые сгибания|arms
Молотки на скамье Скотта|arms
Сгибания на скамье Скотта|arms
Сгибания на бицепс в кроссовере|arms
Сгибания на бицепс в тренажёре|arms
Концентрированные сгибания|arms
Сгибания на бицепс лёжа на наклонной|arms
Паучьи сгибания|arms
Сгибания с резиной|arms
Французский жим лёжа|arms
Французский жим сидя|arms
Французский жим с гантелью|arms
Разгибания на трицепс в блоке|arms
Разгибания на трицепс с канатом|arms
Разгибания на трицепс обратным хватом|arms
Разгибания из-за головы в блоке|arms
Разгибания одной рукой в блоке|arms
Отжимания на брусьях на трицепс|arms
Обратные отжимания от скамьи|arms
Жим лёжа узким хватом на трицепс|arms
Кикбэк с гантелью|arms
Разгибания в тренажёре на трицепс|arms
Отжимания алмазные|arms
Сгибания запястий со штангой|arms
Разгибания запястий со штангой|arms
Прогулка фермера|arms
Вис на перекладине на время|arms
Сжимание эспандера|arms
Подъём штанги на бицепс в Смите|arms
Скручивания на полу|core
Скручивания на наклонной скамье|core
Скручивания в тренажёре|core
Скручивания на верхнем блоке (молитва)|core
Обратные скручивания|core
Подъём ног в висе|core
Подъём коленей в висе|core
Подъём ног лёжа|core
Подъём ног на брусьях|core
Планка|core
Боковая планка|core
Планка с подтягиванием колен|core
Планка на локтях с отягощением|core
Русские скручивания|core
Велосипед|core
Мёртвый жук|core
Ролик для пресса|core
Колесо для пресса стоя|core
Дровосек в кроссовере|core
Наклоны в сторону с гантелью|core
Вакуум живота|core
Птица-собака|core
Скручивания с мячом|core
V-складка|core
Подъём корпуса с блином|core
Пола-пресс с гирей|core
Гребля на тренажёре|other
Берпи|other
Прыжки на скакалке|other
Трастеры со штангой|other
Махи гирей|other
Рывок гири|other
Толчок штанги|other
Рывок штанги|other
Взятие на грудь|other
Медбол в стену|other
`;

/** RU→EN названия упражнений (для показа; .name остаётся каноничным RU — по нему матчит классификатор мышц). */
const NAME_EN: Record<string, string> = {
  "Жим штанги лёжа": "Barbell bench press",
  "Жим штанги лёжа узким хватом": "Close-grip bench press",
  "Жим штанги на наклонной скамье": "Incline barbell press",
  "Жим штанги на скамье с обратным наклоном": "Decline barbell press",
  "Жим гантелей лёжа": "Dumbbell bench press",
  "Жим гантелей на наклонной скамье": "Incline dumbbell press",
  "Жим гантелей на скамье с обратным наклоном": "Decline dumbbell press",
  "Жим в тренажёре сидя": "Seated chest press (machine)",
  "Жим в тренажёре Смита": "Smith machine press",
  "Хаммер-жим": "Hammer press",
  "Разведение гантелей лёжа": "Dumbbell fly",
  "Разведение гантелей на наклонной скамье": "Incline dumbbell fly",
  "Разведение в тренажёре (бабочка)": "Pec deck fly",
  "Сведение рук в кроссовере": "Cable crossover",
  "Сведение рук в кроссовере снизу": "Low cable crossover",
  "Сведение рук в кроссовере сверху": "High cable crossover",
  "Пуловер с гантелью": "Dumbbell pullover",
  "Пуловер в тренажёре": "Machine pullover",
  "Отжимания от пола": "Push-up",
  "Отжимания с широкой постановкой рук": "Wide push-up",
  "Отжимания с узкой постановкой рук": "Close push-up",
  "Отжимания с ногами на возвышении": "Feet-elevated push-up",
  "Отжимания на брусьях": "Chest dip",
  "Отжимания на кольцах": "Ring dip",
  "Отжимания с отягощением": "Weighted push-up",
  "Плиометрические отжимания": "Plyometric push-up",
  "Жим гири лёжа": "Kettlebell floor press",
  "Жим с резиной стоя": "Standing band press",
  "Кроссовер одной рукой": "Single-arm crossover",
  "Сведение в тренажёре сидя": "Seated machine fly",
  "Подтягивания прямым хватом": "Pull-up (overhand)",
  "Подтягивания обратным хватом": "Chin-up",
  "Подтягивания широким хватом": "Wide-grip pull-up",
  "Подтягивания нейтральным хватом": "Neutral-grip pull-up",
  "Подтягивания с отягощением": "Weighted pull-up",
  "Подтягивания в гравитроне": "Assisted pull-up",
  "Тяга верхнего блока к груди": "Lat pulldown",
  "Тяга верхнего блока за голову": "Behind-neck pulldown",
  "Тяга верхнего блока обратным хватом": "Reverse-grip pulldown",
  "Тяга верхнего блока узким хватом": "Close-grip pulldown",
  "Тяга верхнего блока одной рукой": "Single-arm pulldown",
  "Тяга горизонтального блока": "Seated cable row",
  "Тяга горизонтального блока широким хватом": "Wide-grip cable row",
  "Тяга штанги в наклоне": "Bent-over barbell row",
  "Тяга штанги в наклоне обратным хватом": "Reverse-grip barbell row",
  "Тяга Т-грифа": "T-bar row",
  "Тяга гантели одной рукой в наклоне": "Single-arm dumbbell row",
  "Тяга двух гантелей в наклоне": "Two-dumbbell row",
  "Тяга в тренажёре сидя": "Seated machine row",
  "Хаммер-тяга": "Hammer row",
  "Становая тяга": "Deadlift",
  "Становая тяга сумо": "Sumo deadlift",
  "Румынская тяга": "Romanian deadlift",
  "Становая тяга с гантелями": "Dumbbell deadlift",
  "Становая тяга рывковым хватом": "Snatch-grip deadlift",
  "Шраги со штангой": "Barbell shrug",
  "Шраги с гантелями": "Dumbbell shrug",
  "Шраги в тренажёре": "Machine shrug",
  "Гиперэкстензия": "Back extension",
  "Обратная гиперэкстензия": "Reverse hyperextension",
  "Наклоны со штангой (гуд морнинг)": "Good morning",
  "Тяга к лицу с верхнего блока": "Face pull",
  "Пулловер с верхнего блока": "Cable pullover",
  "Австралийские подтягивания": "Inverted row",
  "Тяга штанги лёжа на скамье": "Chest-supported row",
  "Жим штанги стоя": "Standing barbell press",
  "Жим штанги сидя": "Seated barbell press",
  "Жим штанги из-за головы": "Behind-neck press",
  "Жим гантелей сидя": "Seated dumbbell press",
  "Жим гантелей стоя": "Standing dumbbell press",
  "Жим Арнольда": "Arnold press",
  "Жим в тренажёре на плечи": "Machine shoulder press",
  "Жим в Смите на плечи": "Smith shoulder press",
  "Швунг жимовой": "Push press",
  "Махи гантелями в стороны": "Lateral raise",
  "Махи гантелями в стороны сидя": "Seated lateral raise",
  "Махи в кроссовере в сторону": "Cable lateral raise",
  "Махи в тренажёре в стороны": "Machine lateral raise",
  "Махи гантелями перед собой": "Front raise",
  "Подъём блина перед собой": "Plate front raise",
  "Тяга штанги к подбородку": "Barbell upright row",
  "Тяга гантелей к подбородку": "Dumbbell upright row",
  "Разведение гантелей в наклоне": "Bent-over reverse fly",
  "Обратная бабочка в тренажёре": "Reverse pec deck",
  "Тяга каната к лицу": "Rope face pull",
  "Отведение руки в кроссовере": "Cable rear delt raise",
  "Подъём гантелей в стороны лёжа на боку": "Lying side raise",
  "Жим гири одной рукой": "Single-arm kettlebell press",
  "Прогулка фермера над головой": "Overhead carry",
  "Стойка на руках у стены": "Wall handstand",
  "Приседания со штангой на спине": "Back squat",
  "Приседания со штангой на груди": "Front squat",
  "Приседания в Смите": "Smith squat",
  "Приседания с гантелями": "Dumbbell squat",
  "Приседания гоблет": "Goblet squat",
  "Приседания сумо": "Sumo squat",
  "Приседания на одной ноге (пистолет)": "Pistol squat",
  "Болгарские выпады": "Bulgarian split squat",
  "Выпады со штангой": "Barbell lunge",
  "Выпады с гантелями": "Dumbbell lunge",
  "Выпады назад": "Reverse lunge",
  "Выпады в ходьбе": "Walking lunge",
  "Боковые выпады": "Lateral lunge",
  "Жим ногами": "Leg press",
  "Жим ногами узкой постановкой": "Close-stance leg press",
  "Жим одной ногой": "Single-leg press",
  "Гакк-приседания": "Hack squat",
  "Разгибания ног в тренажёре": "Leg extension",
  "Сгибания ног лёжа": "Lying leg curl",
  "Сгибания ног сидя": "Seated leg curl",
  "Сгибания ног стоя": "Standing leg curl",
  "Румынская тяга с гантелями": "Dumbbell Romanian deadlift",
  "Наклоны с гантелями на прямых ногах": "Stiff-leg dumbbell deadlift",
  "Зашагивания на тумбу": "Box step-up",
  "Подъёмы на носки стоя": "Standing calf raise",
  "Подъёмы на носки сидя": "Seated calf raise",
  "Подъёмы на носки в жиме ногами": "Leg-press calf raise",
  "Приседания у стены": "Wall sit",
  "Сисси-приседания": "Sissy squat",
  "Нордические сгибания": "Nordic curl",
  "Приседания с прыжком": "Jump squat",
  "Прыжки на тумбу": "Box jump",
  "Салазки (толкание саней)": "Sled push",
  "Разведение ног в тренажёре": "Hip abduction machine",
  "Сведение ног в тренажёре": "Hip adduction machine",
  "Присед со штангой над головой": "Overhead squat",
  "Прогулка выпадами с гирями": "Kettlebell lunge walk",
  "Тяга на прямых ногах в Смите": "Smith stiff-leg deadlift",
  "Степ-ап с гантелями": "Dumbbell step-up",
  "Изометрический присед": "Isometric squat",
  "Ягодичный мост со штангой": "Barbell hip thrust",
  "Ягодичный мост с гантелью": "Dumbbell hip thrust",
  "Ягодичный мост на одной ноге": "Single-leg hip thrust",
  "Ягодичный мостик в тренажёре": "Machine hip thrust",
  "Отведение ноги назад в кроссовере": "Cable glute kickback",
  "Отведение ноги назад в тренажёре": "Machine glute kickback",
  "Отведение ноги в сторону в кроссовере": "Cable hip abduction",
  "Махи ногой назад в упоре": "Quadruped kickback",
  "Разведение ног с резиной сидя": "Seated band abduction",
  "Ходьба с резиной в стороны": "Banded lateral walk",
  "Обратная гиперэкстензия на ягодицы": "Reverse hyper (glutes)",
  "Тяга в наклоне на одной ноге": "Single-leg RDL",
  "Подъём таза на скамье": "Bench hip raise",
  "Реверанс-выпады": "Curtsy lunge",
  "Ягодичная тяга в кроссовере": "Cable pull-through",
  "Подъём штанги на бицепс": "Barbell curl",
  "Подъём штанги на бицепс обратным хватом": "Reverse barbell curl",
  "Подъём EZ-штанги на бицепс": "EZ-bar curl",
  "Подъём гантелей на бицепс": "Dumbbell curl",
  "Подъём гантелей на бицепс сидя": "Seated dumbbell curl",
  "Подъём гантелей с супинацией": "Supinating curl",
  "Молотковые сгибания": "Hammer curl",
  "Молотки на скамье Скотта": "Preacher hammer curl",
  "Сгибания на скамье Скотта": "Preacher curl",
  "Сгибания на бицепс в кроссовере": "Cable curl",
  "Сгибания на бицепс в тренажёре": "Machine curl",
  "Концентрированные сгибания": "Concentration curl",
  "Сгибания на бицепс лёжа на наклонной": "Incline curl",
  "Паучьи сгибания": "Spider curl",
  "Сгибания с резиной": "Band curl",
  "Французский жим лёжа": "Lying triceps extension",
  "Французский жим сидя": "Seated triceps extension",
  "Французский жим с гантелью": "Dumbbell triceps extension",
  "Разгибания на трицепс в блоке": "Triceps pushdown",
  "Разгибания на трицепс с канатом": "Rope pushdown",
  "Разгибания на трицепс обратным хватом": "Reverse-grip pushdown",
  "Разгибания из-за головы в блоке": "Overhead cable extension",
  "Разгибания одной рукой в блоке": "Single-arm pushdown",
  "Отжимания на брусьях на трицепс": "Triceps dip",
  "Обратные отжимания от скамьи": "Bench dip",
  "Жим лёжа узким хватом на трицепс": "Close-grip bench (triceps)",
  "Кикбэк с гантелью": "Dumbbell kickback",
  "Разгибания в тренажёре на трицепс": "Machine triceps extension",
  "Отжимания алмазные": "Diamond push-up",
  "Сгибания запястий со штангой": "Barbell wrist curl",
  "Разгибания запястий со штангой": "Barbell wrist extension",
  "Прогулка фермера": "Farmer's walk",
  "Вис на перекладине на время": "Dead hang",
  "Сжимание эспандера": "Grip squeeze",
  "Подъём штанги на бицепс в Смите": "Smith machine curl",
  "Скручивания на полу": "Floor crunch",
  "Скручивания на наклонной скамье": "Decline crunch",
  "Скручивания в тренажёре": "Machine crunch",
  "Скручивания на верхнем блоке (молитва)": "Cable crunch",
  "Обратные скручивания": "Reverse crunch",
  "Подъём ног в висе": "Hanging leg raise",
  "Подъём коленей в висе": "Hanging knee raise",
  "Подъём ног лёжа": "Lying leg raise",
  "Подъём ног на брусьях": "Captain's chair leg raise",
  "Планка": "Plank",
  "Боковая планка": "Side plank",
  "Планка с подтягиванием колен": "Plank knee tuck",
  "Планка на локтях с отягощением": "Weighted plank",
  "Русские скручивания": "Russian twist",
  "Велосипед": "Bicycle crunch",
  "Мёртвый жук": "Dead bug",
  "Ролик для пресса": "Ab rollout",
  "Колесо для пресса стоя": "Standing ab wheel",
  "Дровосек в кроссовере": "Cable woodchopper",
  "Наклоны в сторону с гантелью": "Dumbbell side bend",
  "Вакуум живота": "Stomach vacuum",
  "Птица-собака": "Bird dog",
  "Скручивания с мячом": "Ball crunch",
  "V-складка": "V-up",
  "Подъём корпуса с блином": "Weighted sit-up",
  "Пола-пресс с гирей": "Kettlebell floor press (core)",
  "Гребля на тренажёре": "Rowing machine",
  "Берпи": "Burpee",
  "Прыжки на скакалке": "Jump rope",
  "Трастеры со штангой": "Barbell thruster",
  "Махи гирей": "Kettlebell swing",
  "Рывок гири": "Kettlebell snatch",
  "Толчок штанги": "Clean and jerk",
  "Рывок штанги": "Barbell snatch",
  "Взятие на грудь": "Power clean",
  "Медбол в стену": "Wall ball",
};

export interface CatalogItem {
  nameEn: string;
  name: string;
  muscleGroup: MuscleGroup;
}

export const CATALOG: CatalogItem[] = RAW.trim()
  .split("\n")
  .map((line) => {
    const [name, group] = line.split("|");
    const nm = name.trim();
    return { name: nm, nameEn: NAME_EN[nm] ?? nm, muscleGroup: group.trim() as MuscleGroup };
  });

/**
 * Название каталожного упражнения по русскому ключу на текущем языке.
 * Для превью пресетов библиотеки (там упражнения хранятся русскими именами).
 * Нет в карте переводов — возвращаем сам ключ.
 */
export function catalogNameEn(ruName: string): string {
  return getLang() === "ru" ? ruName : NAME_EN[ruName] ?? ruName;
}

export function searchCatalog(
  items: CatalogItem[],
  query: string,
): CatalogItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  // Совпадение с начала названия важнее совпадения в середине:
  // «жим» должен сначала показать «Жим штанги лёжа», а не «Французский жим».
  return items
    .filter((item) => item.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts || a.name.localeCompare(b.name, "ru");
    });
}
