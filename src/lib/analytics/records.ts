import { epley, sessionDurationSec } from "../types";
import type { Exercise, Session } from "../types";
import { workingVolume } from "./metrics";
import { exerciseWorkingVolume } from "./strength";
import type { PersonalRecord, PrType } from "./types";

interface Peak {
  value: number;
  date: string;
}

function higher(a: Peak | null, value: number, date: string): Peak {
  return a && a.value >= value ? a : { value, date };
}

/** Лучшие e1RM, вес и тоннаж по упражнению в наборе сессий. */
function exercisePeaks(sessions: Session[]) {
  const e1rm = new Map<string, Peak>();
  const weight = new Map<string, Peak>();
  const volume = new Map<string, Peak>();

  for (const s of sessions) {
    if (s.kind !== "strength") continue;
    for (const ex of s.exercises) {
      const vol = exerciseWorkingVolume(ex);
      if (vol > 0) volume.set(ex.exerciseId, higher(volume.get(ex.exerciseId) ?? null, vol, s.date));
      for (const set of ex.sets) {
        if (set.warmup) continue;
        if (set.weight != null)
          weight.set(ex.exerciseId, higher(weight.get(ex.exerciseId) ?? null, set.weight, s.date));
        const e = epley(set.weight, set.reps);
        if (e != null)
          e1rm.set(ex.exerciseId, higher(e1rm.get(ex.exerciseId) ?? null, e, s.date));
      }
    }
  }
  return { e1rm, weight, volume };
}

function globalPeak(sessions: Session[], value: (s: Session) => number): Peak | null {
  let peak: Peak | null = null;
  for (const s of sessions) {
    const v = value(s);
    if (v > 0) peak = higher(peak, v, s.date);
  }
  return peak;
}

/**
 * Новые рекорды за период — значения, которые в текущем периоде превзошли
 * лучшее за всю историю до его начала. previousValue = null означает, что
 * это первый результат такого рода.
 */
export function newRecordsInPeriod(
  sessions: Session[],
  exercises: Exercise[],
  start: string,
  end: string,
): PersonalRecord[] {
  const before = sessions.filter((s) => s.date < start);
  const during = sessions.filter((s) => s.date >= start && s.date <= end);
  const nameOf = (id: string) =>
    exercises.find((e) => e.id === id)?.name ?? "Упражнение";

  const beforeEx = exercisePeaks(before);
  const duringEx = exercisePeaks(during);
  const records: PersonalRecord[] = [];

  const exerciseTypes: Array<[PrType, Map<string, Peak>, Map<string, Peak>, string]> = [
    ["e1rm", duringEx.e1rm, beforeEx.e1rm, "кг"],
    ["weight", duringEx.weight, beforeEx.weight, "кг"],
    ["exerciseVolume", duringEx.volume, beforeEx.volume, "кг"],
  ];

  for (const [type, dur, prev, unit] of exerciseTypes) {
    for (const [id, peak] of dur) {
      const previous = prev.get(id)?.value ?? null;
      if (previous == null || peak.value > previous) {
        records.push({
          type,
          exerciseId: id,
          label: nameOf(id),
          previousValue: previous,
          newValue: peak.value,
          achievedAt: peak.date,
          unit,
        });
      }
    }
  }

  // min — порог значимости: слишком короткие/мелкие результаты не рекорды.
  // Длительность < 60 с (случайно оставленный таймер) рекордом не считаем.
  const globals: Array<[PrType, (s: Session) => number, string, string, number]> = [
    ["sessionVolume", workingVolume, "Тоннаж тренировки", "кг", 1],
    ["distance", (s) => (s.kind === "cardio" ? (s.cardio?.distanceM ?? 0) : 0), "Дистанция", "м", 1],
    ["duration", (s) => sessionDurationSec(s) ?? 0, "Длительность", "с", 60],
  ];

  for (const [type, value, label, unit, min] of globals) {
    const dur = globalPeak(during, value);
    if (!dur || dur.value < min) continue;
    const prev = globalPeak(before, value)?.value ?? null;
    if (prev == null || dur.value > prev) {
      records.push({
        type,
        label,
        previousValue: prev,
        newValue: dur.value,
        achievedAt: dur.date,
        unit,
      });
    }
  }

  // Свежие и крупные улучшения — выше.
  return records.sort((a, b) =>
    a.achievedAt === b.achievedAt
      ? b.newValue - (b.previousValue ?? 0) - (a.newValue - (a.previousValue ?? 0))
      : a.achievedAt < b.achievedAt
        ? 1
        : -1,
  );
}
