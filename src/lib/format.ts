import type { CardioKind } from "./types";

const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

const MONTHS_NOM = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

export const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** Локальная дата в YYYY-MM-DD (не UTC — иначе поздние тренировки уедут на день назад). */
export function toDateKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function today(): string {
  return toDateKey(new Date());
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function monthTitle(date: Date): string {
  return `${MONTHS_NOM[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDate(key: string): string {
  const date = parseDateKey(key);
  const label = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === new Date().getFullYear()
    ? label
    : `${label} ${date.getFullYear()}`;
}

export function formatDateFull(key: string): string {
  const diff = daysBetween(today(), key);
  if (diff === 0) return `Сегодня, ${formatDate(key)}`;
  if (diff === 1) return `Вчера, ${formatDate(key)}`;
  if (diff === -1) return `Завтра, ${formatDate(key)}`;
  return formatDate(key);
}

/** Положительное значение — `key` в прошлом относительно `from`. */
export function daysBetween(from: string, key: string): number {
  const a = parseDateKey(from).getTime();
  const b = parseDateKey(key).getTime();
  return Math.round((a - b) / 86_400_000);
}

export function addDays(key: string, days: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

/** Сетка месяца с понедельника: всегда целые недели, чужие дни включительно. */
export function monthGrid(date: Date): string[] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // 0 = понедельник
  const start = new Date(first);
  start.setDate(first.getDate() - offset);

  const cells: string[] = [];
  for (let i = 0; i < 42; i++) {
    const cell = new Date(start);
    cell.setDate(start.getDate() + i);
    cells.push(toDateKey(cell));
    // Хвост обрезаем, как только закрыли неделю и вышли за месяц.
    if (i >= 27 && i % 7 === 6 && cell.getMonth() !== date.getMonth()) break;
  }
  return cells;
}

/** Неделя (Пн–Вс), в которую попадает дата — для свёрнутого календаря. */
export function weekGrid(key: string): string[] {
  const date = parseDateKey(key);
  const offset = (date.getDay() + 6) % 7; // 0 = понедельник
  const monday = new Date(date);
  monday.setDate(date.getDate() - offset);
  return Array.from({ length: 7 }, (_, i) => {
    const cell = new Date(monday);
    cell.setDate(monday.getDate() + i);
    return toDateKey(cell);
  });
}

export function formatWeight(value: number | null): string {
  if (value == null) return "—";
  return String(Number(value.toFixed(2))).replace(".", ",");
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const total = Math.round(seconds / 60);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes} мин`;
  return minutes === 0 ? `${hours} ч` : `${hours} ч ${minutes} мин`;
}

export function formatDistance(
  meters: number | null,
  kind: CardioKind | null,
): string {
  if (meters == null) return "—";
  if (kind === "swim") return `${Math.round(meters)} м`;
  return `${(meters / 1000).toFixed(2).replace(".", ",")} км`;
}

/**
 * Темп — производная величина, вводить её руками не нужно.
 * Плавание считается на 100 м, остальное на километр.
 */
export function formatPace(
  meters: number | null,
  seconds: number | null,
  kind: CardioKind | null,
): string {
  if (!meters || !seconds) return "—";
  const unit = kind === "swim" ? 100 : 1000;
  const perUnit = seconds / (meters / unit);
  const minutes = Math.floor(perUnit / 60);
  const rest = Math.round(perUnit % 60);
  const label = kind === "swim" ? "/100 м" : "/км";
  return `${minutes}:${`${rest}`.padStart(2, "0")}${label}`;
}
