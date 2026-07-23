// Резюме периода по детерминированным правилам. Никакого LLM — но структура
// разделена на факты (`summaryFacts`) и рендер (`periodSummary`), чтобы позже
// поверх тех же фактов можно было подключить AI-анализ. Формулировки
// нейтральные, без медицинских выводов.

import { formatVolume } from "../format";
import { bestE1rm } from "../types";
import type { Exercise, Session, TrainingProgram } from "../types";
import { compareMetric, summarize } from "./metrics";
import { muscleLoads } from "./muscle";
import { programProgress } from "./program";
import { newRecordsInPeriod } from "./records";
import type { AnalyticsPeriod } from "./types";

export interface SummaryFacts {
  workouts: number;
  activeDays: number;
  volume: number;
  volumeChangePct: number | null;
  distanceM: number;
  bestE1rm: { name: string; value: number } | null;
  recordCount: number;
  topMuscles: string[];
  belowAverageMuscles: string[];
  programProgressCount: number; // упражнений с ростом в программе
}

export function summaryFacts(
  sessions: Session[],
  exercises: Exercise[],
  programs: TrainingProgram[],
  period: AnalyticsPeriod,
): SummaryFacts {
  const sum = summarize(sessions, period.startDate, period.endDate);
  const volCmp = compareMetric(sessions, period, "volume");

  let best: { name: string; value: number } | null = null;
  for (const s of sessions) {
    if (s.kind !== "strength" || s.date < period.startDate || s.date > period.endDate) continue;
    for (const ex of s.exercises) {
      const e = bestE1rm(ex);
      if (e != null && (best == null || e > best.value)) {
        best = { name: exercises.find((x) => x.id === ex.exerciseId)?.name ?? "упражнение", value: e };
      }
    }
  }

  const loads = muscleLoads(sessions, exercises, period);
  const active = programs.find((p) => !p.archivedAt);
  const progress = active ? programProgress(active, sessions, exercises) : [];
  const progressCount = progress.reduce(
    (n, c) => n + c.deltas.filter((d) => d.status === "up").length,
    0,
  );

  return {
    workouts: sum.workouts,
    activeDays: sum.activeDays,
    volume: sum.volume,
    volumeChangePct: volCmp.percent,
    distanceM: sum.distance,
    bestE1rm: best,
    recordCount: newRecordsInPeriod(sessions, exercises, period.startDate, period.endDate).length,
    topMuscles: loads.filter((l) => l.adjustedSets > 0).slice(0, 3).map((l) => l.label),
    belowAverageMuscles: loads.filter((l) => l.level === "below").map((l) => l.label),
    programProgressCount: progressCount,
  };
}

/** Русское склонение по числу. */
function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

/**
 * Резюме периода списком предложений. `periodLabel` — «За неделю» / «За
 * месяц» / «За период». Пустой период даёт короткую подсказку.
 */
export function periodSummary(
  sessions: Session[],
  exercises: Exercise[],
  programs: TrainingProgram[],
  period: AnalyticsPeriod,
  periodLabel = "За период",
): string[] {
  const f = summaryFacts(sessions, exercises, programs, period);
  if (f.workouts === 0) {
    return [`${periodLabel} тренировок не было.`];
  }

  const lines: string[] = [];
  lines.push(
    `${periodLabel} выполнено ${f.workouts} ${plural(f.workouts, "тренировка", "тренировки", "тренировок")} ` +
      `в ${f.activeDays} ${plural(f.activeDays, "тренировочный день", "тренировочных дня", "тренировочных дней")}.`,
  );

  if (f.volume > 0) {
    let vol = `Общий тоннаж — ${formatVolume(f.volume)}.`;
    if (f.volumeChangePct != null && Math.round(f.volumeChangePct) !== 0) {
      const pct = Math.round(f.volumeChangePct);
      vol += ` Объём ${pct > 0 ? "увеличился" : "снизился"} на ${Math.abs(pct)}% к прошлому периоду.`;
    }
    lines.push(vol);
  }

  if (f.distanceM > 0) {
    lines.push(`Кардио — ${(f.distanceM / 1000).toFixed(1).replace(".", ",")} км.`);
  }

  if (f.bestE1rm) {
    lines.push(`Лучший силовой результат — e1RM ${Math.round(f.bestE1rm.value)} кг в «${f.bestE1rm.name}».`);
  }

  if (f.recordCount > 0) {
    lines.push(
      `Установлено ${f.recordCount} ${plural(f.recordCount, "новый рекорд", "новых рекорда", "новых рекордов")}.`,
    );
  }

  if (f.programProgressCount > 0) {
    lines.push(
      `В программе прогресс по ${f.programProgressCount} ${plural(f.programProgressCount, "упражнению", "упражнениям", "упражнениям")}.`,
    );
  }

  if (f.topMuscles.length > 0) {
    lines.push(`Основная нагрузка — ${f.topMuscles.join(", ").toLowerCase()}.`);
  }

  if (f.belowAverageMuscles.length > 0) {
    lines.push(`${f.belowAverageMuscles[0]} — объём ниже твоего обычного.`);
  }

  return lines;
}
