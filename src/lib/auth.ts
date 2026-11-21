// Аккаунт Repeat = аккаунт Telegram. Каналы входа — только ключи к нему:
//  • внутри Telegram — подпись initData (каждое открытие, без хранения);
//  • в браузере — вход через бота: сайт берёт одноразовый код, человек
//    открывает t.me/<бот>?start=login_<код> и жмёт «Войти» в чате, сайт
//    получает сессионный токен и хранит его в localStorage.
// Новый способ входа (почта, Google…) должен так же выдавать сессию на уже
// существующий Telegram id, а не заводить отдельный аккаунт.

import { useSyncExternalStore } from "react";
import { del, keys } from "./db";

const TOKEN_KEY = "repeat_session";
const LOGOUT_NOTICE = "repeat_logged_out";

export interface Me {
  id: string;
  username: string;
  name: string;
  via: "tg" | "web";
}

interface AccountState {
  /** Есть чем подписать запрос к серверу (initData или токен). */
  authed: boolean;
  me: Me | null;
  admin: boolean;
}

function readToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function initData(): string {
  return typeof window === "undefined" ? "" : (window.Telegram?.WebApp?.initData ?? "");
}

let state: AccountState = { authed: Boolean(initData() || readToken()), me: null, admin: false };
const listeners = new Set<() => void>();
function setState(next: Partial<AccountState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function useAccount(): AccountState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Заголовок Authorization для API или null, если входа нет. */
export function authHeader(): string | null {
  const d = initData();
  if (d) return `tma ${d}`;
  const t = readToken();
  return t ? `Bearer ${t}` : null;
}

export function authAvailable(): boolean {
  return authHeader() != null;
}

export function inTelegram(): boolean {
  return Boolean(initData());
}

/** Сервер не принял веб-сессию (истекла, отозвана, человек заблокирован). */
export function sessionLost(): void {
  if (inTelegram()) return;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ничего */
  }
  setState({ authed: false, me: null, admin: false });
}

function platform(): string {
  const tg = window.Telegram?.WebApp as { platform?: string } | undefined;
  if (inTelegram()) return `tg:${tg?.platform ?? "unknown"}`.slice(0, 24);
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? "ios" : /Android/.test(ua) ? "android" : /Mac/.test(ua) ? "mac" : /Windows/.test(ua) ? "windows" : "other";
  return `web:${os}`;
}

/** Открытие приложения: отметить посещение, узнать, кто я и есть ли админка. */
export async function hello(): Promise<void> {
  const auth = authHeader();
  if (!auth) return;
  try {
    const res = await fetch("/api/hello", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({ platform: platform() }),
    });
    if (res.status === 401 || res.status === 403) {
      sessionLost();
      return;
    }
    if (!res.ok) return;
    const body = (await res.json()) as { me: Me; admin: boolean };
    setState({ me: body.me, admin: body.admin });
  } catch {
    /* офлайн — попробуем при следующем открытии */
  }
}

// ───────────── Вход в браузере через бота ─────────────

export interface LoginStart {
  code: string;
  url: string;
  ttl: number;
}

export async function startWebLogin(): Promise<LoginStart> {
  const res = await fetch("/api/auth/web/start", { method: "POST" });
  if (!res.ok) throw new Error(res.status === 503 ? "bot" : `http ${res.status}`);
  return (await res.json()) as LoginStart;
}

export type LoginPoll = "pending" | "denied" | "expired" | "ok";

/** Спросить, подтвердил ли человек вход в боте. При «ok» токен уже сохранён. */
export async function pollWebLogin(code: string): Promise<LoginPoll> {
  const res = await fetch("/api/auth/web/poll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, platform: platform() }),
  });
  if (!res.ok) throw new Error(`http ${res.status}`);
  const body = (await res.json()) as { status: LoginPoll; token?: string };
  if (body.status === "ok" && body.token) {
    try {
      localStorage.setItem(TOKEN_KEY, body.token);
    } catch {
      throw new Error("storage");
    }
    setState({ authed: true });
  }
  return body.status;
}

/**
 * Выйти в браузере. Данные остаются в аккаунте на сервере, а с этого
 * устройства стираются — чтобы следующий вошедший не смешал их со своими.
 */
export async function logout(): Promise<void> {
  const auth = authHeader();
  if (auth && !inTelegram()) {
    await fetch("/api/auth/logout", { method: "POST", headers: { Authorization: auth } }).catch(() => null);
  }
  for (const key of await keys()) await del(key);
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.setItem(LOGOUT_NOTICE, "1");
  } catch {
    /* ничего */
  }
  window.location.reload();
}

/** Показать ли после перезагрузки «вы вышли» (читается один раз). */
export function takeLogoutNotice(): boolean {
  try {
    const v = localStorage.getItem(LOGOUT_NOTICE);
    localStorage.removeItem(LOGOUT_NOTICE);
    return v === "1";
  } catch {
    return false;
  }
}

// ───────────── Админка ─────────────

export async function adminFetch<T>(path: string, body?: unknown): Promise<T> {
  const auth = authHeader();
  if (!auth) throw new Error("auth");
  const res = await fetch(`/api/admin/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: auth, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(res.status === 403 ? "forbidden" : `http ${res.status}`);
  return (await res.json()) as T;
}
