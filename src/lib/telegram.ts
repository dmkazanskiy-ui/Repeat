interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  disableVerticalSwipes?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  initData?: string;
  colorScheme?: "light" | "dark";
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
  app.setHeaderColor?.("#0e1116");
  app.setBackgroundColor?.("#0e1116");
}

export function isTelegram(): boolean {
  return Boolean(window.Telegram?.WebApp?.initData);
}
