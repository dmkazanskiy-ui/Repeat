// Баланс отдыха и предупреждение «высокая нагрузка + плохое самочувствие».
// Прямой ответ на исходную боль: «тренировался сериями без восстановления».
// Всё честно и без медицины: предупреждение появляется только при СОЧЕТАНИИ
// факторов, один тяжёлый день сильного предупреждения не даёт.

import { addDays, today } from "../format";
import { perceivedFeel, recoveryAverage } from "../types";
import type { RecoveryEntry, Session } from "../types";
import { loadBaseline, workingSetsOf } from "./load";
import { acuteChronicLoad } from "./sessionLoad";
import type { Acwr } from "./sessionLoad";
import { diffDays } from "./period";
import { L, getLang } from "../i18n";

export type DayClass = "rest" | "light" | "normal" | "heavy";

/** Сессии тренировочной нагрузки в дне: силовая или кардио (не восстановление, не мобилити). */
function loadSessionsOn(sessions: Session[], day: string): Session[] {
  return sessions.filter(
    (s) => s.date === day && (s.kind === "strength" || s.kind === "cardio"),
  );
}

/**
 * Типичный дневной объём силовой (рабочие подходы) — среднее по силовым дням за
 * последние 28 дней до asOf, разгрузочные исключены. 0, если истории ещё нет.
 */
function typicalDayLoad(sessions: Session[], asOf: string): number {
  const from = addDays(asOf, -28);
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    if (s.kind !== "strength" || s.deload) continue;
    if (s.date < from || s.date >= asOf) continue; // текущий день в норму не берём
    byDay.set(s.date, (byDay.get(s.date) ?? 0) + workingSetsOf(s));
  }
  const days = [...byDay.values()].filter((v) => v > 0);
  if (days.length === 0) return 0;
  return days.reduce((a, b) => a + b, 0) / days.length;
}

/** Классификация дня по тяжести. `typical` — персональный дневной объём силовой. */
export function classifyDay(
  sessions: Session[],
  day: string,
  typical: number,
): DayClass {
  const load = loadSessionsOn(sessions, day);
  if (load.length === 0) return "rest"; // нет силовой/кардио → день отдыха

  const intensities = load.map((s) => s.intensity).filter(Boolean);
  if (intensities.includes("hard")) return "heavy";

  const sets = load
    .filter((s) => s.kind === "strength")
    .reduce((n, s) => n + workingSetsOf(s), 0);

  // Приоритет — ручная отметка тяжести, иначе объём против личного типичного дня.
  if (typical > 0 && sets > 0) {
    const ratio = sets / typical;
    if (ratio >= 1.25) return "heavy";
    if (ratio < 0.6) return "light";
  }
  if (intensities.includes("easy") && !intensities.includes("medium")) return "light";
  return "normal";
}

/**
 * Свежее субъективное самочувствие (0–1) за ≤2 дня: утренний чек-ин И/ИЛИ
 * «самочувствие после» с активностей. Чек-ин весит больше (осознанная отметка).
 * null, если сигналов нет.
 */
export function subjective01(
  recovery: RecoveryEntry[],
  sessions: Session[],
  asOf: string,
): number | null {
  const fresh = (date: string) => {
    const d = diffDays(date, asOf);
    return d >= 0 && d <= 2;
  };
  const recent = recovery
    .filter((e) => fresh(e.date))
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const avg = recent ? recoveryAverage(recent) : null;
  const checkin = avg == null ? null : (avg - 1) / 4; // 1–5 → 0–1

  const feels = sessions
    .filter((s) => fresh(s.date))
    .map(perceivedFeel)
    .filter((v): v is number => v != null);
  const feel = feels.length ? feels.reduce((a, b) => a + b, 0) / feels.length : null;

  if (checkin != null && feel != null) return 0.6 * checkin + 0.4 * feel;
  return checkin ?? feel;
}

