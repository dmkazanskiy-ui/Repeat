import { createTheme } from "@mui/material/styles";
import { MODE } from "./lib/themeMode";
import { DARK_BG, LIGHT_BG } from "./lib/telegram";

const DARK = {
  mode: "dark" as const,
  primary: { main: "#4ade80", contrastText: "#06210f" },
  background: { default: DARK_BG, paper: "#171c24" },
  text: { primary: "#eef2f7", secondary: "#94a3b3" },
  divider: "#2b3441",
  error: { main: "#f87171" },
};

// Светлая: тот же характер (зелёный акцент, мягкие скругления), но акцент
// глубже — неон на белом не читается. Белые карточки на чуть серой подложке.
const LIGHT = {
  mode: "light" as const,
  primary: { main: "#16a34a", contrastText: "#ffffff" },
  background: { default: LIGHT_BG, paper: "#ffffff" },
  text: { primary: "#0f172a", secondary: "#5b6676" },
  divider: "#e2e8f0",
  error: { main: "#dc2626" },
  success: { main: "#16a34a" },
  warning: { main: "#d97706" },
};

const PALETTE = MODE === "light" ? LIGHT : DARK;

/**
 * Появление карточек — Blur Fade из Magic UI: из размытия 6px и сдвига 6px
 * за 0,4 с. Соседние карточки идут лесенкой по 40 мс (переменная --rp-d
 * ставится по номеру среди соседей, см. index.css).
 */
export const CARD_IN = "rp-blur-fade .4s cubic-bezier(.16,1,.3,1) var(--rp-d, 0ms) both";

/**
 * Material 3, но подкрученный: скругления мягче стандартных, плотность выше,
 * заглавные буквы на кнопках отключены. Цель — чтобы приложение читалось
 * современно и на Android, и на iPhone, а не как «андроид на айфоне».
 */
export const theme = createTheme({
  palette: PALETTE,
  shape: { borderRadius: 14 },
  typography: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    button: { textTransform: "none", fontWeight: 600 },
    h1: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" },
    h2: { fontSize: 18, fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // Нативные контролы (каретка, пикеры, автозаполнение) берут цвета из
        // color-scheme. Без этого WebView Telegram на iOS рисует каретку
        // под системную тему — в светлой теме приложения она белая на белом.
        html: { colorScheme: MODE },
        "input, textarea, [contenteditable]": { caretColor: PALETTE.primary.main },
      },
    },
    MuiInputBase: {
      styleOverrides: { input: { caretColor: PALETTE.primary.main } },
    },
    // ── Контролы в духе shadcn/ui: одна высота, одно скругление, нейтральные
    // «outline»/«ghost», акцент только у главного действия, кольцо фокуса. ──
    MuiButtonBase: { defaultProps: { disableRipple: true } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 12,
          minHeight: 44,
          paddingInline: 16,
          fontWeight: 600,
          transition: "background-color .15s, border-color .15s, transform .15s",
          "&:active": { transform: "scale(.98)" },
          "&.Mui-focusVisible": { boxShadow: `0 0 0 3px ${PALETTE.primary.main}55` },
        },
        sizeSmall: { minHeight: 36, borderRadius: 10, paddingInline: 12 },
        // outline: нейтральная рамка и обычный текст — не зелёная обводка.
        outlined: {
          borderColor: PALETTE.divider,
          "&:not(.MuiButton-colorError)": { color: PALETTE.text.primary },
          "&:hover": { borderColor: PALETTE.divider, backgroundColor: MODE === "light" ? "rgba(15,23,42,0.04)" : "rgba(238,242,247,0.06)" },
        },
        text: { "&:hover": { backgroundColor: MODE === "light" ? "rgba(15,23,42,0.04)" : "rgba(238,242,247,0.06)" } },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { borderRadius: 12, "&.Mui-focusVisible": { boxShadow: `0 0 0 3px ${PALETTE.primary.main}55` } },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          "& .MuiOutlinedInput-notchedOutline": { borderColor: PALETTE.divider },
          "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: PALETTE.text.secondary },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderWidth: 1.5, borderColor: PALETTE.primary.main },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 999, fontWeight: 600 },
        outlined: { borderColor: PALETTE.divider },
      },
    },
    // Сегменты: подложка и «поднятая» выбранная кнопка, без рамок между ними.
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: {
          padding: 3,
          gap: 2,
          borderRadius: 999,
          backgroundColor: MODE === "light" ? "rgba(15,23,42,0.05)" : "rgba(238,242,247,0.06)",
        },
        grouped: {
          border: 0,
          borderRadius: "999px !important",
          margin: 0,
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          border: 0,
          borderRadius: 999,
          textTransform: "none",
          fontWeight: 600,
          color: PALETTE.text.secondary,
          "&.Mui-selected, &.Mui-selected:hover": {
            backgroundColor: MODE === "light" ? "#ffffff" : "rgba(238,242,247,0.14)",
            color: PALETTE.text.primary,
            boxShadow: MODE === "light" ? "0 1px 2px rgba(15,23,42,0.12)" : "none",
          },
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: { width: 46, height: 28, padding: 0, margin: 8 },
        switchBase: {
          padding: 3,
          "&.Mui-checked": { transform: "translateX(18px)", color: "#fff" },
          "&.Mui-checked + .MuiSwitch-track": { opacity: 1, backgroundColor: PALETTE.primary.main },
        },
        thumb: { width: 22, height: 22, boxShadow: "0 1px 2px rgba(0,0,0,0.25)", color: "#fff" },
        track: { borderRadius: 999, opacity: 1, backgroundColor: MODE === "light" ? "rgba(15,23,42,0.16)" : "rgba(238,242,247,0.18)" },
      },
    },
    MuiTab: { styleOverrides: { root: { textTransform: "none", fontWeight: 600 } } },
    MuiDivider: { styleOverrides: { root: { borderColor: PALETTE.divider } } },
    MuiSnackbarContent: { styleOverrides: { root: { borderRadius: 14 } } },
    // Поверхности по эталону «Обзора»: карточка 22, плитка внутри 14, иконка 12.
    // Карточка — p 2 (16) и тонкая рамка; плитка — фон action.hover без рамки, p 1.5;
    // между плитками gap 1 (8), между карточками 12. Цвет — в содержимом, не в фоне.
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: "none" }, outlined: { borderRadius: 22, animation: CARD_IN } },
    },
    MuiMenu: { styleOverrides: { paper: { borderRadius: 14 } } },
    MuiTextField: { defaultProps: { size: "small" } },
    MuiDialog: {
      styleOverrides: {
        // Диалоги на телефоне ведут себя как шторки — привычнее и ближе к краю пальца.
        paper: { margin: 12, width: "calc(100% - 24px)", maxHeight: "85vh", borderRadius: 22 },
      },
    },
  },
});
