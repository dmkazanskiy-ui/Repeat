// Линза цели: детерминированный вердикт «как идёшь к своей цели». Под каждую
// цель синтезируем свои сигналы (сила → e1RM/плато/рекорды; выносливость →
// кардио/темп; и т.д.) и подмешиваем готовность. Это каркас будущего AI-резюме:
// когда появится ключ, тот же набор фактов уходит в модель за текстом.

import type { FocusGoal } from "../workoutBuilder";
import type { CapacityProgress } from "./capacities";
import { L } from "../i18n";

export type LensTone = "great" | "on_track" | "attention";
export type Dir = "up" | "down" | "flat" | "none";

export interface LensMetric {
  label: string;
  value: string;
  dir: Dir;
}

export interface GoalVerdict {
  tone: LensTone;
  headline: string;
  reason: string;
  metrics: LensMetric[];
}

export interface LensInput {
  goal: FocusGoal;
  perWeek: number;
  streak: number;
  readiness01: number | null;
  restWarningHigh: boolean;
  strengthUp: number;
  plateau: number;
  recordsCount: number;
  volumePercent: number | null;
  endurance?: CapacityProgress;
  speed?: CapacityProgress;
  cardioKm: number;
}

const HEADLINE: Record<LensTone, string> = {
  get great() { return L("Отличная динамика", "Great momentum"); },
  get on_track() { return L("В целом идёшь по плану", "On track overall"); },
  get attention() { return L("Есть над чем поработать", "Room to improve"); },
};