/** Готовность снижается: последний чек-ин ниже раннего за ≤10 дней хотя бы на 0.5 балла. */
function readinessDeclining(recovery: RecoveryEntry[], asOf: string): boolean {
  const recent = recovery
    .filter((e) => {
      const d = diffDays(e.date, asOf);
      return d >= 0 && d <= 10;
    })
    .map((e) => ({ date: e.date, avg: recoveryAverage(e) }))
    .filter((e): e is { date: string; avg: number } => e.avg != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (recent.length < 2) return false;
  return recent[recent.length - 1].avg <= recent[0].avg - 0.5;
}

export interface RecoveryWarning {
  severity: "info" | "attention" | "high";
  title: string;
  message: string;
  reasons: string[];
}

export interface RestBalance {
  heavyDaysInRow: number;
  fullRestStreak: number;
  daysWithoutHeavy: number;
  daysSinceLastRecovery: number | null;
  /** Острая:хроническая нагрузка (sRPE, SPEC §5.4). */
  acwr: Acwr;
  warning: RecoveryWarning | null;
}

/** Баланс отдыха от asOf назад + предупреждение при сочетании факторов. */
export function restBalance(
  sessions: Session[],
  recovery: RecoveryEntry[],
  asOf: string = today(),
): RestBalance {
  const typical = typicalDayLoad(sessions, asOf);

  // Классы дней от asOf назад (до 90 дней).
  const classes: DayClass[] = [];
  for (let i = 0; i < 90; i++) {
    classes.push(classifyDay(sessions, addDays(asOf, -i), typical));
  }

  const streak = (pred: (c: DayClass) => boolean): number => {
    let n = 0;
    for (const c of classes) {
      if (pred(c)) n++;
      else break;
    }
    return n;
  };
  const heavyDaysInRow = streak((c) => c === "heavy");
  const fullRestStreak = streak((c) => c === "rest");
  const daysWithoutHeavy = streak((c) => c !== "heavy");

  // Последняя запись восстановления.
  const lastRecovery = sessions
    .filter((s) => s.kind === "recovery" && s.date <= asOf)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const daysSinceLastRecovery = lastRecovery ? diffDays(lastRecovery.date, asOf) : null;

  const load = loadBaseline(sessions, asOf);
  const acwr = acuteChronicLoad(sessions, asOf);
  const sub = subjective01(recovery, sessions, asOf);
  const declining = readinessDeclining(recovery, asOf);

  const acwrSpike = acwr.level === "high" && acwr.ratio != null;
  const highLoad =
    heavyDaysInRow >= 3 || (load.ratio != null && load.ratio >= 1.25) || acwrSpike;
  const poorWellbeing = sub != null && sub < 0.4;

  const warning = buildWarning({
    heavyDaysInRow,
    daysWithoutHeavy,
    daysSinceLastRecovery,
    loadRatio: load.ratio,
    acwrRatio: acwrSpike ? acwr.ratio : null,
    highLoad,
    poorWellbeing,
    declining,
    sub,
  });

  return {
    heavyDaysInRow,
    fullRestStreak,
    daysWithoutHeavy,
    daysSinceLastRecovery,
    acwr,
    warning,
  };
}

function buildWarning(x: {
  heavyDaysInRow: number;
  daysWithoutHeavy: number;
  daysSinceLastRecovery: number | null;
  loadRatio: number | null;
  acwrRatio: number | null;
  highLoad: boolean;
  poorWellbeing: boolean;
  declining: boolean;
  sub: number | null;
}): RecoveryWarning | null {
  const reasons: string[] = [];
  if (x.heavyDaysInRow >= 2) reasons.push(`${x.heavyDaysInRow} ${L("тяжёлых", "hard")} ${plural(x.heavyDaysInRow)} ${L("подряд", "in a row")}`);
  if (x.loadRatio != null && x.loadRatio >= 1.25) {
    reasons.push(`${L("нагрузка выше обычной на", "load above usual by")} ${Math.round((x.loadRatio - 1) * 100)}%`);
  }
  if (x.acwrRatio != null) {
    reasons.push(`${L("острая нагрузка выше хронической", "acute load above chronic")} ×${x.acwrRatio.toFixed(1).replace(".", L(",", "."))}`);
  }
  if (x.poorWellbeing) reasons.push(L("самочувствие отмечено как низкое", "well-being marked as low"));
  if (x.declining) reasons.push(L("готовность снижается несколько дней", "readiness declining for several days"));
  if (x.daysSinceLastRecovery != null && x.daysSinceLastRecovery >= 7) {
    reasons.push(`${L("восстановление было", "last recovery")} ${x.daysSinceLastRecovery} ${L("дн. назад", "days ago")}`);
  }
  if (x.daysWithoutHeavy === 0 && x.heavyDaysInRow >= 6) {
    reasons.push(L("давно не было лёгкого дня", "no easy day in a while"));
  }

  // Высокая: высокая нагрузка И (плохое самочувствие ИЛИ падение готовности).
  if (x.highLoad && (x.poorWellbeing || x.declining)) {
    return {
      severity: "high",
      title: L("Восстановления может быть недостаточно", "Recovery may be insufficient"),
      message: L(
        "Нагрузка повышена, а самочувствие снижено. Сегодня можно рассмотреть отдых, лёгкую активность или менее нагруженную группу мышц.",
        "Load is elevated and well-being is down. Consider rest, light activity, or a less-loaded muscle group today.",
      ),
      reasons,
    };
  }
  // Обратить внимание: 2+ тяжёлых подряд и самочувствие ниже среднего.
  if (x.heavyDaysInRow >= 2 && x.sub != null && x.sub < 0.6) {
    return {
      severity: "attention",
      title: L("Стоит обратить внимание", "Worth attention"),
      message: L("Несколько тяжёлых дней подряд на фоне сниженного самочувствия.", "Several hard days in a row on top of lowered well-being."),
      reasons,
    };
  }
  // Информ: давно не было лёгкого дня или давно без восстановления.
  if (
    x.daysWithoutHeavy === 0 &&
    x.heavyDaysInRow >= 4 &&
    !(x.daysSinceLastRecovery != null && x.daysSinceLastRecovery <= 2)
  ) {
    return {
      severity: "info",
      title: L("Давно не было лёгкого дня", "No easy day in a while"),
      message: L("Несколько дней подряд нагрузка была выше обычной. Лёгкий день или восстановление не помешают.", "Load has been above usual for several days. An easy day or recovery wouldn\u2019t hurt."),
      reasons,
    };
  }
  return null;
}

function plural(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (getLang() === "en") return n === 1 ? "day" : "days";
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "дня";
  return "дней";
}
