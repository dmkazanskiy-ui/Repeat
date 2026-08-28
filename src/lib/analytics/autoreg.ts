// Авторегуляция: умная корректировка переноса весов при старте дня программы.
// Две петли, обе детерминированные (без API):
//   (A) прогрессия по факту прошлого раза — double progression против диапазона
//       повторов плана (взял верх → +вес; недобрал низ → закрепляем; в диапазоне
//       → добираем повторы);
//   (B) модуляция дня по готовности/ACWR — низкая готовность или скачок нагрузки
//       гасят прибавку и срезают подход; высокая — зелёный свет на +.
// Всё это ПРЕДЛОЖЕНИЕ: значения предзаполняются, но редактируемы и пропускаемы.

import type { Exercise, ProgramWorkout, Session, SessionExercise } from "../types";
import { classifyExercise } from "./muscles";
import type { AcwrLevel } from "./sessionLoad";
import { isWorkingSet } from "./metrics";
import { L } from "../i18n";

export type ProgressAction = "increase" | "hold" | "add_reps";
export type DayModifier = "easy" | "normal" | "push";

const LOWER_BODY = new Set(["quads", "hamstrings", "glutes"]);

/** Шаг прибавки веса: ноги/крупные компаунды +5, остальное +2.5. */
export function weightIncrement(exerciseId: string, exercises: Exercise[]): number {
  const ex = exercises.find((e) => e.id === exerciseId);
  if (!ex) return 2.5;
  const primary = classifyExercise(ex).muscles[0];
  return primary && LOWER_BODY.has(primary.muscle) ? 5 : 2.5;
}

export interface ExerciseAdjustment {
  plannedExerciseId: string;
  exerciseId: string;
  action: ProgressAction;
  /** Предлагаемый вес подхода (null — со своим весом). */
  weight: number | null;
  /** Предлагаемая цель по повторам. */
  reps: number | null;
  /** Предлагаемое число рабочих подходов. */
  sets: number;
  /** Изменение веса против прошлого раза (для показа). */
  deltaWeight: number;
  reason: string;
}

export interface AutoregPlan {
  modifier: DayModifier;
  /** Короткий заголовок-баннер. */
  headline: string;
  /** Причина модификатора дня. */
  modifierReason: string;
  adjustments: ExerciseAdjustment[];
  /** Карта по plannedExerciseId — для предзаполнения при старте. */
  byPlanned: Record<string, ExerciseAdjustment>;
  hasSignal: boolean;
}

/** Тяжелейший рабочий вес и список повторов рабочих подходов прошлого раза. */
function prevPerformance(prev: SessionExercise | undefined): {
  baseWeight: number | null;
  reps: number[];
} {
  const working = (prev?.sets ?? []).filter(isWorkingSet);
  const weights = working.map((s) => s.weight).filter((w): w is number => w != null);
  const reps = working.map((s) => s.reps).filter((r): r is number => r != null);
  return { baseWeight: weights.length ? Math.max(...weights) : null, reps };
}

export function dayModifier(
  readinessScore: number | null,
  readinessHasSignal: boolean,
  acwrLevel: AcwrLevel,
): { modifier: DayModifier; reason: string } {
  const lowReadiness = readinessHasSignal && readinessScore != null && readinessScore < 0.45;
  if (lowReadiness || acwrLevel === "high") {
    return {
      modifier: "easy",
      reason: lowReadiness
        ? L("готовность снижена", "readiness is low")
        : L("резкий скачок нагрузки", "sharp load spike"),
    };
  }
  // Сюда попадаем только когда день не «лёгкий» (acwrLevel уже не "high").
  if (readinessHasSignal && readinessScore != null && readinessScore >= 0.7) {
    return { modifier: "push", reason: L("готовность высокая", "readiness is high") };
  }
  return { modifier: "normal", reason: "" };
}

export interface AutoregInput {
  workout: ProgramWorkout;
  lastSession: Session | null;
  exercises: Exercise[];
  readinessScore: number | null; // 0–1 или null
  readinessHasSignal: boolean;
  acwrLevel: AcwrLevel;
}

