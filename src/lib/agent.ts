// ИИ-помощник: ключи доступа к API/MCP и промпт для ручной вставки.
// Сервер — deploy/sync/agent.py. Ключ показывается один раз; на сервере
// хранится только его sha256. Всё, что ИИ присылает, попадает во «входящие»
// и записывается только после подтверждения в приложении.
import FORMAT_DOC from "../../deploy/sync/ai_format.md?raw";
import { authHeader } from "./auth";
import { exerciseName } from "./types";
import { lastWorkingWeight } from "./exerciseSuggest";
import { activePlan, goalLine, SLOT_LABELS } from "./plan";
import { addDays, today } from "./format";
import { L } from "./i18n";
import type { BodyEntry, Exercise, Plan, PlannedSession, Session, TrainingProgram } from "./types";

export type AgentScope = "read" | "write";

export interface AgentGrant {
  id: string;
  kind: "key" | "oauth";
  name: string;
  scope: AgentScope;
  created: number;
  used: number | null;
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const auth = authHeader();
  if (!auth) throw new Error("auth");
  const res = await fetch(`/api/agent/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: auth, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`http ${res.status}`);
  return (await res.json()) as T;
}

export const listGrants = () => call<{ grants: AgentGrant[] }>("keys").then((r) => r.grants);
export const createKey = (name: string, scope: AgentScope) => call<{ token: string; grant: AgentGrant }>("keys", { name, scope });
export const revokeGrant = (id: string) => call<{ ok: boolean }>("keys/revoke", { id });

/** Утренняя сводка из Garmin (только владелец ключа на сервере). */
export async function morningStatus(): Promise<{ available: boolean; lastDate: string | null; sent: boolean | null }> {
  const auth = authHeader();
  if (!auth) return { available: false, lastDate: null, sent: null };
  const res = await fetch("/api/morning/status", { headers: { Authorization: auth } });
  return res.ok ? res.json() : { available: false, lastDate: null, sent: null };
}

export async function morningRunNow(): Promise<{ ok: boolean; status?: string; error?: string }> {
  const auth = authHeader();
  if (!auth) return { ok: false, error: "auth" };
  const res = await fetch("/api/morning/run", { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: "{}" });
  return res.ok ? res.json() : { ok: false, error: `http ${res.status}` };
}

/** Адрес MCP-сервера для коннекторов Claude/ChatGPT. */
export function mcpUrl(): string {
  const origin = typeof location !== "undefined" && location.origin.startsWith("http") ? location.origin : "https://repeat.dm-kazanskiy.online";
  return `${origin}/api/mcp`;
}

export { FORMAT_DOC };

interface PromptData {
  sessions: Session[];
  exercises: Exercise[];
  programs: TrainingProgram[];
  plans: Plan[];
  plannedSessions: PlannedSession[];
  bodyEntries: BodyEntry[];
}

/**
 * Промпт для Claude/ChatGPT: формат + контекст пользователя (программа,
 * последние рабочие веса, недавние тренировки, план). Без заметок,
 * самочувствия и прочего личного — только то, что нужно для плана.
 */
export function buildAiPrompt(d: PromptData): string {
  const now = today();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const nameOf = (id: string) => exerciseName(d.exercises.find((e) => e.id === id));
  const out: string[] = [];
  out.push(
    L(
      `Ты мой тренер. Я веду тренировки в приложении Repeat. Сегодня ${now}, часовой пояс ${tz}. Когда я попрошу план или записать тренировку — ответь JSON строго в формате ниже, чтобы я вставил его в приложение.`,
      `You are my coach. I log workouts in the Repeat app. Today is ${now}, time zone ${tz}. When I ask for a plan or to log a workout, answer with JSON strictly in the format below so I can paste it into the app.`,
    ),
  );
  out.push("", FORMAT_DOC.trim(), "", L("## Мои данные", "## My data"));

  const weight = [...d.bodyEntries].filter((b) => b.weightKg != null).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (weight?.weightKg) out.push(`- ${L("Вес", "Weight")}: ${weight.weightKg} kg (${weight.date})`);

  const active = d.programs.filter((p) => !p.archivedAt);
  for (const p of active) {
    out.push(`- ${L("Программа", "Program")} «${p.name}»:`);
    for (const w of [...p.workouts].sort((a, b) => a.order - b.order)) {
      const list = w.exercises
        .map((e) => `${nameOf(e.exerciseId)} ${e.targetSets}×${e.targetRepMin ?? "?"}${e.targetRepMax && e.targetRepMax !== e.targetRepMin ? `–${e.targetRepMax}` : ""}`)
        .join("; ");
      out.push(`  - ${w.name}: ${list}`);
    }
  }

  // Последние рабочие веса упражнений за 2 месяца.
  const since = addDays(now, -60);
  const recentIds = [...new Set(d.sessions.filter((s) => s.kind === "strength" && s.date >= since).flatMap((s) => s.exercises.map((e) => e.exerciseId)))];
  const weights = recentIds
    .map((id) => [nameOf(id), lastWorkingWeight(d.sessions, id)] as const)
    .filter(([, w]) => w != null)
    .slice(0, 40);
  if (weights.length) out.push(`- ${L("Последние рабочие веса", "Last working weights")}: ${weights.map(([n, w]) => `${n} ${w} kg`).join("; ")}`);

  const last = d.sessions
    .filter((s) => s.date >= addDays(now, -14) && s.date <= now)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (last.length) {
    out.push(`- ${L("Тренировки за 2 недели", "Workouts, last 2 weeks")}:`);
    for (const s of last) {
      const dur = s.cardio?.durationSec ? ` ${Math.round(s.cardio.durationSec / 60)} min` : s.recovery?.durationMin ? ` ${s.recovery.durationMin} min` : "";
      out.push(`  - ${s.date} ${s.kind}${s.cardioKind ? `/${s.cardioKind}` : ""}${s.recovery ? `/${s.recovery.type}` : ""}${s.title ? ` «${s.title}»` : ""}${dur}`);
    }
  }

  const plan = activePlan(d.plans, now);
  if (plan) {
    const next = d.plannedSessions
      .filter((p) => p.planId === plan.id && p.date >= now && p.date <= addDays(now, 6))
      .sort((a, b) => (a.date + a.slot).localeCompare(b.date + b.slot));
    out.push(`- ${L("Текущий план", "Current plan")} «${plan.name}» ${plan.start}…${plan.end}. ${L("Ближайшая неделя", "Next 7 days")}:`);
    for (const p of next) out.push(`  - ${p.date} ${SLOT_LABELS[p.slot]}: ${p.title}${goalLine(p) ? ` (${goalLine(p)})` : ""} — ${p.status}`);
  }
  return out.join("\n");
}
