import { createTheme } from "@mui/material/styles";

/**
 * Material 3, но подкрученный: скругления мягче стандартных, плотность выше,
 * заглавные буквы на кнопках отключены. Цель — чтобы приложение читалось
 * современно и на Android, и на iPhone, а не как «андроид на айфоне».
 */
export const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#4ade80", contrastText: "#06210f" },
    background: { default: "#0e1116", paper: "#171c24" },
    text: { primary: "#eef2f7", secondary: "#94a3b3" },
    divider: "#2b3441",
    error: { main: "#f87171" },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    button: { textTransform: "none", fontWeight: 600 },
    h1: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" },
    h2: { fontSize: 18, fontWeight: 600 },
  },
  components: {
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
