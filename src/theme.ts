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
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { paddingBlock: 12 } },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
    MuiTextField: { defaultProps: { size: "small" } },
    MuiDialog: {
      styleOverrides: {
        // Диалоги на телефоне ведут себя как шторки — привычнее и ближе к краю пальца.
        paper: { margin: 12, width: "calc(100% - 24px)", maxHeight: "85vh" },
      },
    },
  },
});
