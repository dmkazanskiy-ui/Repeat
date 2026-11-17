import { MODE } from "./themeMode";

export const DARK_BG = "#0e1116";
export const LIGHT_BG = "#f4f6f9";

interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  disableVerticalSwipes?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  initData?: string;
  openLink?: (url: string) => void;
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
  colorScheme?: "light" | "dark";
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

/**
 * Подготовка Mini App внутри Telegram. Вне Telegram — тихо ничего не делает,
 * приложение остаётся обычной веб-страницей.
 *
 * Ключевое здесь — disableVerticalSwipes: без него Telegram закрывает окно
 * при протяжке вниз, а в приложении вертикальная прокрутка на каждом экране.
 */
export function initTelegram(): void {
  const app = window.Telegram?.WebApp;
  if (!app) return;

  app.ready();
  app.expand();
  app.disableVerticalSwipes?.();
  const bg = MODE === "light" ? LIGHT_BG : DARK_BG;
  app.setHeaderColor?.(bg);
  app.setBackgroundColor?.(bg);
}

export function isTelegram(): boolean {
  return Boolean(window.Telegram?.WebApp?.initData);
}

/** Короткая вибрация (в Telegram на iPhone). Вне Telegram — ничего. */
export function haptic(style: "light" | "medium" | "success" = "light"): void {
  const h = window.Telegram?.WebApp?.HapticFeedback;
  if (!h) return;
  if (style === "success") h.notificationOccurred("success");
  else h.impactOccurred(style);
}

/**
 * Системная кнопка «Назад» Telegram в шапке. Показываем, когда есть куда
 * возвращаться; обработчик — тот же, что у стрелки внутри экрана.
 */
export function setTelegramBack(handler: (() => void) | null): () => void {
  const back = window.Telegram?.WebApp?.BackButton;
  if (!back) return () => {};
  if (!handler) {
    back.hide();
    return () => {};
  }
  back.onClick(handler);
  back.show();
  return () => back.offClick(handler);
}
