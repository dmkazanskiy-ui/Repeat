// Каталог восстановительных процедур: подпись, иконка и категория для каждой.
// Хранимая модель (RecoveryData) держит только `type` — категория и оформление
// берутся отсюда, чтобы не дублировать данные в записи. Подписи двуязычны и
// читаются с текущего языка динамически.

import type { IconKey } from "../icons";
import type { RecoveryCategory, RecoveryType } from "../types";
import { L } from "../i18n";

interface RecoveryProcedure {
  type: RecoveryType;
  label: string;
  icon: IconKey;
  category: RecoveryCategory;
}

/** type → [ru, en] подпись. */
const TR: Record<RecoveryType, [string, string]> = {
  full_rest: ["День отдыха", "Rest day"],
  sauna: ["Сауна", "Sauna"],
  banya: ["Баня", "Banya"],
  steam: ["Хаммам", "Steam room"],
  hot_bath: ["Горячая ванна", "Hot bath"],
  cold_plunge: ["Холодная купель", "Cold plunge"],
  ice_bath: ["Ледяная ванна", "Ice bath"],
  cold_shower: ["Холодный душ", "Cold shower"],
  contrast: ["Контраст", "Contrast"],
  massage: ["Массаж", "Massage"],
  sports_massage: ["Спортивный массаж", "Sports massage"],
  relax_massage: ["Расслабляющий массаж", "Relaxing massage"],
  lymph_massage: ["Лимфодренаж", "Lymph drainage"],
  thai_massage: ["Тайский массаж", "Thai massage"],
  spa_ritual: ["Спа-ритуал", "Spa ritual"],
  compression: ["Компрессия", "Compression"],
  physio: ["Физиотерапия", "Physiotherapy"],
  manual_therapy: ["Мануальная терапия", "Manual therapy"],
  other: ["Другая процедура", "Other procedure"],
};

const CATEGORY_TR: Record<RecoveryCategory, [string, string]> = {
  rest: ["Отдых", "Rest"],
  thermal: ["Тепло", "Heat"],
  cold: ["Холод", "Cold"],
  bodywork: ["Работа с телом", "Bodywork"],
  professional: ["Специалист", "Specialist"],
  other: ["Другое", "Other"],
};

const ICON: Record<RecoveryType, IconKey> = {
  full_rest: "spa",
  sauna: "hottub",
  banya: "hottub",
  steam: "hottub",
  hot_bath: "hottub",
  cold_plunge: "cold",
  ice_bath: "cold",
  cold_shower: "cold",
  contrast: "cold",
  massage: "spa",
  sports_massage: "spa",
  relax_massage: "spa",
  lymph_massage: "healing",
  thai_massage: "spa",
  spa_ritual: "spa",
  compression: "healing",
  physio: "healing",
  manual_therapy: "healing",
  other: "bolt",
};

const CATEGORY_OF: Record<RecoveryType, RecoveryCategory> = {
  full_rest: "rest",
  sauna: "thermal",
  banya: "thermal",
  steam: "thermal",
  hot_bath: "thermal",
  cold_plunge: "cold",
  ice_bath: "cold",
  cold_shower: "cold",
  contrast: "cold",
  massage: "bodywork",
  sports_massage: "bodywork",
  relax_massage: "bodywork",
  lymph_massage: "bodywork",
  thai_massage: "bodywork",
  spa_ritual: "bodywork",
  compression: "bodywork",
  physio: "professional",
  manual_therapy: "professional",
  other: "other",
};

const CATEGORY_ORDER: RecoveryCategory[] = [
  "rest", "thermal", "cold", "bodywork", "professional", "other",
];
const PROCEDURE_ORDER = Object.keys(TR) as RecoveryType[];

/** type → подпись (динамически, с текущего языка). */
export const RECOVERY_LABELS = {} as Record<RecoveryType, string>;
for (const type of PROCEDURE_ORDER) {
  Object.defineProperty(RECOVERY_LABELS, type, {
    get: () => L(TR[type][0], TR[type][1]),
    enumerable: true,
  });
}

/** type → иконка. */
export const RECOVERY_ICONS = ICON;

/** type → категория. */
export const RECOVERY_CATEGORY_OF = CATEGORY_OF;

/** Категории в порядке показа с подписями. */
export const RECOVERY_CATEGORIES: Array<{ category: RecoveryCategory; label: string }> =
  CATEGORY_ORDER.map((category) => ({
    category,
    get label() {
      return L(CATEGORY_TR[category][0], CATEGORY_TR[category][1]);
    },
  }));

/** Плоский список процедур в порядке категорий. */
export const RECOVERY_PROCEDURES: RecoveryProcedure[] = CATEGORY_ORDER.flatMap((cat) =>
  PROCEDURE_ORDER.filter((type) => CATEGORY_OF[type] === cat).map((type) => ({
    type,
    icon: ICON[type],
    category: cat,
    get label() {
      return RECOVERY_LABELS[type];
    },
  })),
);

/** Процедуры одной категории — для сетки выбора. */
export function proceduresOf(category: RecoveryCategory): RecoveryProcedure[] {
  return RECOVERY_PROCEDURES.filter((p) => p.category === category);
}
