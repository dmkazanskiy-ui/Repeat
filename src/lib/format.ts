import type { CardioKind } from "./types";
import { L, getLang } from "./i18n";

const MONTHS_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];
const MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTHS_NOM_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];
const MONTHS_NOM_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAYS_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const WEEKDAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Короткие дни недели (Пн–Вс) на текущем языке. */
export function weekdaysShort(): string[] {
  return getLang() === "ru" ? WEEKDAYS_RU : WEEKDAYS_EN;
}

/** Десятичный разделитель текущего языка. */
function dec(value: number): string {
  return String(value).replace(".", L(",", "."));
}

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
  const months = getLang() === "ru" ? MONTHS_NOM_RU : MONTHS_NOM_EN;
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDate(key: string): string {
  const date = parseDateKey(key);
  const ru = getLang() === "ru";
  const months = ru ? MONTHS_RU : MONTHS_EN;
  // РУ: «5 августа»; EN: «Aug 5».
  const label = ru
    ? `${date.getDate()} ${months[date.getMonth()]}`
    : `${months[date.getMonth()]} ${date.getDate()}`;
  return date.getFullYear() === new Date().getFullYear()
    ? label
    : `${label} ${date.getFullYear()}`;
}

export function formatDateFull(key: string): string {
  const diff = daysBetween(today(), key);
  if (diff === 0) return `${L("Сегодня", "Today")}, ${formatDate(key)}`;
  if (diff === 1) return `${L("Вчера", "Yesterday")}, ${formatDate(key)}`;
  if (diff === -1) return `${L("Завтра", "Tomorrow")}, ${formatDate(key)}`;
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

/** Текущее время «HH:MM» — время старта по умолчанию у новой тренировки. */
export function nowTime(): string {
  const now = new Date();
  const h = `${now.getHours()}`.padStart(2, "0");
  const m = `${now.getMinutes()}`.padStart(2, "0");
  return `${h}:${m}`;
}

/** Тоннаж: «4 820 кг» с неразрывными пробелами в разрядах. */
export function formatVolume(kg: number): string {
  if (!kg) return "—";
  const locale = getLang() === "ru" ? "ru-RU" : "en-US";
  return `${Math.round(kg).toLocaleString(locale)} ${L("кг", "kg")}`;
}

export function formatWeight(value: number | null): string {
  if (value == null) return "—";
  return dec(Number(value.toFixed(2)));
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const total = Math.round(seconds / 60);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const h = L("ч", "h");
  const min = L("мин", "min");
  if (hours === 0) return `${minutes} ${min}`;
  return minutes === 0 ? `${hours} ${h}` : `${hours} ${h} ${minutes} ${min}`;
}

/** Короткие отрезки в виде 1:30 — «2 мин» для интервала бесполезно. */
export function formatClock(seconds: number | null): string {
  if (!seconds) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}:${`${rest}`.padStart(2, "0")}`;
}

export function formatDistance(
  meters: number | null,
  kind: CardioKind | null,
): string {
  if (meters == null) return "—";
  if (kind === "swim") return `${Math.round(meters)} ${L("м", "m")}`;
  return `${dec(Number((meters / 1000).toFixed(2)))} ${L("км", "km")}`;
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
  const label = kind === "swim" ? L("/100 м", "/100 m") : L("/км", "/km");
  return `${minutes}:${`${rest}`.padStart(2, "0")}${label}`;
}
