// Согласие на обработку персональных данных (включая сведения о здоровье).
// Даётся на последнем экране обучения; у тех, кто прошёл обучение раньше, —
// отдельным экраном. Без него приложение не открывается и не синхронизируется.
// Факт и время согласия хранятся локально и уходят на сервер записью
// settings/consent — это подтверждение, привязанное к аккаунту Telegram.

import { get, set } from "./db";

/** Поднять, если меняется текст согласия или политики: спросим заново. */
export const CONSENT_VERSION = 1;
export const CONSENT_URL = "consent.html";
export const PRIVACY_URL = "privacy.html";

export interface Consent {
  version: number;
  at: string; // ISO
}

const KEY = "consent";

export async function loadConsent(): Promise<Consent | null> {
  return (await get<Consent>(KEY)) ?? null;
}

export function saveConsent(c: Consent): Promise<void> {
  return set(KEY, c);
}

export function isConsentValid(c: Consent | null | undefined): c is Consent {
  return c != null && c.version >= CONSENT_VERSION;
}

/** Открыть документ: в Telegram — во встроенном браузере, иначе в новой вкладке. */
export function openDoc(path: string): void {
  const url = new URL(path, window.location.href).href;
  const tg = window.Telegram?.WebApp;
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank", "noopener");
}
