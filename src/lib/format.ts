const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

/** Локальная дата в YYYY-MM-DD (не UTC — иначе поздние тренировки уедут на день назад). */
export function today(): string {
  return toDateKey(new Date());
}

export function toDateKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function formatDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const label = `${day} ${MONTHS[month - 1]}`;
  return year === new Date().getFullYear() ? label : `${label} ${year}`;
}

export function formatRelative(dateKey: string): string {
  const diff = daysAgo(dateKey);
  if (diff === 0) return "сегодня";
  if (diff === 1) return "вчера";
  if (diff > 0 && diff < 7) return `${diff} дн. назад`;
  return formatDate(dateKey);
}

export function daysAgo(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  const then = new Date(year, month - 1, day);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((start.getTime() - then.getTime()) / 86_400_000);
}

/** 82.5 → «82,5», 80 → «80». Хвостовые нули в зале только мешают. */
export function formatWeight(value: number | null): string {
  if (value == null) return "—";
  return String(Number(value.toFixed(2))).replace(".", ",");
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
}
