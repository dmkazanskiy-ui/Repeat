// sRPE-нагрузка: усилие × длительность как единый скаляр «сессионной нагрузки»
// (session load, sRPE). Единица условная (множитель усилия × минуты) и НАРУЖУ в
// «у.е.» не показывается — из неё считаем только производные: острая:хроническая
// нагрузка (ACWR, SPEC §5.4) и уточнение недельного уровня. Там, где усилие или
// длительность не отмечены, честно падаем в предварительную оценку по подходам.

import { addDays, today } from "../format";
import { isTrainingSession, sessionDurationSec } from "../types";
import type { Session, SessionIntensity } from "../types";
import type { Confidence } from "./types";

/** Множитель усилия для sRPE: легко ×0.5 / средне ×1.0 / тяжело ×1.5. */
export const INTENSITY_LOAD_FACTOR: Record<SessionIntensity, number> = {
  easy: 0.5,
  medium: 1,
  hard: 1.5,
};

const DEFAULT_FACTOR = INTENSITY_LOAD_FACTOR.medium; // усилие не отмечено → нейтрально

/**
 * Нагрузка одной сессии = множитель усилия × минуты. null, если это не
 * тренировочная сессия (восстановление/мобилити) или длительности нет —
 * такую в sRPE не считаем, она лишь снижает покрытие.
 */
export function sessionLoad(session: Session): number | null {
  if (!isTrainingSession(session)) return null;
  const secs = sessionDurationSec(session);
  if (secs == null || secs <= 0) return null;
  const factor = session.intensity ? INTENSITY_LOAD_FACTOR[session.intensity] : DEFAULT_FACTOR;
  return factor * (secs / 60);
}

/** Сумма sRPE-нагрузки по сессиям в окне дат [from, to] включительно. */
function loadInWindow(sessions: Session[], from: string, to: string): number {
  return sessions
    .filter((s) => s.date >= from && s.date <= to)
    .reduce((sum, s) => sum + (sessionLoad(s) ?? 0), 0);
}

/**
 * Доля тренировочных сессий в окне, для которых нагрузка посчиталась (есть
 * длительность). Драйвит confidence: мало покрытия → «предварительно».
 */
function coverage(sessions: Session[], from: string, to: string): number {
  const training = sessions.filter(
    (s) => s.date >= from && s.date <= to && isTrainingSession(s),
  );
  if (training.length === 0) return 0;
  const covered = training.filter((s) => sessionLoad(s) != null).length;
  return covered / training.length;
}

export type AcwrLevel = "low" | "optimal" | "high" | "unknown";

export interface Acwr {
  /** Острая нагрузка — sRPE за последние 7 дней. */
  acute: number;
  /** Хроническая — средняя недельная sRPE за 28 дней (сумма / 4). */
  chronic: number;
  /** acute / chronic; null, пока хронической базы нет. */
  ratio: number | null;
  level: AcwrLevel;
  coverage: number;
  confidence: Confidence;
}

// Классический «sweet spot» 0.8–1.3; риск при заметном перекосе. SPEC §5.4:
// острая:хроническая ≥ 1.5 — тревожный сигнал, < 0.8 — недобор/растренировка.
function acwrLevel(ratio: number): AcwrLevel {
  if (ratio > 1.5) return "high";
  if (ratio < 0.8) return "low";
  return "optimal";
}

/**
 * Острая:хроническая нагрузка (ACWR). Острая — sRPE за 7 дней, хроническая —
 * среднее недельное за 28 дней. Отношение выше 1.5 = резкий скачок нагрузки,
 * ниже 0.8 = недобор. Без 28-дневной базы возвращаем unknown.
 */
export function acuteChronicLoad(
  sessions: Session[],
  asOf: string = today(),
): Acwr {
  const acute = loadInWindow(sessions, addDays(asOf, -6), asOf);
  const chronic28 = loadInWindow(sessions, addDays(asOf, -27), asOf);
  const chronic = chronic28 / 4;
  const cov = coverage(sessions, addDays(asOf, -27), asOf);

  if (chronic <= 0) {
    return { acute, chronic, ratio: null, level: "unknown", coverage: cov, confidence: "preliminary" };
  }
  const ratio = acute / chronic;
  return {
    acute,
    chronic,
    ratio,
    level: acwrLevel(ratio),
    coverage: cov,
    // Отмеченное усилие есть у большинства → доверяем оценке чуть больше.
    confidence: cov >= 0.6 ? "medium" : "preliminary",
  };
}
