// Токены дизайн-системы Repeat. Эталон — карточка «Обзор» (analytics/OverviewCard).
// Меняется здесь — меняется везде, где экраны собраны из деталей src/ui.
export const radius = { card: "22px", tile: "14px", control: "12px", icon: "12px", pill: 999 } as const;
export const space = { card: 2, tile: 1.5, gap: 1, between: 1.5, section: 3 } as const;
export const text = {
  title: { fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" },
  label: { fontSize: 12, color: "text.secondary" },
  value: { fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2, fontVariantNumeric: "tabular-nums" },
  caption: { fontSize: 12, color: "text.secondary" },
} as const;

/**
 * Движение: кривые и длительности (по правилам Эмиля Ковальски).
 * Появление/исчезновение — easeOut; перемещение на экране — easeInOut;
 * шторки и окна — drawer. Интерфейс — до 300 мс, окна до 400.
 */
export const motion = {
  easeOut: "cubic-bezier(0.23, 1, 0.32, 1)",
  easeInOut: "cubic-bezier(0.77, 0, 0.175, 1)",
  drawer: "cubic-bezier(0.32, 0.72, 0, 1)",
  press: 160,
  fast: 200,
  base: 250,
  sheet: 400,
} as const;

/** Переход по свойству с общими токенами: t("transform") → "transform 200ms cubic-bezier(...)". */
export const tr = (prop: string, ms: number = motion.fast, ease: string = motion.easeOut) => `${prop} ${ms}ms ${ease}`;

/**
 * «Первое открытие»: входные анимации (карточки, плитки, цифры с нуля)
 * играют только в первые 1,5 с после запуска приложения, а не при каждом
 * переключении вкладки.
 */
const INTRO_UNTIL = typeof performance !== "undefined" ? performance.now() + 1500 : 0;
export const introActive = () => typeof performance !== "undefined" && performance.now() < INTRO_UNTIL;
