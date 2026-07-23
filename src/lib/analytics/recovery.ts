// Готовность к нагрузке. Честный MVP: если есть свежий субъективный чек-ин —
// показываем его среднее; если нет — только оценка по истории нагрузки и явно
// помечаем как предварительную. Никакой ложной медицинской точности.

import { today } from "../format";
import { recoveryAverage } from "../types";
import type { RecoveryEntry, Session } from "../types";
import { loadBaseline } from "./load";
import { diffDays } from "./period";
import type { Confidence } from "./types";

export interface Readiness {
  subjective: number | null; // среднее 1–5 свежего чек-ина
  subjectiveDate: string | null;
  daysSinceStrength: number | null;
  loadLevelLabel: string;
  hasSubjective: boolean;
  confidence: Confidence;
}

export function readiness(
  sessions: Session[],
  recovery: RecoveryEntry[],
  asOf: string = today(),
): Readiness {
  // Свежий чек-ин — не старше 2 дней.
  const recent = recovery
    .filter((e) => {
      const d = diffDays(e.date, asOf);
      return d >= 0 && d <= 2;
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const subjective = recent ? recoveryAverage(recent) : null;

  const lastStrength = sessions
    .filter((s) => s.kind === "strength")
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const daysSinceStrength = lastStrength ? diffDays(lastStrength.date, asOf) : null;

  const load = loadBaseline(sessions, asOf);

  return {
    subjective,
    subjectiveDate: recent?.date ?? null,
    daysSinceStrength,
    loadLevelLabel: load.levelLabel,
    hasSubjective: subjective != null,
    confidence: subjective != null ? "medium" : "preliminary",
  };
}
