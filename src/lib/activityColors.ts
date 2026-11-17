// Акцентный цвет по типу активности — для тега, иконки, левой линии и лёгкой
// подложки карточки. Намеренно приглушённые тона (хорошо лежат на тёмном фоне).
//
// Важно: эта палитра — ТОЛЬКО про идентичность вида на карточках/таймлайне.
// Графики и аналитика остаются на одном зелёном акценте (наша айдентика).

import type { SessionKind } from "./types";
import { ink } from "./themeMode";

/** Основной цвет вида. Мобилити = наш зелёный primary. */
export const TYPE_COLOR: Record<SessionKind, string> = {
  strength: ink("#a78bfa"), // фиолетовый
  cardio: ink("#f472b6"), // розовый
  mobility: ink("#4ade80"), // зелёный (наш акцент)
  recovery: ink("#38bdf8"), // голубой
  wod: ink("#fb923c"), // оранжевый — задания/WOD и HYROX
};

export function typeColor(kind: SessionKind): string {
  return TYPE_COLOR[kind];
}
