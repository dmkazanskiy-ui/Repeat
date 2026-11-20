// Конфетти как в Magic UI (canvas-confetti). Один короткий залп, без зацикливания.
import confetti from "canvas-confetti";
import { MODE } from "./themeMode";

const reduce =
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Наша палитра: зелёный акцент и цвета типов тренировок.
const COLORS =
  MODE === "light"
    ? ["#16a34a", "#7c3aed", "#db2777", "#0284c7", "#d97706"]
    : ["#4ade80", "#a78bfa", "#f472b6", "#38bdf8", "#f59e0b"];

/** Тренировка завершена — небольшой залп снизу по центру. */
export function celebrateFinish() {
  if (reduce) return;
  confetti({ particleCount: 70, spread: 70, startVelocity: 38, origin: { y: 0.85 }, colors: COLORS, zIndex: 2000 });
}

/** Новый личный рекорд — залпы с двух сторон (Side Cannons из Magic UI). */
export function celebrateRecord() {
  if (reduce) return;
  const end = Date.now() + 900;
  const frame = () => {
    if (Date.now() > end) return;
    confetti({ particleCount: 3, angle: 60, spread: 55, startVelocity: 60, origin: { x: 0, y: 0.6 }, colors: COLORS, zIndex: 2000 });
    confetti({ particleCount: 3, angle: 120, spread: 55, startVelocity: 60, origin: { x: 1, y: 0.6 }, colors: COLORS, zIndex: 2000 });
    requestAnimationFrame(frame);
  };
  frame();
}