const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)}%`;

/** Метрика из качества (выносливость/скорость): дельта% и направление. */
function capMetric(label: string, c: CapacityProgress | undefined): LensMetric {
  if (!c || !c.hasData) return { label, value: "—", dir: "none" };
  const dir: Dir = c.direction;
  const value = c.deltaPercent != null && c.direction !== "flat" ? pct(c.deltaPercent) : L("стабильно", "steady");
  return { label, value, dir };
}

export function goalVerdict(x: LensInput): GoalVerdict {
  let v: GoalVerdict;
  switch (x.goal) {
    case "strength":
      v = strengthVerdict(x);
      break;
    case "muscle":
      v = muscleVerdict(x);
      break;
    case "endurance":
      v = enduranceVerdict(x);
      break;
    case "weight_loss":
      v = weightVerdict(x);
      break;
  }
  // Готовность-оверлей: при низкой — не даём «отлично» и добавляем совет.
  const lowReady = x.restWarningHigh || (x.readiness01 != null && x.readiness01 < 0.4);
  if (lowReady) {
    if (v.tone === "great") v.tone = "on_track";
    v.reason += " " + L("Готовность снижена — заложи восстановление или разгрузку.", "Readiness is down — plan recovery or a deload.");
  }
  v.headline = HEADLINE[v.tone];
  return v;
}

function strengthVerdict(x: LensInput): GoalVerdict {
  const metrics: LensMetric[] = [
    { label: L("Растут в силе", "Gaining strength"), value: `${x.strengthUp} ${L("упр.", "ex.")}`, dir: x.strengthUp > 0 ? "up" : "none" },
    { label: L("Плато", "Plateau"), value: `${x.plateau}`, dir: x.plateau > 0 ? "down" : "none" },
    { label: L("Рекорды", "Records"), value: `${x.recordsCount}`, dir: x.recordsCount > 0 ? "up" : "none" },
  ];
  let tone: LensTone;
  let reason: string;
  if (x.strengthUp >= 2 && x.plateau <= x.strengthUp) {
    tone = "great";
    reason = L(`Сила прибавляет: ${x.strengthUp} упр. растут${x.recordsCount ? `, ${x.recordsCount} новых рекордов` : ""}.`, `Strength is climbing: ${x.strengthUp} exercises rising${x.recordsCount ? `, ${x.recordsCount} new records` : ""}.`);
  } else if (x.strengthUp >= 1) {
    tone = "on_track";
    reason = L(`Рост есть (${x.strengthUp} упр.)${x.plateau ? `, но ${x.plateau} в плато — следи за ними` : ""}.`, `Some growth (${x.strengthUp} ex.)${x.plateau ? `, but ${x.plateau} on a plateau — watch them` : ""}.`);
  } else {
    tone = "attention";
    reason = x.plateau > 0
      ? L(`Сила стоит: ${x.plateau} упр. в плато — смени схему или добавь вес.`, `Strength has stalled: ${x.plateau} ex. plateaued — change the scheme or add weight.`)
      : L("Пока мало силового прогресса — добавь рабочих подходов или вес.", "Little strength progress yet — add working sets or weight.");
  }
  return { tone, headline: "", reason, metrics };
}

function muscleVerdict(x: LensInput): GoalVerdict {
  const vp = x.volumePercent;
  const metrics: LensMetric[] = [
    { label: L("Тоннаж", "Tonnage"), value: vp == null ? "—" : pct(vp), dir: vp == null ? "none" : vp > 2 ? "up" : vp < -2 ? "down" : "flat" },
    { label: L("В неделю", "Per week"), value: `${x.perWeek.toFixed(1)}`, dir: "none" },
    { label: L("Растут", "Rising"), value: `${x.strengthUp} ${L("упр.", "ex.")}`, dir: x.strengthUp > 0 ? "up" : "none" },
  ];
  let tone: LensTone;
  let reason: string;
  if (vp == null) {
    tone = x.perWeek >= 3 ? "on_track" : "attention";
    reason = L("Копим объём. Для роста мышц важны стабильные подходы и частота.", "Building volume. Muscle growth needs steady sets and frequency.");
  } else if (vp >= 5) {
    tone = "great";
    reason = L(`Объём растёт (${pct(vp)}) — мышцы получают стимул.`, `Volume is up (${pct(vp)}) — muscles are getting stimulus.`);
  } else if (vp >= -5) {
    tone = "on_track";
    reason = L("Объём держится. Чтобы расти — добавляй подходы или частоту.", "Volume is holding. To grow, add sets or frequency.");
  } else {
    tone = "attention";
    reason = L(`Объём просел на ${Math.abs(Math.round(vp))}% — маловато стимула для роста.`, `Volume dropped ${Math.abs(Math.round(vp))}% — too little stimulus to grow.`);
  }
  return { tone, headline: "", reason, metrics };
}

function enduranceVerdict(x: LensInput): GoalVerdict {
  const metrics: LensMetric[] = [
    capMetric(L("Выносливость", "Endurance"), x.endurance),
    capMetric(L("Темп бега", "Run pace"), x.speed),
    { label: L("Кардио", "Cardio"), value: `${x.cardioKm.toFixed(1).replace(".", L(",", "."))} ${L("км", "km")}`, dir: x.cardioKm > 0 ? "up" : "none" },
  ];
  const ups = [x.endurance, x.speed].filter((c) => c?.hasData && c.direction === "up").length;
  let tone: LensTone;
  let reason: string;
  if (ups >= 2) {
    tone = "great";
    reason = L("Кардио-форма растёт: и выносливость, и темп идут вверх.", "Cardio is improving: both endurance and pace are up.");
  } else if (ups >= 1) {
    tone = "on_track";
    reason = L("Кардио прогрессирует, но пока без скачка по обоим фронтам.", "Cardio is progressing, but no jump on both fronts yet.");
  } else if (x.cardioKm > 0) {
    tone = "on_track";
    reason = L("Кардио есть, но роста выносливости пока не видно — добавь объём или темп.", "You do cardio, but no endurance gain yet — add volume or pace.");
  } else {
    tone = "attention";
    reason = L("Маловато кардио для выносливости — добавь пробежек или минут.", "Too little cardio for endurance — add runs or minutes.");
  }
  return { tone, headline: "", reason, metrics };
}

function weightVerdict(x: LensInput): GoalVerdict {
  const metrics: LensMetric[] = [
    { label: L("Регулярность", "Consistency"), value: `${x.perWeek.toFixed(1)}/${L("нед", "wk")}`, dir: x.perWeek >= 3 ? "up" : "flat" },
    { label: L("Кардио", "Cardio"), value: `${x.cardioKm.toFixed(1).replace(".", L(",", "."))} ${L("км", "km")}`, dir: x.cardioKm > 0 ? "up" : "none" },
    { label: L("Серия", "Streak"), value: `${x.streak} ${L("дн.", "d")}`, dir: x.streak >= 2 ? "up" : "none" },
  ];
  let tone: LensTone;
  let reason: string;
  if (x.perWeek >= 3 && x.cardioKm > 0) {
    tone = "great";
    reason = L(`Держишь ритм (${x.perWeek.toFixed(1)}/нед) и кардио — база для снижения веса есть.`, `Holding a rhythm (${x.perWeek.toFixed(1)}/wk) plus cardio — a solid base for losing weight.`);
  } else if (x.perWeek >= 2) {
    tone = "on_track";
    reason = L("Регулярность неплохая. Добавь кардио — жиросжигание пойдёт быстрее.", "Consistency is decent. Add cardio to burn fat faster.");
  } else {
    tone = "attention";
    reason = L("Для снижения веса важнее всего постоянство — держи 3+ активности в неделю.", "For weight loss, consistency matters most — keep 3+ activities a week.");
  }
  reason += " " + L("Вес и питание подтянутся с интеграцией Forma.", "Weight and nutrition will follow with the Forma integration.");
  return { tone, headline: "", reason, metrics };
}
