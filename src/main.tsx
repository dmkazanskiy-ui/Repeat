import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initTelegram } from "./lib/telegram";
import { applyTextScale, initPressableKeys, loadTextScale } from "./lib/a11y";

initTelegram();
initPressableKeys();
applyTextScale(loadTextScale());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
