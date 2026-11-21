import { createTheme } from "@mui/material/styles";
import { MODE } from "./lib/themeMode";
import { motion } from "./ui/tokens";
import { SheetUp, ToastUp } from "./ui/transitions";
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
 * Появление карточек (Blur Fade). Играет только при первом открытии
 * приложения: класс html.rp-intro снимается через 1,2 с (main.tsx), а без
 * него переменная пуста и анимации нет — вкладки переключаются мгновенно.
 */
export const CARD_IN = "var(--rp-card-in, none)";

/**
 * Material 3, но подкрученный: скругления мягче стандартных, плотность выше,
 * заглавные буквы на кнопках отключены. Цель — чтобы приложение читалось
 * современно и на Android, и на iPhone, а не как «андроид на айфоне».
 */
/** Заливка полей ввода — та же, что у подложек сегментов и плиток. */
const FIELD = MODE === "light" ? "rgba(15,23,42,0.05)" : "rgba(238,242,247,0.06)";
const FIELD_HOVER = MODE === "light" ? "rgba(15,23,42,0.08)" : "rgba(238,242,247,0.09)";

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
          transition: `background-color ${motion.press}ms ease, border-color ${motion.press}ms ease, transform ${motion.press}ms ${motion.easeOut}`,
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
    MuiSnackbar: {
      defaultProps: { slots: { transition: ToastUp }, transitionDuration: { enter: motion.base, exit: motion.fast } },
    },
    MuiSnackbarContent: { styleOverrides: { root: { borderRadius: 14 } } },
    // Поверхности по эталону «Обзора»: карточка 22, плитка внутри 14, иконка 12.
    // Карточка — p 2 (16) и тонкая рамка; плитка — фон action.hover без рамки, p 1.5;
    // между плитками gap 1 (8), между карточками 12. Цвет — в содержимом, не в фоне.
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: "none" }, outlined: { borderRadius: 22, animation: CARD_IN } },
    },
    MuiMenu: { styleOverrides: { paper: { borderRadius: 14 } } },
    // Поля — как плитки: сплошная мягкая заливка без рамки, 12px, подпись внутри
    // сверху. Фокус — тонкое кольцо; подпись не перекрашиваем (текст — один цвет).
    MuiTextField: { defaultProps: { size: "small", variant: "filled" } },
    MuiFilledInput: {
      defaultProps: { disableUnderline: true },
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: FIELD,
          transition: `background-color ${motion.fast}ms ease, box-shadow ${motion.fast}ms ease`,
          "&:hover": { backgroundColor: FIELD_HOVER },
          "&.Mui-focused": { backgroundColor: FIELD, boxShadow: `inset 0 0 0 1.5px ${PALETTE.primary.main}` },
          "&.Mui-error": { boxShadow: `inset 0 0 0 1.5px ${PALETTE.error.main}` },
          "&.Mui-disabled": { backgroundColor: FIELD, opacity: 0.6 },
        },
        input: { borderRadius: 12 },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { color: PALETTE.text.secondary, "&.Mui-focused": { color: PALETTE.text.secondary } },
      },
    },
    MuiDialog: {
      defaultProps: { slots: { transition: SheetUp }, transitionDuration: { enter: motion.sheet, exit: motion.base } },
      styleOverrides: {
        // Диалоги на телефоне ведут себя как шторки — привычнее и ближе к краю пальца.
        paper: { margin: 12, width: "calc(100% - 24px)", maxHeight: "85vh", borderRadius: 22 },
      },
    },
  },
});
