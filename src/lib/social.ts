// Соцчасть: публичный профиль и лента (сервер — deploy/sync/server.py, раздел social).
//
// Всё по согласию: профиль и тренировки видны другим только после того, как
// человек сам включил «Публичный профиль» (с отдельным согласием на
// распространение). На сервер уходит слепок тренировки без заметок, пульса,
// калорий, веса тела и самочувствия. Telegram id наружу не уходит.

import { useSyncExternalStore } from "react";
import { authHeader } from "./auth";
import {
  SESSION_LABELS,
  activityIcon,
  activityLabel,
  exerciseName,
  sessionDurationSec,
  sessionSetCount,
  sessionVolume,
} from "./types";
import type { Exercise, Session, SessionKind, WorkoutPhoto } from "./types";

export const ACTIVITIES = [
  { id: "strength", ru: "Силовые", en: "Strength" },
  { id: "run", ru: "Бег", en: "Running" },
  { id: "bike", ru: "Велосипед", en: "Cycling" },
  { id: "swim", ru: "Плавание", en: "Swimming" },
  { id: "walk", ru: "Ходьба", en: "Walking" },
  { id: "hiit", ru: "HIIT", en: "HIIT" },
  { id: "crossfit", ru: "Кроссфит", en: "CrossFit" },
  { id: "mobility", ru: "Йога и мобилити", en: "Yoga & mobility" },
  { id: "boxing", ru: "Единоборства", en: "Combat sports" },
  { id: "climb", ru: "Скалолазание", en: "Climbing" },
  { id: "team", ru: "Командные виды", en: "Team sports" },
  { id: "recovery", ru: "Восстановление", en: "Recovery" },
] as const;
export type ActivityId = (typeof ACTIVITIES)[number]["id"];

export interface MyProfile {
  pid: string;
  public: boolean;
  name: string;
  bio: string;
  acts: ActivityId[];
  av: number;
}

export interface Author {
  pid: string;
  name: string;
  av: number;
}

export interface Snap {
  kind: SessionKind | "hiit";
  title: string;
  icon: string;
  date: string;
  time: string;
  durationSec: number | null;
  volume: number | null;
  distanceM: number | null;
  sets: number | null;
  exercises: { name: string; sets: { w: number | null; r: number | null; wu?: boolean }[] }[];
  photos?: WorkoutPhoto[];
}

export interface Post {
  id: string;
  t: number;
  author: Author;
  mine: boolean;
  snap: Snap;
  likes: number;
  liked: boolean;
  comments: number;
  commentList?: { id: string; t: number; text: string; author: Author; mine: boolean }[];
}

export interface PublicProfile {
  pid: string;
  name: string;
  bio: string;
  acts: ActivityId[];
  av: number;
  mine: boolean;
  posts: number;
  likes: number;
  followers: number;
  following: number;
  followed: boolean;
}

export const photoUrl = (id: string) => `/api/social/photo/${id}.jpg`;

export async function uploadPhoto(dataUrl: string, w: number, h: number): Promise<WorkoutPhoto> {
  return api<WorkoutPhoto>("photo", { data: dataUrl, w, h });
}
export function deletePhoto(id: string): Promise<unknown> {
  return api("photo/delete", { id }).catch(() => null);
}

