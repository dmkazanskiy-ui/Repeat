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
// Входные анимации — только при запуске; потом вкладки переключаются мгновенно.
document.documentElement.classList.add("rp-intro");
window.setTimeout(() => document.documentElement.classList.remove("rp-intro"), 1200);

// Приложение открыли посреди выкладки (или со старым кэшем): старая сборка
// просит уже удалённый кусок (лента, пост) — один раз перезагружаемся на новую.
window.addEventListener("vite:preloadError", (e) => {
  try {
    if (sessionStorage.getItem("repeat_reloaded_for_update")) return;
    sessionStorage.setItem("repeat_reloaded_for_update", "1");
  } catch {
    /* без хранилища — всё равно попробуем перезагрузиться */
  }
  e.preventDefault();
  window.location.reload();
});
window.setTimeout(() => {
  try {
    sessionStorage.removeItem("repeat_reloaded_for_update");
  } catch {
    /* нечего чистить */
  }
}, 15000);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
