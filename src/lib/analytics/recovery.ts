// Готовность к нагрузке. Честный MVP: если есть свежий субъективный чек-ин —
// показываем его среднее; если нет — только оценка по истории нагрузки и явно
// помечаем как предварительную. Никакой ложной медицинской точности.

import { today } from "../format";
import { perceivedFeel, recoveryAverage } from "../types";
import type { RecoveryEntry, Session } from "../types";
import { loadBaseline } from "./load";
import { diffDays } from "./period";
import type { Confidence } from "./types";

export interface Readiness {
  subjective: number | null; // среднее 1–5 свежего чек-ина (для подписи)
  subjectiveDate: string | null;
  feelFromSessions: number | null; // 0–1, «самочувствие после» за ≤2 дня
  /** Итоговая готовность 0–1 (чек-ин + самочувствие после). */
  score: number | null;
  /** То же по шкале 1–5 (для кольца). */
  score5: number | null;
  daysSinceStrength: number | null;
  loadLevelLabel: string;
  hasSubjective: boolean; // есть утренний чек-ин
  hasSignal: boolean; // есть хоть какой-то субъективный сигнал
  confidence: Confidence;
}

export function readiness(
  sessions: Session[],
  recovery: RecoveryEntry[],
  asOf: string = today(),
): Readiness {
  const fresh = (date: string) => {
    const d = diffDays(date, asOf);
    return d >= 0 && d <= 2;
  };

  // Свежий чек-ин — не старше 2 дней.
  const recent = recovery
    .filter((e) => fresh(e.date))
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const subjective = recent ? recoveryAverage(recent) : null;
  const checkin01 = subjective == null ? null : (subjective - 1) / 4;

  // Самочувствие после активностей за ≤2 дня (любой вид).
  const feels = sessions
    .filter((s) => fresh(s.date))
    .map(perceivedFeel)
    .filter((v): v is number => v != null);
  const feel01 = feels.length ? feels.reduce((a, b) => a + b, 0) / feels.length : null;

  // Чек-ин весит больше (осознанная отметка), но самочувствие после тоже двигает.
  const score =
    checkin01 != null && feel01 != null
      ? 0.6 * checkin01 + 0.4 * feel01
      : (checkin01 ?? feel01);
  const score5 = score == null ? null : score * 4 + 1;

  const lastStrength = sessions
    .filter((s) => s.kind === "strength")
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const daysSinceStrength = lastStrength ? diffDays(lastStrength.date, asOf) : null;

  const load = loadBaseline(sessions, asOf);

  return {
    subjective,
    subjectiveDate: recent?.date ?? null,
    feelFromSessions: feel01,
    score,
    score5,
    daysSinceStrength,
    loadLevelLabel: load.levelLabel,
    hasSubjective: subjective != null,
    hasSignal: score != null,
    confidence: score != null ? "medium" : "preliminary",
  };
}
