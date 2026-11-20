/**
 * Доступность «кликабельных карточек». Многие карточки — это <Box onClick>,
 * им проставлен role="button" и tabIndex={0}, чтобы VoiceOver называл их
 * кнопками, а фокус с клавиатуры до них доходил. Здесь — активация по
 * Enter/Space, как у настоящей кнопки, одним глобальным слушателем.
 */
export function initPressableKeys(): void {
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const el = event.target as HTMLElement | null;
    if (!el || el.getAttribute("role") !== "button") return;
    // Настоящие <button> и ссылки сами обрабатывают клавиши.
    if (el.tagName === "BUTTON" || el.tagName === "A" || el.tagName === "INPUT") return;
    event.preventDefault();
    el.click();
  });
}

/** Размер текста (масштаб интерфейса) — своя настройка, т.к. WebView Telegram
    не подхватывает системный размер шрифта iPhone. */
export type TextScale = 100 | 115 | 130;
const KEY = "repeat_text_scale";

export function loadTextScale(): TextScale {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v === 115 || v === 130 ? v : 100;
  } catch {
    return 100;
  }
}

export function applyTextScale(scale: TextScale): void {
  // zoom масштабирует и текст, и зоны нажатия — интерфейс растёт целиком,
  // без поломки вёрстки (WebKit поддерживает zoom).
  document.documentElement.style.setProperty("zoom", scale === 100 ? "" : `${scale}%`);
  // На самом крупном размере подписи таб-бара не влезают — остаются иконки.
  document.documentElement.dataset.textScale = String(scale);
  try {
    localStorage.setItem(KEY, String(scale));
  } catch {
    /* приватный режим — просто не запоминаем */
  }
}
