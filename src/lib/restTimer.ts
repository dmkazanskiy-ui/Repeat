/**
 * Настройки таймера отдыха между подходами.
 *
 * Живут в localStorage, а не в AppData: это настройка устройства (на телефоне
 * в зале таймер нужен, на десктопе при разборе истории — мешает), и её чтение
 * должно быть синхронным в момент старта отдыха.
 */

const SEC_KEY = "repeat_rest_sec";
const ON_KEY = "repeat_rest_on";

export const DEFAULT_REST_SEC = 90;
export const MIN_REST_SEC = 15;
export const MAX_REST_SEC = 600;

export function clampRestSec(sec: number): number {
  return Math.max(MIN_REST_SEC, Math.min(MAX_REST_SEC, Math.round(sec)));
}

export function loadRestSec(): number {
  try {
    const value = Number(localStorage.getItem(SEC_KEY));
    if (value >= MIN_REST_SEC && value <= MAX_REST_SEC) return value;
  } catch {
    /* ignore */
  }
  return DEFAULT_REST_SEC;
}

export function saveRestSec(sec: number): void {
  try {
    localStorage.setItem(SEC_KEY, String(clampRestSec(sec)));
  } catch {
    /* ignore */
  }
}

/** По умолчанию таймер включён — выключается явно в настройках профиля. */
export function loadRestEnabled(): boolean {
  try {
    return localStorage.getItem(ON_KEY) !== "0";
  } catch {
    return true;
  }
}

export function saveRestEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ON_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}
