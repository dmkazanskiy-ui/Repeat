// Подписи и цифры для слепка тренировки в ленте.
import { typeColor } from "../../lib/activityColors";
import { formatVolume } from "../../lib/format";
import type { Snap } from "../../lib/social";
import type { WorkoutPhoto } from "../../lib/types";

export function snapStats(snap: Snap, t: (ru: string, en: string) => string): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (snap.durationSec) {
    // Коротко, чтобы влезало в плитку на узком экране: «46 мин», «1 ч 20».
    const min = Math.round(snap.durationSec / 60);
    const value = min < 60 ? `${min} ${t("мин", "min")}` : `${Math.floor(min / 60)} ${t("ч", "h")} ${String(min % 60).padStart(2, "0")}`;
    out.push({ label: t("Время", "Time"), value });
  }
  if (snap.volume) out.push({ label: t("Тоннаж", "Tonnage"), value: formatVolume(snap.volume) });
  if (snap.distanceM) out.push({ label: t("Дистанция", "Distance"), value: `${(snap.distanceM / 1000).toFixed(snap.distanceM < 10000 ? 2 : 1).replace(".", ",")} ${t("км", "km")}` });
  if (snap.distanceM && snap.durationSec && snap.kind === "cardio") {
    const perKm = snap.durationSec / (snap.distanceM / 1000);
    if (perKm > 60 && perKm < 3600) out.push({ label: t("Темп", "Pace"), value: `${Math.floor(perKm / 60)}:${String(Math.round(perKm % 60)).padStart(2, "0")}/${t("км", "km")}` });
  }
  if (snap.sets) out.push({ label: t("Подходы", "Sets"), value: String(snap.sets) });
  if (snap.exercises.length && out.length < 3) out.push({ label: t("Упражнения", "Exercises"), value: String(snap.exercises.length) });
  return out.slice(0, 3);
}

export function setLine(sets: Snap["exercises"][number]["sets"]): string {
  const work = sets.filter((s) => !s.wu);
  if (work.length === 0) return "";
  const same = work.every((s) => s.w === work[0].w && s.r === work[0].r);
  const one = (s: (typeof work)[number]) => `${s.w ?? "—"}×${s.r ?? "—"}`;
  return same ? `${one(work[0])} · ${work.length}` : work.map(one).join(" · ");
}

export function kindColor(kind: Snap["kind"]): string {
  return typeColor(kind === "hiit" ? "wod" : kind);
}


/** Ширина / высота с ограничением: слишком высокие и слишком широкие подрезаем. */
export function photoRatio(p: WorkoutPhoto | undefined): number {
  if (!p?.w || !p?.h) return 4 / 5;
  return Math.min(1.91, Math.max(0.8, p.w / p.h));
}