export function avatarUrl(a: { pid: string; av: number } | null | undefined): string | null {
  return a && a.av ? `/api/social/avatar/${a.pid}.jpg?v=${a.av}` : null;
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const auth = authHeader();
  if (!auth) throw new Error("auth");
  const res = await fetch(`/api/social/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: auth, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let code = `http ${res.status}`;
    try {
      code = ((await res.json()) as { error?: string }).error ?? code;
    } catch {
      /* без тела */
    }
    throw new Error(code);
  }
  return (await res.json()) as T;
}

// ───────────── Мой профиль (общий стор) ─────────────

let me: MyProfile | null = null;
const listeners = new Set<() => void>();
function setMe(next: MyProfile | null) {
  me = next;
  listeners.forEach((l) => l());
}
export function useMyProfile(): MyProfile | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => me,
  );
}
export async function loadMyProfile(): Promise<MyProfile | null> {
  try {
    setMe(await api<MyProfile>("me"));
  } catch {
    /* офлайн или без входа */
  }
  return me;
}
export async function saveProfile(patch: Partial<MyProfile> & { consent?: boolean }): Promise<MyProfile> {
  const next = await api<MyProfile>("profile", patch);
  setMe(next);
  return next;
}
export async function uploadAvatar(dataUrl: string): Promise<MyProfile> {
  const next = await api<MyProfile>("avatar", { data: dataUrl });
  setMe(next);
  return next;
}

// ───────────── Лента ─────────────

export const fetchFeed = (offset = 0, pid?: string) =>
  api<{ posts: Post[]; more: boolean }>(`feed?offset=${offset}${pid ? `&pid=${encodeURIComponent(pid)}` : ""}`);
export const fetchPost = (id: string) => api<Post>(`post/${encodeURIComponent(id)}`);
export const fetchProfile = (pid: string) => api<PublicProfile>(`profile/${encodeURIComponent(pid)}`);
export const setLike = (post: string, on: boolean) => api<{ likes: number; liked: boolean }>("like", { post, on });
export const addComment = (post: string, text: string) => api<Post>("comment", { post, text });
export const deleteComment = (post: string, id: string) => api<Post>("comment/delete", { post, id });
export const setFollow = (pid: string, on: boolean) => api<PublicProfile>("follow", { pid, on });
export const deletePost = (post: string) => api<{ ok: true }>("post/delete", { post });

// ───────────── Публикация своих тренировок ─────────────

/** Сколько последних тренировок держим в ленте. */
const SHARE_DAYS = 90;
const SHARE_MAX = 60;

/** Обезличенный слепок для ленты — только то, что про сами тренировки. */
export function toSnap(s: Session, exercises: Exercise[]): Snap {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const dist = s.kind === "cardio" ? (s.cardio?.distanceM ?? null) : null;
  return {
    kind: s.kind,
    title: s.title || activityLabel(s) || SESSION_LABELS[s.kind],
    icon: String(activityIcon(s) ?? ""),
    date: s.date,
    time: s.time ?? "",
    durationSec: sessionDurationSec(s),
    volume: s.kind === "strength" ? sessionVolume(s) || null : null,
    distanceM: dist,
    sets: s.kind === "strength" ? sessionSetCount(s) : null,
    exercises:
      s.kind === "strength"
        ? s.exercises.map((ex) => ({
            name: exerciseName(byId.get(ex.exerciseId)),
            sets: ex.sets
              .filter((st) => st.done || st.weight != null || st.reps != null)
              .map((st) => ({ w: st.weight, r: st.reps, ...(st.warmup ? { wu: true } : {}) })),
          }))
        : [],
    photos: (s.photos ?? []).slice(0, 10),
  };
}

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Какие тренировки сейчас должны быть в ленте: завершённые, не скрытые, свежие. */
export function shareable(sessions: Session[]): Session[] {
  const from = new Date(Date.now() - SHARE_DAYS * 86400_000).toISOString().slice(0, 10);
  return sessions
    .filter((s) => s.endedAt && !s.feedHidden && s.date >= from)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, SHARE_MAX);
}

let syncing = false;
/** Привести ленту в соответствие с тренировками: добавить новые/изменённые, убрать лишние. */
export async function syncFeed(sessions: Session[], exercises: Exercise[]): Promise<boolean> {
  if (syncing || !me?.public) return false;
  syncing = true;
  try {
    const { posts } = await api<{ posts: Record<string, string> }>("published");
    const want = new Map(shareable(sessions).map((s) => {
      const snap = toSnap(s, exercises);
      return [s.id, { snap, hash: hash(JSON.stringify(snap)) }];
    }));
    const upsert = [...want.entries()]
      .filter(([sid, w]) => posts[sid] !== w.hash)
      .map(([sid, w]) => ({ sid, snap: w.snap, hash: w.hash }));
    const remove = Object.keys(posts).filter((sid) => !want.has(sid));
    if (upsert.length || remove.length) {
      await api("publish", { upsert, remove });
      return true;
    }
    return false;
  } catch {
    return false; // попробуем при следующем обмене
  } finally {
    syncing = false;
  }
}
