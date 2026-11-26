// Забытые тренировки. Если не нажать «Завершить», таймер тикает вечно, и
// такая тренировка портит длительность, калории и средние: в данных были
// силовые на 108 часов и 55 931 ккал. Здесь две вещи:
//   1. autoFinishStale — закрыть идущую тренировку, которую явно бросили;
//   2. fixDurationOutliers — разово поправить уже записанные выбросы.
// Обе помечают сессию `autoEnded`, чтобы в интерфейсе было видно, что время
// оценено, и его можно поправить через «Изменить».

import type { Session } from "./types";

const MIN = 60_000;
/** Силовая/задание без единой правки дольше часа — брошена. */
export const IDLE_LIMIT_MS = 60 * MIN;
/** Кардио/мобилити/восстановление идут без касаний — ждём дольше. */
export const PASSIVE_LIMIT_MS = 4 * 60 * MIN;
/** Финиш = последняя активность + немного на последний подход. */
const TAIL_MS = 2 * MIN;
/** Длительность выше этого — заведомо зависший таймер. */
export const OUTLIER_MS = 5 * 60 * MIN;

function localDateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isRunning(s: Session): boolean {
  return Boolean(s.startedAt && !s.endedAt);
}

function isActiveKind(s: Session): boolean {
  return s.kind === "strength" || s.kind === "wod";
}

/** Правдоподобная длительность, когда реальная неизвестна, в мс. */
export function estimateDurationMs(s: Session): number {
  if (s.kind === "cardio" && s.cardio?.durationSec) return s.cardio.durationSec * 1000;
  if (s.kind === "recovery" && s.recovery?.durationMin) return s.recovery.durationMin * MIN;
  if (s.kind === "strength") {
    const sets = s.exercises.reduce(
      (n, ex) => n + ex.sets.filter((x) => x.done || x.weight != null || x.reps != null).length,
      0,
    );
    // ~3 минуты на подход с отдыхом, в разумных рамках.
    return Math.min(120, Math.max(20, sets * 3)) * MIN;
  }
  if (s.kind === "mobility") return 30 * MIN;
  return 60 * MIN;
}

/** Время последней активности идущей тренировки, мс. */
function lastActivityMs(s: Session): number | null {
  const marks = [s.lastActivityAt, s.pausedAt].filter(Boolean).map((v) => Date.parse(v!));
  return marks.length ? Math.max(...marks) : null;
}

/** Закрыть на моменте `endMs` (часы на стене, паузы уже внутри pausedMs). */
function close(s: Session, endMs: number): Session {
  const start = Date.parse(s.startedAt!);
  const end = Math.max(endMs, start + MIN + (s.pausedMs ?? 0));
  return { ...s, endedAt: new Date(end).toISOString(), pausedAt: null, autoEnded: true };
}

/**
 * Закрыть брошенные тренировки. Прошла полночь — закрываем вчерашнюю сразу:
 * финиш = последняя активность + 2 минуты. Силовая — если правок не было больше часа:
 * финиш = последняя правка + 2 минуты. Кардио и прочие — если идут дольше
 * 4 часов: финиш = введённое время кардио или оценка. Старые записи без
 * отметки активности тоже получают оценку.
 */
export function autoFinishStale(
  sessions: Session[],
  nowMs: number,
): { sessions: Session[]; closed: number } {
  let closed = 0;
  const next = sessions.map((s) => {
    if (!isRunning(s)) return s;
    const start = Date.parse(s.startedAt!);
    if (Number.isNaN(start)) return s;
    const last = lastActivityMs(s);

    // Наступила полночь, а тренировка вчерашняя — точно забыта.
    if (s.date < localDateKey(nowMs)) {
      closed++;
      const end = last != null ? (s.pausedAt ? last : last + TAIL_MS) : start + (s.pausedMs ?? 0) + estimateDurationMs(s);
      return close(s, Math.min(nowMs, end));
    }

    if (isActiveKind(s) && last != null) {
      if (nowMs - last <= IDLE_LIMIT_MS) return s;
      closed++;
      return close(s, s.pausedAt ? last : Math.min(nowMs, last + TAIL_MS));
    }
    const limit = isActiveKind(s) ? IDLE_LIMIT_MS : PASSIVE_LIMIT_MS;
    const ref = last ?? start;
    if (nowMs - ref <= limit && nowMs - start <= PASSIVE_LIMIT_MS) return s;
    closed++;
    return close(s, Math.min(nowMs, start + (s.pausedMs ?? 0) + estimateDurationMs(s)));
  });
  return { sessions: closed ? next : sessions, closed };
}

/**
 * Разовая починка истории: завершённые тренировки длиннее 5 часов — это
 * зависший таймер. Финиш ставим по оценке длительности, исходный сохраняем
 * в `rawEndedAt`, так что ничего не теряется.
 */
export function fixDurationOutliers(sessions: Session[]): { sessions: Session[]; fixed: number } {
  let fixed = 0;
  const next = sessions.map((s) => {
    if (!s.startedAt || !s.endedAt || s.rawEndedAt) return s;
    const start = Date.parse(s.startedAt);
    const end = Date.parse(s.endedAt);
    if (Number.isNaN(start) || Number.isNaN(end)) return s;
    if (end - start - (s.pausedMs ?? 0) <= OUTLIER_MS) return s;
    fixed++;
    return {
      ...s,
      rawEndedAt: s.endedAt,
      endedAt: new Date(start + estimateDurationMs(s)).toISOString(),
      pausedMs: 0,
      autoEnded: true,
    };
  });
  return { sessions: fixed ? next : sessions, fixed };
}
