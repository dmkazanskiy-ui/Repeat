// HIIT / интервальный таймер: конфиг и разворот в плоский список фаз. Чистые
// функции без UI — по ним и раннер тикает, и тесты идут. Логируется потом как
// кардио-сессия (segments), поэтому единица нагрузки — рабочие секунды.

import { L } from "./i18n";

export interface HiitConfig {
  /** Секунды работы в раунде. */
  workSec: number;
  /** Секунды отдыха между раундами (0 — без отдыха, напр. EMOM). */
  restSec: number;
  rounds: number;
  /** Разминка перед первым раундом (0 — нет). */
  warmupSec: number;
  /** Заминка после последнего (0 — нет). */
  cooldownSec: number;
  /** Обратный отсчёт перед стартом. */
  prepSec: number;
}

export type HiitPhaseKind = "prep" | "warmup" | "work" | "rest" | "cooldown";

export interface HiitPhase {
  kind: HiitPhaseKind;
  sec: number;
  /** Номер раунда (только для work/rest). */
  round?: number;
}

export const DEFAULT_HIIT: HiitConfig = {
  workSec: 30,
  restSec: 15,
  rounds: 8,
  warmupSec: 0,
  cooldownSec: 0,
  prepSec: 5,
};

export interface HiitPreset {
  id: string;
  label: string;
  config: HiitConfig;
}

/** Готовые схемы. «Свой» — не&nbsp;пресет, стартует от последнего конфига. */
export const HIIT_PRESETS: readonly HiitPreset[] = [
  { id: "tabata", get label() { return L("Табата", "Tabata"); }, config: { workSec: 20, restSec: 10, rounds: 8, warmupSec: 0, cooldownSec: 0, prepSec: 10 } },
  { id: "30_30", get label() { return "30 / 30"; }, config: { workSec: 30, restSec: 30, rounds: 8, warmupSec: 0, cooldownSec: 0, prepSec: 5 } },
  { id: "40_20", get label() { return "40 / 20"; }, config: { workSec: 40, restSec: 20, rounds: 6, warmupSec: 0, cooldownSec: 0, prepSec: 5 } },
  { id: "emom", get label() { return "EMOM"; }, config: { workSec: 60, restSec: 0, rounds: 10, warmupSec: 0, cooldownSec: 0, prepSec: 5 } },
] as const;

export function clampHiit(cfg: HiitConfig): HiitConfig {
  const c = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));
  return {
    workSec: c(cfg.workSec, 5, 3600),
    restSec: c(cfg.restSec, 0, 3600),
    rounds: c(cfg.rounds, 1, 99),
    warmupSec: c(cfg.warmupSec, 0, 3600),
    cooldownSec: c(cfg.cooldownSec, 0, 3600),
    prepSec: c(cfg.prepSec, 0, 60),
  };
}

/**
 * Развернуть конфиг в последовательность фаз. Отдых после ПОСЛЕДНЕГО раунда не
 * добавляется (незачем стоять после финального интервала). Prep/warmup/cooldown
 * появляются только если заданы (>0).
 */
export function buildHiitPhases(cfg: HiitConfig): HiitPhase[] {
  const phases: HiitPhase[] = [];
  if (cfg.prepSec > 0) phases.push({ kind: "prep", sec: cfg.prepSec });
  if (cfg.warmupSec > 0) phases.push({ kind: "warmup", sec: cfg.warmupSec });
  for (let r = 1; r <= cfg.rounds; r++) {
    phases.push({ kind: "work", sec: cfg.workSec, round: r });
    if (cfg.restSec > 0 && r < cfg.rounds) phases.push({ kind: "rest", sec: cfg.restSec, round: r });
  }
  if (cfg.cooldownSec > 0) phases.push({ kind: "cooldown", sec: cfg.cooldownSec });
  return phases;
}

/** Суммарные рабочие секунды (для «Время» кардио-сессии и sRPE-нагрузки). */
export function hiitWorkSec(cfg: HiitConfig): number {
  return cfg.rounds * cfg.workSec;
}

/** Полная длительность прогона со всеми фазами. */
export function hiitTotalSec(cfg: HiitConfig): number {
  return buildHiitPhases(cfg).reduce((n, p) => n + p.sec, 0);
}

const HIIT_KEY = "repeat_hiit";

export function loadHiit(): HiitConfig {
  try {
    const raw = localStorage.getItem(HIIT_KEY);
    if (raw) return clampHiit({ ...DEFAULT_HIIT, ...JSON.parse(raw) });
  } catch {
    /* нет/битый — дефолт */
  }
  return DEFAULT_HIIT;
}

export function saveHiit(cfg: HiitConfig): void {
  try {
    localStorage.setItem(HIIT_KEY, JSON.stringify(cfg));
  } catch {
    /* приватный режим — не страшно */
  }
}
