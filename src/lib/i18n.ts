import { createContext, useContext } from "react";

// Лёгкий i18n: язык по телефону (РУ → ru, всё остальное → en), с ручным
// переключателем и сохранением выбора. Строки задаём инлайном `t(ru, en)` —
// удобно локализовать экраны инкрементально, без большого словаря ключей.

export type Lang = "ru" | "en";
const KEY = "repeat_lang";

/** Язык по умолчанию: телефон на русском → ru, иначе en. */
export function detectLang(): Lang {
  const nav =
    typeof navigator !== "undefined" ? (navigator.language || "ru") : "ru";
  return nav.toLowerCase().startsWith("ru") ? "ru" : "en";
}

/** Сохранённый выбор, иначе — по телефону. */
export function loadLang(): Lang {
  let lang: Lang;
  try {
    const saved = localStorage.getItem(KEY);
    lang = saved === "ru" || saved === "en" ? saved : detectLang();
  } catch {
    lang = detectLang();
  }
  current = lang;
  return lang;
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* ignore */
  }
}

// Модульный язык — для чистых функций и констант в lib (даты, лейблы), у
// которых нет доступа к React-контексту. App держит его в синхроне с состоянием.
let current: Lang = "ru";
export function getLang(): Lang {
  return current;
}
export function setCurrentLang(lang: Lang): void {
  current = lang;
}
/** Выбор строки по модульному языку — для не-React кода. */
export function L(ru: string, en: string): string {
  return current === "ru" ? ru : en;
}

export const LangContext = createContext<Lang>("ru");

export function useLang(): Lang {
  return useContext(LangContext);
}

/** Хук перевода: `const t = useT(); t("Профиль", "Profile")`. */
export function useT(): (ru: string, en: string) => string {
  const lang = useLang();
  return (ru, en) => (lang === "ru" ? ru : en);
}
