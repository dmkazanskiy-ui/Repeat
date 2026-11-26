// Светлая и тёмная тема. Режим вычисляется один раз при запуске — до того,
// как модули соберут свои цветовые константы, — поэтому смена темы
// перезапускает приложение (данные в IndexedDB, ничего не теряется).
//
// «Авто» внутри Telegram следует теме Telegram (её пользователь и считает
// системной), в браузере — prefers-color-scheme.

export type ThemePref = "auto" | "light" | "dark";
export type Mode = "light" | "dark";

const KEY = "repeat_theme";

export function loadThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function saveThemePref(pref: ThemePref): void {
  try {
    if (pref === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* приватный режим — останется авто */
  }
}

export function systemMode(): Mode {
  if (typeof window === "undefined") return "dark";
  const tg = window.Telegram?.WebApp;
  if (tg?.initData && tg.colorScheme) return tg.colorScheme;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function resolveMode(pref: ThemePref): Mode {
  return pref === "auto" ? systemMode() : pref;
}

/** Режим этого запуска. */
export const MODE: Mode = typeof window === "undefined" ? "dark" : resolveMode(loadThemePref());

/**
 * Неоновые акценты придуманы под тёмный фон; на белом они не читаются.
 * В светлой теме — те же оттенки, но глубже (контраст ≥ 3:1 к белому).
 */
const LIGHT: Record<string, string> = {
  "#4ade80": "#16a34a", // зелёный акцент
  "#a78bfa": "#7c3aed", // силовая
  "#f472b6": "#db2777", // кардио
  "#38bdf8": "#0284c7", // восстановление
  "#fb923c": "#ea580c", // задания
  "#f59e0b": "#d97706", // янтарь (плато, откат)
  "#f87171": "#dc2626", // ошибки
  "#2dd4bf": "#0d9488",
  "#facc15": "#ca8a04", // велосипед
  "#22d3ee": "#0891b2", // плавание
  "#94a3b3": "#64748b",
  "#94a3b8": "#64748b",
};

/** Цвет акцента для текущей темы. */
export function ink(hex: string): string {
  return MODE === "light" ? (LIGHT[hex.toLowerCase()] ?? hex) : hex;
}

/** Системная тема поменялась, пока приложение открыто (только для «Авто»). */
export function onSystemModeChange(cb: () => void): () => void {
  const tg = window.Telegram?.WebApp;
  const mq = window.matchMedia?.("(prefers-color-scheme: light)");
  const handler = () => cb();
  if (tg?.initData && tg.onEvent) {
    tg.onEvent("themeChanged", handler);
    return () => tg.offEvent?.("themeChanged", handler);
  }
  mq?.addEventListener?.("change", handler);
  return () => mq?.removeEventListener?.("change", handler);
}
