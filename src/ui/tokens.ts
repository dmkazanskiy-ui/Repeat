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
