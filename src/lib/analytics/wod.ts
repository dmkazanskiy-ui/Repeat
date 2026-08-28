// Результаты заданий (кроссфит-WOD и HYROX): история попыток одного и того же
// задания и лучший результат. Никаких формул — сравнивается ровно то, что
// человек сделал: время «на время» и раунды+повторы у AMRAP/EMOM.

import { L } from "../i18n";
import { findWodPreset } from "../wod/catalog";
import type { Session, WodScore } from "../types";

export interface WodAttempt {
  sessionId: string;
  date: string;
  score: WodScore;
  timeSec: number | null;
  rounds: number | null;
  reps: number | null;
  rx: boolean;
  /** Не уложился в лимит — такой результат хуже любого завершённого. */
  capped: boolean;
}

/**
 * Ключ задания для сравнения попыток: каталожный id, а у своих — имя
 * (в нижнем регистре). Своё задание с тем же названием — тоже сравнимо.
 */
export function wodKey(session: Session): string | null {
  if (session.kind !== "wod") return null;
  const presetId = session.wod?.presetId;
  if (presetId) return presetId;
  const name = session.title?.trim().toLowerCase();
  return name ? `name:${name}` : null;
}

/** Отображаемое имя задания. */
export function wodName(session: Session): string {
  const preset = findWodPreset(session.wod?.presetId);
  return preset?.name ?? session.title ?? L("Задание", "Workout");
}

/**
 * Схема задания: своя правка, иначе текст из каталога. Каталожную схему НЕ
 * копируем в данные при создании — иначе она застынет на языке, который был
 * включён в тот день.
 */
export function wodScheme(session: Session): string {
  return session.wod?.scheme ?? findWodPreset(session.wod?.presetId)?.scheme ?? "";
}

/** Попытка из сессии (null, если результат ещё не занесён). */
export function sessionAttempt(session: Session): WodAttempt | null {
  const data = session.wod;
  if (session.kind !== "wod" || !data) return null;
  const hasResult =
    data.timeSec != null || data.rounds != null || data.reps != null;
  if (!hasResult) return null;
  return {
    sessionId: session.id,
    date: session.date,
    score: data.score,
    timeSec: data.timeSec ?? null,
    rounds: data.rounds ?? null,
    reps: data.reps ?? null,
    rx: data.rx ?? false,
    capped: data.capped ?? false,
  };
}

/** Попытки одного задания по возрастанию даты. */
export function wodAttempts(sessions: Session[], key: string): WodAttempt[] {
  return sessions
    .filter((s) => wodKey(s) === key)
    .map(sessionAttempt)
    .filter((a): a is WodAttempt => a != null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Лучше ли попытка `a`, чем `b`. Пустое сравнение — false. */
export function isBetterAttempt(a: WodAttempt, b: WodAttempt | null): boolean {
  if (b == null) return true;
  // Уложился в лимит всегда лучше, чем не уложился.
  if (a.capped !== b.capped) return b.capped;
  if (a.score === "for_time") {
    if (a.timeSec == null) return false;
    if (b.timeSec == null) return true;
    return a.timeSec < b.timeSec;
  }
  const ar = a.rounds ?? 0;
  const br = b.rounds ?? 0;
  if (ar !== br) return ar > br;
  return (a.reps ?? 0) > (b.reps ?? 0);
}

export function wodBest(attempts: WodAttempt[]): WodAttempt | null {
  let best: WodAttempt | null = null;
  for (const a of attempts) if (isBetterAttempt(a, best)) best = a;
  return best;
}

export interface WodSummary {
  key: string;
  name: string;
  score: WodScore;
  attempts: WodAttempt[];
  best: WodAttempt | null;
  last: WodAttempt | null;
  /** Лучший результат — это последняя попытка. */
  bestIsLast: boolean;
}

/** Все задания с историей — свежие сверху (по последней попытке). */
export function wodHistory(sessions: Session[]): WodSummary[] {
  const keys = new Map<string, Session>();
  for (const s of sessions) {
    const key = wodKey(s);
    if (!key) continue;
    if (!keys.has(key)) keys.set(key, s);
  }

  const result: WodSummary[] = [];
  for (const [key, sample] of keys) {
    const attempts = wodAttempts(sessions, key);
    if (attempts.length === 0) continue;
    const best = wodBest(attempts);
    const last = attempts[attempts.length - 1];
    result.push({
      key,
      name: wodName(sample),
      score: attempts[0].score,
      attempts,
      best,
      last,
      bestIsLast: best != null && last != null && best.sessionId === last.sessionId,
    });
  }
  return result.sort((a, b) => ((a.last?.date ?? "") < (b.last?.date ?? "") ? 1 : -1));
}

/** «4:12» / «12 раундов + 5». Пустой результат — «—». */
export function formatWodResult(attempt: WodAttempt | null): string {
  if (attempt == null) return "—";
  if (attempt.score === "for_time") {
    if (attempt.timeSec == null) return "—";
    const m = Math.floor(attempt.timeSec / 60);
    const s = attempt.timeSec % 60;
    const time = `${m}:${String(s).padStart(2, "0")}`;
    return attempt.capped ? L(`${time} (лимит)`, `${time} (capped)`) : time;
  }
  const rounds = attempt.rounds ?? 0;
  const reps = attempt.reps ?? 0;
  const roundsText = L(`${rounds} р.`, `${rounds} rds`);
  return reps > 0 ? `${roundsText} + ${reps}` : roundsText;
}
