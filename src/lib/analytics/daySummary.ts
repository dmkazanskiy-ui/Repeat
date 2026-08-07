// Итог выбранного дня для экрана календаря. Валидируем формулировку по составу
// дня: силовые — «тренировки», а если был только отдых — «восстановление», а не
// «тренировка». Порядок типов фиксирован (силовая → кардио → мобилити →
// восстановление). Чистые функции, считаются по фактическим сессиям дня.

import { getLang } from "../i18n";
import { sessionDurationSec, sessionVolume } from "../types";
import type { Session, SessionKind } from "../types";

const KIND_ORDER: SessionKind[] = ["strength", "cardio", "mobility", "recovery"];

export interface DaySummaryItem {
  kind: SessionKind;
  count: number;
  /** Локализованная фраза «N …» с правильным склонением. */
  label: string;
}

export interface DaySummary {
  items: DaySummaryItem[];
  /** Готовая строка-итог: «2 тренировки · 1 кардио» / «1 восстановление». */
  headline: string;
  /** Тоннаж силовых за день (только выполненные подходы). */
  tonnage: number;
  /** Суммарная активная длительность, сек. */
  durationSec: number;
  /** Суммарная дистанция кардио, м. */
  distanceM: number;
  /** В дне вообще не было тренировочных сессий (только восстановление). */
  recoveryOnly: boolean;
}

function ruPlural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function labelFor(kind: SessionKind, n: number): string {
  const ru = getLang() === "ru";
  switch (kind) {
    case "strength":
      return ru ? ruPlural(n, "тренировка", "тренировки", "тренировок") : n === 1 ? "workout" : "workouts";
    case "cardio":
      return ru ? "кардио" : "cardio";
    case "mobility":
      return ru ? "мобилити" : "mobility";
    case "recovery":
      return ru
        ? ruPlural(n, "восстановление", "восстановления", "восстановлений")
        : n === 1 ? "recovery" : "recovery sessions";
  }
}

/** Свести сессии одного дня в структурированный итог. */
export function daySummary(sessions: Session[]): DaySummary {
  const counts = new Map<SessionKind, number>();
  let tonnage = 0;
  let durationSec = 0;
  let distanceM = 0;

  for (const s of sessions) {
    counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);
    if (s.kind === "strength") tonnage += sessionVolume(s);
    durationSec += sessionDurationSec(s) ?? 0;
    distanceM += s.cardio?.distanceM ?? 0;
  }

  const items: DaySummaryItem[] = KIND_ORDER.filter((k) => counts.has(k)).map((kind) => {
    const count = counts.get(kind)!;
    return { kind, count, label: `${count} ${labelFor(kind, count)}` };
  });

  const recoveryOnly = items.length > 0 && items.every((i) => i.kind === "recovery");

  return {
    items,
    headline: items.map((i) => i.label).join(" · "),
    tonnage: Math.round(tonnage),
    durationSec,
    distanceM,
    recoveryOnly,
  };
}