/** Построить план авторегуляции для дня программы. */
export function autoregPlan(input: AutoregInput): AutoregPlan {
  const { workout, lastSession, exercises } = input;
  const { modifier, reason } = dayModifier(
    input.readinessScore,
    input.readinessHasSignal,
    input.acwrLevel,
  );

  const adjustments: ExerciseAdjustment[] = [...workout.exercises]
    .sort((a, b) => a.order - b.order)
    .map((pe) => {
      const prev = lastSession?.exercises.find(
        (e) => e.plannedExerciseId === pe.id || e.exerciseId === pe.exerciseId,
      );
      const { baseWeight, reps } = prevPerformance(prev);
      const repMin = pe.targetRepMin ?? null;
      const repMax = pe.targetRepMax ?? repMin;
      const inc = weightIncrement(pe.exerciseId, exercises);
      let sets = Math.max(1, pe.targetSets || 1);

      let action: ProgressAction = "hold";
      let weight: number | null = baseWeight ?? pe.targetWeight ?? null;
      let repsTarget: number | null = repMin ?? (reps.length ? Math.max(...reps) : null);
      let reasonText = L("по плану", "as planned");

      if (reps.length && repMax != null) {
        const allTop = reps.every((r) => r >= repMax);
        const anyBelowMin = repMin != null && reps.some((r) => r < repMin);
        if (baseWeight != null) {
          if (allTop) {
            action = "increase";
            weight = baseWeight + inc;
            repsTarget = repMin ?? repMax;
            reasonText = `${L("взял верх диапазона", "hit top of range")} · +${inc} ${L("кг", "kg")}`;
          } else if (anyBelowMin) {
            action = "hold";
            weight = baseWeight;
            repsTarget = repMin ?? repMax;
            reasonText = L("недобрал повторы — закрепляем", "reps missed — consolidate");
          } else {
            action = "add_reps";
            weight = baseWeight;
            repsTarget = repMax;
            reasonText = L("в диапазоне — добираем повторы", "in range — add reps");
          }
        } else {
          // Со своим весом — прогрессируем повторами.
          action = allTop ? "add_reps" : "hold";
          weight = null;
          repsTarget = allTop ? repMax + 1 : repMax;
          reasonText = allTop
            ? L("добавь повтор", "add a rep")
            : L("по плану", "as planned");
        }
      }

      // (Б) Модуляция дня: лёгкий гасит прибавку и срезает подход.
      if (modifier === "easy") {
        if (action === "increase") {
          action = "hold";
          weight = baseWeight;
          repsTarget = repMin ?? repMax;
        }
        if (sets >= 3) sets -= 1;
        reasonText = L("день лёгкий — бережём", "easy day — hold back");
      }

      const deltaWeight = weight != null && baseWeight != null ? weight - baseWeight : 0;
      return {
        plannedExerciseId: pe.id,
        exerciseId: pe.exerciseId,
        action,
        weight,
        reps: repsTarget,
        sets,
        deltaWeight,
        reason: reasonText,
      };
    });

  const byPlanned: Record<string, ExerciseAdjustment> = {};
  for (const a of adjustments) byPlanned[a.plannedExerciseId] = a;

  const headline =
    modifier === "easy"
      ? L("Сегодня стоит поберечься", "Take it easy today")
      : modifier === "push"
        ? L("Готовность высокая — можно добавить", "Readiness high — room to push")
        : L("Прогрессия по прошлому разу", "Progression from last time");

  const hasSignal =
    modifier !== "normal" ||
    adjustments.some((a) => a.deltaWeight !== 0 || a.action === "add_reps");

  return { modifier, headline, modifierReason: reason, adjustments, byPlanned, hasSignal };
}

/** Короткая сводка для тоста: «+2.5 кг Жим · держим Присед · день лёгкий». */
export function autoregToast(plan: AutoregPlan, exercises: Exercise[]): string {
  const nameOf = (id: string) => exercises.find((e) => e.id === id)?.name ?? "";
  const bumps = plan.adjustments
    .filter((a) => a.action === "increase")
    .map((a) => `+${a.deltaWeight} ${L("кг", "kg")} ${nameOf(a.exerciseId)}`.trim());
  const parts = [plan.headline, ...bumps.slice(0, 3)];
  return parts.join(" · ");
}
