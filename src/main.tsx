import { MODE } from "./lib/themeMode";
import { DARK_BG, LIGHT_BG } from "./lib/telegram";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initTelegram } from "./lib/telegram";
import { applyTextScale, initPressableKeys, loadTextScale } from "./lib/a11y";

document.querySelector('meta[name="theme-color"]')?.setAttribute("content", MODE === "light" ? LIGHT_BG : DARK_BG);
initTelegram();
initPressableKeys();
applyTextScale(loadTextScale());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
