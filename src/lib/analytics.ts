// Агрегаты для экрана статистики и график e1RM. Всё считается на лету
// из сохранённых сессий — отдельного хранилища аналитики нет.

import { parseDateKey, toDateKey, weekGrid } from "./format";
import { bestE1rm, sessionDurationSec, sessionVolume } from "./types";
import type { Exercise, Session } from "./types";

export interface Stats {
  weeks: number;
  days: number;
  hours: number; // сумма длительностей в часах (дробное)
  workouts: number;
  volumeKg: number;
  distanceM: number;
  exercises: number; // упражнений-строк за период
  sets: number;
  reps: number;
}

/** Ключ ISO-недели «2026-W30» — чтобы считать «тренировочные недели». */
function isoWeekKey(key: string): string {
  const d = parseDateKey(key);
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // 0 = понедельник
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // ближайший четверг
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      (date.getTime() - firstThursday.getTime()) / 86_400_000 / 7 -
        ((firstThursday.getUTCDay() + 6) % 7) / 7,
    );
  return `${date.getUTCFullYear()}-W${week}`;
}

export function computeStats(sessions: Session[]): Stats {
  const weeks = new Set<string>();
  const days = new Set<string>();
  let hours = 0;
  let volumeKg = 0;
  let distanceM = 0;
  let exercises = 0;
  let sets = 0;
  let reps = 0;

  for (const s of sessions) {
    weeks.add(isoWeekKey(s.date));
    days.add(s.date);
    const dur = sessionDurationSec(s);
    if (dur) hours += dur / 3600;
    volumeKg += sessionVolume(s);
    if (s.kind === "cardio") distanceM += s.cardio?.distanceM ?? 0;
    for (const ex of s.exercises) {
      exercises += 1;
      for (const set of ex.sets) {
        sets += 1;
        reps += set.reps ?? 0;
        for (const drop of set.drops ?? []) reps += drop.reps ?? 0;
      }
    }
  }

  return {
    weeks: weeks.size,
    days: days.size,
    hours,
    workouts: sessions.length,
    volumeKg,
    distanceM,
    exercises,
    sets,
    reps,
  };
}

export function sessionsInRange(
  sessions: Session[],
  from: string,
  to: string,
): Session[] {
  return sessions.filter((s) => s.date >= from && s.date <= to);
}

/** Диапазон недели (Пн–Вс), в которую попадает дата. */
export function weekRange(anchor: string): [string, string] {
  const week = weekGrid(anchor);
  return [week[0], week[6]];
}

/** Диапазон календарного месяца, в который попадает дата. */
export function monthRange(anchor: string): [string, string] {
  const d = parseDateKey(anchor);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return [toDateKey(first), toDateKey(last)];
}

export interface E1rmPoint {
  date: string;
  e1rm: number;
}

/** Точки e1RM по датам для одного упражнения (лучший подход в дне). */
export function e1rmSeries(sessions: Session[], exerciseId: string): E1rmPoint[] {
  const points: E1rmPoint[] = [];
  for (const s of sessions) {
    if (s.kind !== "strength") continue;
    let best: number | null = null;
    for (const ex of s.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      const value = bestE1rm(ex);
      if (value != null && (best == null || value > best)) best = value;
    }
    if (best != null) points.push({ date: s.date, e1rm: best });
  }
  return points.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export interface TrainedExercise {
  id: string;
  name: string;
  points: E1rmPoint[];
  best: number;
  lastDate: string;
}

/** Упражнения, по которым есть тренд e1RM — для списка на экране статистики. */
export function trainedExercises(
  sessions: Session[],
  exercises: Exercise[],
): TrainedExercise[] {
  const ids = new Set<string>();
  for (const s of sessions) {
    if (s.kind !== "strength") continue;
    for (const ex of s.exercises) ids.add(ex.exerciseId);
  }

  const result: TrainedExercise[] = [];
  for (const id of ids) {
    const points = e1rmSeries(sessions, id);
    if (points.length === 0) continue;
    const name = exercises.find((e) => e.id === id)?.name ?? "Упражнение";
    result.push({
      id,
      name,
      points,
      best: Math.max(...points.map((p) => p.e1rm)),
      lastDate: points[points.length - 1].date,
    });
  }
  // Свежие сверху — их логичнее смотреть первыми.
  return result.sort((a, b) => (a.lastDate < b.lastDate ? 1 : -1));
}
