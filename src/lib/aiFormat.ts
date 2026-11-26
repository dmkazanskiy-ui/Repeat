// Приём планов и тренировок от ИИ (Claude, ChatGPT…) и из файлов.
// Форматы `repeat-plan` и `repeat-workout` описаны в deploy/sync/ai_format.md —
// тот же текст отдаёт ИИ сервер (MCP `get_format`) и кнопка «Промпт для ИИ».
//
// Всё здесь — чистые функции: разобрать текст → подготовить импорт (что
// добавится, что уже есть) → применить к данным. Ничего не удаляем и не
// перезаписываем: id выводятся из содержимого, поэтому повторная вставка того
// же плана находит уже созданное, а не плодит дубли.
import { newId } from "./id";
import { CATALOG } from "./catalog";
import { L } from "./i18n";
import type {
  CardioKind,
  Exercise,
  MobilityKind,
  MuscleGroup,
  Plan,
  PlannedExercise,
  PlannedSession,
  PlanSlot,
  ProgramWorkout,
  ProgressionRule,
  RecoveryType,
  Session,
  SessionExercise,
  SessionKind,
  TrainingProgram,
  WorkoutSet,
} from "./types";

// ───────────── Разбор текста ─────────────

/**
 * Достать JSON из ответа ИИ: целиком, из блока ```json или первый
 * сбалансированный объект в тексте. Возвращает объект или null.
 */
export function extractJson(text: string): unknown {
  const t = text.trim();
  if (!t) return null;
  const tries: string[] = [t];
  for (const m of t.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) tries.push(m[1]);
  const first = t.indexOf("{");
  if (first >= 0) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = first; i < t.length; i++) {
      const ch = t[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        tries.push(t.slice(first, i + 1));
        break;
      }
    }
  }
  for (const s of tries) {
    try {
      const v = JSON.parse(s.trim());
      if (v && typeof v === "object") return v;
    } catch {
      /* следующий вариант */
    }
  }
  return null;
}

// ───────────── Словари ─────────────

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'().,–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const CARDIO: Record<string, CardioKind> = {
  run: "run", running: "run", бег: "run", пробежка: "run",
  bike: "bike", cycling: "bike", велосипед: "bike", вело: "bike", велотренажер: "bike",
  swim: "swim", swimming: "swim", плавание: "swim", бассейн: "swim",
  treadmill: "treadmill", walk: "treadmill", "ходьба на дорожке": "treadmill", дорожка: "treadmill", ходьба: "treadmill",
  treadmill_run: "treadmill_run", "бег на дорожке": "treadmill_run",
  elliptical: "elliptical", эллипс: "elliptical", эллипсоид: "elliptical",
  stairs: "stairs", степпер: "stairs", ступеньки: "stairs",
};

const RECOVERY: Record<string, RecoveryType> = {
  sauna: "sauna", сауна: "sauna",
  banya: "banya", баня: "banya",
  steam: "steam", хаммам: "steam", парная: "steam",
  hot_bath: "hot_bath", "горячая ванна": "hot_bath",
  cold_plunge: "cold_plunge", "холодная купель": "cold_plunge", купель: "cold_plunge",
  ice_bath: "ice_bath", "ледяная ванна": "ice_bath",
  cold_shower: "cold_shower", "холодный душ": "cold_shower",
  contrast: "contrast", контраст: "contrast",
  massage: "massage", массаж: "massage",
  sports_massage: "sports_massage", "спортивный массаж": "sports_massage",
  full_rest: "full_rest", rest: "full_rest", отдых: "full_rest",
};

const MOBILITY: Record<string, MobilityKind> = {
  stretching: "stretching", растяжка: "stretching", стретчинг: "stretching", мобилити: "stretching", mobility: "stretching",
  yoga: "yoga", йога: "yoga",
  lfk: "lfk", лфк: "lfk",
  breathing: "breathing", дыхание: "breathing",
  meditation: "meditation", медитация: "meditation",
  foam_rolling: "foam_rolling", ролл: "foam_rolling", мфр: "foam_rolling",
};

const GROUPS: MuscleGroup[] = ["chest", "back", "shoulders", "legs", "glutes", "arms", "core", "other"];

export interface Activity {
  kind: SessionKind;
  cardioKind?: CardioKind | null;
  recoveryType?: RecoveryType | null;
  mobilityKind?: MobilityKind | null;
  customKind?: string | null;
}

/** Вид активности по названию («Баня», "run", «Холодная купель»). */
export function resolveActivity(name: unknown): Activity | null {
  if (typeof name !== "string") return null;
  const n = norm(name);
  if (CARDIO[n]) return { kind: "cardio", cardioKind: CARDIO[n] };
  if (RECOVERY[n]) return { kind: "recovery", recoveryType: RECOVERY[n] };
  if (MOBILITY[n]) return { kind: "mobility", mobilityKind: MOBILITY[n] };
  if (n === "strength" || n === "силовая") return { kind: "strength" };
  return null;
}

// ───────────── Мелочи ─────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{1,2}:\d{2}$/;

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Число или диапазон [от, до] → {min, max}. */
function range(v: unknown): { min: number | null; max: number | null } {
  if (Array.isArray(v)) {
    const a = num(v[0]);
    const b = num(v[1]);
    if (a != null && b != null) return { min: Math.min(a, b), max: Math.max(a, b) };
    return { min: a ?? b, max: null };
  }
  return { min: num(v), max: null };
}

function str(v: unknown, max = 200): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

/** Короткий стабильный хэш — id из содержимого, чтобы повторный импорт находил своё. */
export function stableHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let h2 = 0;
  for (let i = s.length - 1; i >= 0; i--) h2 = (Math.imul(h2, 31) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

function localIso(date: string, time: string | null, plusMin = 0): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time ?? "12:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm + plusMin).toISOString();
}

// ───────────── Упражнения ─────────────

const stem = (s: string) =>
  norm(s)
    .split(" ")
    .map((w) => w.slice(0, 5))
    .join(" ");

/**
 * Сопоставитель упражнений: точное название (без регистра и «ё»), затем по
 * основам слов («Подъём на носки стоя» = «Подъёмы на носки стоя»). Не нашли —
 * создаём своё упражнение (один раз на имя).
 */
export function exerciseResolver(existing: Exercise[]) {
  const all = existing.length
    ? existing
    : CATALOG.map((c) => ({ id: `base:${c.name}`, name: c.name, muscleGroup: c.muscleGroup, custom: false }) as Exercise);
  const created: Exercise[] = [];
  const find = (name: string) => {
    const n = norm(name);
    const s = stem(name);
    const pool = [...all, ...created];
    return pool.find((e) => norm(e.name) === n) ?? pool.find((e) => stem(e.name) === s) ?? null;
  };
  return {
    created,
    resolve(name: string, group?: unknown): Exercise {
      const hit = find(name);
      if (hit) return hit;
      const g = GROUPS.includes(group as MuscleGroup) ? (group as MuscleGroup) : guessGroup(name);
      const ex: Exercise = { id: newId(), name: name.trim().slice(0, 80), muscleGroup: g, custom: true };
      created.push(ex);
      return ex;
    },
  };
}

function guessGroup(name: string): MuscleGroup {
  const n = norm(name);
  if (/скруч|пресс|планк|подъем ног|кор/.test(n)) return "core";
  if (/жим леж|грудь|бабочк|свед.*рук|отжим/.test(n)) return "chest";
  if (/тяга|подтяг|спин/.test(n)) return "back";
  if (/мах|плеч|дельт|жим стоя|жим сидя/.test(n)) return "shoulders";
  if (/бицеп|трицеп|молот|француз|сгибан.*рук|разгибан.*рук/.test(n)) return "arms";
  if (/ягод|мост/.test(n)) return "glutes";
  if (/присед|выпад|ног|икр|носк/.test(n)) return "legs";
  return "other";
}

// ───────────── Подготовка импорта ─────────────

export interface ImportContext {
  exercises: Exercise[];
  programs: TrainingProgram[];
  plans: Plan[];
  plannedSessions: PlannedSession[];
  sessions: Session[];
  /** Откуда: «файл», «Claude»… — пишется в план. */
  source?: string | null;
  now?: Date;
}

export interface PreparedImport {
  kind: "plan" | "workout";
  title: string;
  /** Новые свои упражнения. */
  newExercises: Exercise[];
  /** Новая программа (null — нет или уже была создана прошлым импортом). */
  program: TrainingProgram | null;
  programExists: boolean;
  plan: Plan | null;
  planExists: boolean;
  /** Карточки плана, которые нужно записать (новые и обновлённые запланированные). */
  planned: PlannedSession[];
  /** Новые тренировки (repeat-workout). */
  sessions: Session[];
  /** Связи «сделанная тренировка закрыла карточку плана». */
  links: { plannedId: string; sessionId: string }[];
  counts: {
    workouts: number;
    exercises: number;
    plannedNew: number;
    plannedUpdated: number;
    plannedKept: number;
    sessionsNew: number;
    sessionsKnown: number;
  };
  range: { start: string; end: string } | null;
  warnings: string[];
}

export type PrepareResult = { ok: true; prep: PreparedImport } | { ok: false; error: string };

/** Разобрать текст/объект и подготовить импорт. */
export function prepareImport(input: string | unknown, ctx: ImportContext): PrepareResult {
  const data = typeof input === "string" ? extractJson(input) : input;
  if (!data || typeof data !== "object") {
    return { ok: false, error: L("Не нашёл JSON. Вставь ответ ИИ целиком.", "No JSON found. Paste the whole AI answer.") };
  }
  const d = data as Record<string, unknown>;
  if (typeof d.version === "number" && d.version > 1) {
    return { ok: false, error: L("Формат из более новой версии — обнови приложение.", "Newer format — update the app.") };
  }
  try {
    if (d.format === "repeat-plan") return { ok: true, prep: preparePlan(d, ctx) };
    if (d.format === "repeat-workout") return { ok: true, prep: prepareWorkouts(d, ctx) };
  } catch (e) {
    return { ok: false, error: e instanceof ImportError ? e.message : L("Не получилось разобрать данные.", "Couldn't read the data.") };
  }
  return {
    ok: false,
    error: L(
      "Это не план и не тренировка Repeat: нужен \"format\": \"repeat-plan\" или \"repeat-workout\".",
      "Not a Repeat plan or workout: \"format\" must be \"repeat-plan\" or \"repeat-workout\".",
    ),
  };
}

class ImportError extends Error {}
const fail = (ru: string, en: string): never => {
  throw new ImportError(L(ru, en));
};

function parseProgression(v: unknown): ProgressionRule | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  if (p.type !== "double") return null;
  return {
    type: "double",
    stepKg: num(p.stepKg) ?? 2.5,
    dumbbellStepKg: num(p.dumbbellStepKg) ?? 2,
    lightStepKg: num(p.lightStepKg) ?? 1,
    lightBelowKg: num(p.lightBelowKg) ?? 15,
  };
}

function preparePlan(d: Record<string, unknown>, ctx: ImportContext): PreparedImport {
  const name = str(d.name, 80) ?? fail("У плана нет названия (name).", "The plan has no name.");
  const start = typeof d.start === "string" && DATE_RE.test(d.start) ? d.start : fail("Нет даты начала (start).", "No start date.");
  const days = Array.isArray(d.days) ? d.days : fail("В плане нет дней (days).", "The plan has no days.");
  if (days.length > 400) fail("Слишком длинный план (больше 400 дней).", "Plan is too long (over 400 days).");
  const nowIso = (ctx.now ?? new Date()).toISOString();
  const warnings: string[] = [];

  const planId = `plan_${stableHash(`${norm(name)}|${start}`)}`;
  const existingPlan = ctx.plans.find((p) => p.id === planId) ?? null;
  const resolver = exerciseResolver(ctx.exercises);

  // Программа силовых.
  let program: TrainingProgram | null = null;
  let programExists = false;
  const workoutIds = new Map<string, string>();
  let exerciseCount = 0;
  let workoutCount = 0;
  const pr = d.program as Record<string, unknown> | undefined;
  if (pr && typeof pr === "object" && pr.workouts && typeof pr.workouts === "object") {
    const programId = `${planId}_prog`;
    const known = ctx.programs.find((p) => p.id === programId) ?? null;
    programExists = Boolean(known);
    const entries = Object.entries(pr.workouts as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    const workouts: ProgramWorkout[] = entries.map(([key, raw], order) => {
      const w = (raw ?? {}) as Record<string, unknown>;
      const wid = `${programId}_${key}`;
      workoutIds.set(key, wid);
      const list = Array.isArray(w.exercises) ? w.exercises : [];
      const exercises: PlannedExercise[] = list.map((rawEx, i) => {
        const e = (rawEx ?? {}) as Record<string, unknown>;
        const exName = str(e.exercise ?? e.name, 80) ?? fail(`Упражнение без названия в «${key}».`, `Unnamed exercise in "${key}".`);
        const ex = resolver.resolve(exName, e.muscleGroup);
        let lo = num(e.repMin);
        let hi = num(e.repMax) ?? lo;
        if (lo != null && hi != null && lo > hi) [lo, hi] = [hi, lo];
        return {
          id: `${wid}_${i}`,
          exerciseId: ex.id,
          order: i,
          targetSets: Math.max(1, Math.min(10, Math.round(num(e.sets) ?? 3))),
          targetRepMin: lo,
          targetRepMax: hi,
          targetWeight: num(e.startWeightKg ?? e.weightKg),
          restSeconds: num(e.restSec),
          note: str(e.note),
        };
      });
      exerciseCount += exercises.length;
      workoutCount += 1;
      return { id: wid, name: str(w.name, 80) ?? key, order, exercises };
    });
    if (!known) {
      program = {
        id: programId,
        name: str(pr.name, 80) ?? name,
        description: str(d.goal, 300),
        workouts,
        currentWorkoutIndex: 0,
        cycleNumber: 1,
        wave: null,
        progression: parseProgression(pr.progression),
        deloadEveryWeeks: num(pr.deloadEveryWeeks),
        createdAt: nowIso,
      };
    }
  }

  // Карточки по дням.
  const planned: PlannedSession[] = [];
  let plannedNew = 0;
  let plannedUpdated = 0;
  let plannedKept = 0;
  let minDate = start;
  let maxDate = start;
  const byId = new Map(ctx.plannedSessions.map((p) => [p.id, p]));
  for (const rawDay of days) {
    const day = (rawDay ?? {}) as Record<string, unknown>;
    const date = typeof day.date === "string" && DATE_RE.test(day.date) ? day.date : fail("День без даты в плане.", "A day without a date.");
    if (date < minDate) minDate = date;
    if (date > maxDate) maxDate = date;
    const list = Array.isArray(day.sessions) ? day.sessions : [];
    list.forEach((rawS, si) => {
      const s = (rawS ?? {}) as Record<string, unknown>;
      const slot: PlanSlot = s.slot === "morning" || s.slot === "evening" ? s.slot : "day";
      const time = typeof s.time === "string" && TIME_RE.test(s.time) ? s.time.padStart(5, "0") : null;
      const title = str(s.title, 80);
      const items = Array.isArray(s.items) && s.items.length ? (s.items as Record<string, unknown>[]) : null;
      const cards = items
        ? items.map((it, ii) => ({ src: { ...it, kind: undefined }, kindName: it.kind, id: `${planId}_${date}_${slot}_${si}_${ii}`, group: title, optional: it.optional === true, title: str(it.title, 80) ?? str(it.kind, 80) }))
        : [{ src: s, kindName: s.kind, id: `${planId}_${date}_${slot}_${si}`, group: null, optional: s.optional === true, title }];
      for (const c of cards) {
        const act = activityOf(c.kindName, c.src);
        if (!act) {
          warnings.push(L(`${date}: непонятный вид «${String(c.kindName)}» — пропущен`, `${date}: unknown kind "${String(c.kindName)}" skipped`));
          continue;
        }
        const src = c.src as Record<string, unknown>;
        const dur = range(src.durationMin);
        const inc = range(src.inclineDeg);
        const wkKey = typeof s.programWorkout === "string" ? s.programWorkout : null;
        const programWorkoutId = act.kind === "strength" && wkKey ? (workoutIds.get(wkKey) ?? null) : null;
        if (act.kind === "strength" && wkKey && !programWorkoutId) {
          warnings.push(L(`${date}: тренировки «${wkKey}» нет в программе`, `${date}: workout "${wkKey}" is not in the program`));
        }
        const card: PlannedSession = {
          id: c.id,
          planId,
          date,
          slot,
          time,
          kind: act.kind,
          title: c.title ?? defaultTitle(act),
          group: c.group,
          optional: c.optional || undefined,
          programWorkoutId,
          cardioKind: act.cardioKind ?? null,
          mobilityKind: act.mobilityKind ?? null,
          recoveryType: act.recoveryType ?? null,
          customKind: act.customKind ?? null,
          durationMin: dur.min,
          durationMaxMin: dur.max,
          distanceKm: num(src.distanceKm),
          hrMin: num(src.hrMin),
          hrMax: num(src.hrMax),
          hrZone: num(src.hrZone),
          cadenceMin: num(src.cadenceMin),
          cadenceMax: num(src.cadenceMax),
          inclineDeg: inc.min,
          inclineMaxDeg: inc.max,
          note: str(src.note ?? (items ? null : s.note), 300),
          status: "planned",
          linkedSessionId: null,
          updatedAt: nowIso,
        };
        const prev = byId.get(card.id);
        if (!prev) {
          planned.push(card);
          plannedNew++;
        } else if (prev.status === "planned" && !prev.linkedSessionId) {
          // Обновляем только нетронутые карточки; отмеченные не трогаем.
          const changed = JSON.stringify({ ...prev, updatedAt: null }) !== JSON.stringify({ ...card, updatedAt: null });
          if (changed) {
            planned.push(card);
            plannedUpdated++;
          } else plannedKept++;
        } else plannedKept++;
      }
    });
  }

  const end = typeof d.end === "string" && DATE_RE.test(d.end) ? d.end : maxDate;
  const rules =
    d.rules && typeof d.rules === "object"
      ? Object.fromEntries(
          Object.entries(d.rules as Record<string, unknown>)
            .filter(([, v]) => typeof v === "string")
            .map(([k, v]) => [k, String(v).slice(0, 500)]),
        )
      : null;
  const plan: Plan = existingPlan ?? {
    id: planId,
    name,
    timezone: str(d.timezone, 60),
    start: minDate < start ? minDate : start,
    end,
    goal: str(d.goal, 300),
    programId: pr ? `${planId}_prog` : null,
    rules,
    source: ctx.source ?? null,
    createdAt: nowIso,
  };

  return {
    kind: "plan",
    title: name,
    newExercises: program ? resolver.created : [],
    program,
    programExists,
    plan: existingPlan ? null : plan,
    planExists: Boolean(existingPlan),
    planned,
    sessions: [],
    links: [],
    counts: { workouts: workoutCount, exercises: exerciseCount, plannedNew, plannedUpdated, plannedKept, sessionsNew: 0, sessionsKnown: 0 },
    range: { start: plan.start, end: plan.end },
    warnings,
  };
}

function activityOf(kindName: unknown, src: unknown): Activity | null {
  const s = (src ?? {}) as Record<string, unknown>;
  const k = typeof kindName === "string" ? kindName : "";
  if (k === "strength" || k === "силовая") return { kind: "strength" };
  if (k === "cardio") {
    const a = resolveActivity(s.cardioKind);
    return a?.kind === "cardio" ? a : { kind: "cardio", cardioKind: null, customKind: str(s.cardioKind, 40) };
  }
  if (k === "recovery") {
    const a = resolveActivity(s.recoveryType);
    return a?.kind === "recovery" ? a : { kind: "recovery", recoveryType: "other", customKind: str(s.recoveryType, 40) };
  }
  if (k === "mobility") {
    const a = resolveActivity(s.mobilityKind);
    return a?.kind === "mobility" ? a : { kind: "mobility", mobilityKind: null, customKind: str(s.mobilityKind, 40) };
  }
  return resolveActivity(k);
}

function defaultTitle(a: Activity): string {
  if (a.customKind) return a.customKind;
  if (a.kind === "strength") return L("Силовая", "Strength");
  if (a.kind === "cardio") return L("Кардио", "Cardio");
  if (a.kind === "mobility") return L("Мобилити", "Mobility");
  return L("Восстановление", "Recovery");
}

// ───────────── Тренировки ─────────────

function prepareWorkouts(d: Record<string, unknown>, ctx: ImportContext): PreparedImport {
  const list = Array.isArray(d.workouts) ? d.workouts : fail("Нет списка тренировок (workouts).", "No workouts list.");
  if (list.length > 300) fail("Слишком много тренировок за раз (больше 300).", "Too many workouts at once (over 300).");
  const resolver = exerciseResolver(ctx.exercises);
  const nowIso = (ctx.now ?? new Date()).toISOString();
  const have = new Set(ctx.sessions.map((s) => s.id));
  const sessions: Session[] = [];
  const links: { plannedId: string; sessionId: string }[] = [];
  const usedPlanned = new Set<string>();
  const warnings: string[] = [];
  let known = 0;
  let minDate = "";
  let maxDate = "";

  list.forEach((raw, idx) => {
    const w = (raw ?? {}) as Record<string, unknown>;
    const date = typeof w.date === "string" && DATE_RE.test(w.date) ? w.date : fail(`Тренировка №${idx + 1} без даты.`, `Workout #${idx + 1} has no date.`);
    const time = typeof w.time === "string" && TIME_RE.test(w.time) ? w.time.padStart(5, "0") : null;
    const act = activityOf(w.kind, w);
    if (!act) {
      warnings.push(L(`${date}: непонятный вид «${String(w.kind)}» — пропущен`, `${date}: unknown kind "${String(w.kind)}" skipped`));
      return;
    }
    const title = str(w.title, 80);
    const id = `ai_${stableHash(`${date}|${time ?? ""}|${act.kind}|${act.cardioKind ?? act.recoveryType ?? act.mobilityKind ?? ""}|${title ?? ""}|${idx}`)}`;
    if (have.has(id)) {
      known++;
      return;
    }
    if (!minDate || date < minDate) minDate = date;
    if (!maxDate || date > maxDate) maxDate = date;
    const done = w.done === true;
    const durationMin = num(w.durationMin);
    const exercises: SessionExercise[] = [];
    if (act.kind === "strength" && Array.isArray(w.exercises)) {
      for (const rawEx of w.exercises) {
        const e = (rawEx ?? {}) as Record<string, unknown>;
        const exName = str(e.exercise ?? e.name, 80);
        if (!exName) continue;
        const ex = resolver.resolve(exName, e.muscleGroup);
        let sets: WorkoutSet[];
        if (Array.isArray(e.sets)) {
          sets = e.sets.slice(0, 30).map((rs) => {
            const st = (rs ?? {}) as Record<string, unknown>;
            return {
              id: newId(),
              weight: num(st.weightKg ?? st.weight),
              reps: num(st.reps),
              done: st.done === false ? false : done,
              ...(st.warmup === true ? { warmup: true } : {}),
            };
          });
        } else {
          const count = Math.max(1, Math.min(10, Math.round(num(e.sets) ?? 3)));
          sets = Array.from({ length: count }, () => ({
            id: newId(),
            weight: num(e.weightKg ?? e.weight),
            reps: num(e.repMin ?? e.reps),
            done,
          }));
        }
        exercises.push({ id: newId(), exerciseId: ex.id, sets, notes: str(e.note) });
      }
    }
    const recDur = act.kind === "recovery" ? durationMin : null;
    const session: Session = {
      id,
      date,
      kind: act.kind,
      cardioKind: act.kind === "cardio" ? (act.cardioKind ?? null) : null,
      mobilityKind: act.kind === "mobility" ? (act.mobilityKind ?? null) : null,
      customKind: act.customKind ?? null,
      icon: null,
      time,
      title,
      notes: str(w.notes ?? w.note, 1000),
      createdAt: nowIso,
      exercises,
      cardio:
        act.kind === "cardio"
          ? {
              durationSec: durationMin != null ? Math.round(durationMin * 60) : null,
              distanceM: num(w.distanceKm) != null ? Math.round(num(w.distanceKm)! * 1000) : null,
              avgHr: num(w.avgHr),
              inclineDeg: num(w.inclineDeg),
              segments: [],
            }
          : null,
      recovery: act.kind === "recovery" ? { type: act.recoveryType ?? "other", durationMin: recDur, note: null } : null,
      calories: num(w.calories),
      avgHr: act.kind !== "cardio" ? num(w.avgHr) : null,
    };
    if (done) {
      const len = durationMin ?? (act.kind === "strength" ? 60 : 30);
      session.startedAt = localIso(date, time);
      session.endedAt = localIso(date, time, len);
      // Закрываем подходящую карточку плана этого дня.
      const card = ctx.plannedSessions.find(
        (p) =>
          p.date === date &&
          p.status === "planned" &&
          !p.linkedSessionId &&
          !usedPlanned.has(p.id) &&
          sameActivity(p, session),
      );
      if (card) {
        session.plannedSessionId = card.id;
        usedPlanned.add(card.id);
        links.push({ plannedId: card.id, sessionId: id });
      }
    }
    sessions.push(session);
  });

  return {
    kind: "workout",
    title: sessions.length === 1 ? (sessions[0].title ?? L("Тренировка", "Workout")) : L("Тренировки", "Workouts"),
    newExercises: resolver.created,
    program: null,
    programExists: false,
    plan: null,
    planExists: false,
    planned: [],
    sessions,
    links,
    counts: { workouts: 0, exercises: 0, plannedNew: 0, plannedUpdated: 0, plannedKept: 0, sessionsNew: sessions.length, sessionsKnown: known },
    range: minDate ? { start: minDate, end: maxDate } : null,
    warnings,
  };
}

/** Та же активность: вид и подвид (бег = бег, баня = баня). */
export function sameActivity(p: PlannedSession, s: Session): boolean {
  if (p.kind !== s.kind) return false;
  if (p.kind === "cardio") return !p.cardioKind || p.cardioKind === s.cardioKind;
  if (p.kind === "recovery") return !p.recoveryType || p.recoveryType === s.recovery?.type;
  if (p.kind === "mobility") return !p.mobilityKind || p.mobilityKind === s.mobilityKind;
  return true;
}

// ───────────── Применение ─────────────

export interface ImportTarget {
  exercises: Exercise[];
  programs: TrainingProgram[];
  plans: Plan[];
  plannedSessions: PlannedSession[];
  sessions: Session[];
}

/**
 * Применить подготовленный импорт: только добавляем и обновляем свои
 * нетронутые карточки. `archiveProgramIds` — какие старые программы убрать
 * в архив (по подтверждению пользователя).
 */
export function applyImport(prep: PreparedImport, cur: ImportTarget, archiveProgramIds: string[] = [], now = new Date()): ImportTarget {
  const nowIso = now.toISOString();
  const exIds = new Set(cur.exercises.map((e) => e.id));
  const exercises = [...cur.exercises, ...prep.newExercises.filter((e) => !exIds.has(e.id))];
  let programs = cur.programs.map((p) => (archiveProgramIds.includes(p.id) && !p.archivedAt ? { ...p, archivedAt: nowIso } : p));
  if (prep.program && !programs.some((p) => p.id === prep.program!.id)) programs = [...programs, prep.program];
  const plans = prep.plan && !cur.plans.some((p) => p.id === prep.plan!.id) ? [...cur.plans, prep.plan] : cur.plans;
  const incoming = new Map(prep.planned.map((p) => [p.id, p]));
  const links = new Map(prep.links.map((l) => [l.plannedId, l.sessionId]));
  let plannedSessions = cur.plannedSessions.map((p) => {
    const next = incoming.get(p.id) ?? p;
    incoming.delete(p.id);
    const sid = links.get(p.id);
    return sid ? { ...next, status: "done" as const, linkedSessionId: sid, updatedAt: nowIso } : next;
  });
  plannedSessions = [...plannedSessions, ...incoming.values()];
  const sIds = new Set(cur.sessions.map((s) => s.id));
  const sessions = [...cur.sessions, ...prep.sessions.filter((s) => !sIds.has(s.id))];
  return { exercises, programs, plans, plannedSessions, sessions };
}

// ───────────── Отмена импорта ─────────────

/** Что добавил и что поменял один импорт — чтобы откатить ровно его. */
export interface ImportRecord {
  id: string;
  at: string;
  title: string;
  kind: "plan" | "workout";
  source?: string | null;
  exerciseIds: string[];
  programIds: string[];
  planIds: string[];
  plannedIds: string[];
  sessionIds: string[];
  /** Карточки, которые импорт обновил или закрыл, — в прежнем виде. */
  prevPlanned: PlannedSession[];
  archivedProgramIds: string[];
  /** Планы, которые импорт заменил (убрал в архив). */
  archivedPlanIds?: string[];
}

export function importRecord(prep: PreparedImport, before: ImportTarget, after: ImportTarget, archived: string[], now = new Date(), archivedPlanIds: string[] = []): ImportRecord {
  const had = <T extends { id: string }>(list: T[]) => new Set(list.map((x) => x.id));
  const newIds = <T extends { id: string }>(b: T[], a: T[]) => {
    const h = had(b);
    return a.filter((x) => !h.has(x.id)).map((x) => x.id);
  };
  const beforePlanned = new Map(before.plannedSessions.map((p) => [p.id, p]));
  const prevPlanned = after.plannedSessions.filter((p) => beforePlanned.has(p.id) && beforePlanned.get(p.id) !== p).map((p) => beforePlanned.get(p.id)!);
  return {
    id: newId(),
    at: now.toISOString(),
    title: prep.title,
    kind: prep.kind,
    source: prep.plan?.source ?? null,
    exerciseIds: newIds(before.exercises, after.exercises),
    programIds: newIds(before.programs, after.programs),
    planIds: newIds(before.plans, after.plans),
    plannedIds: newIds(before.plannedSessions, after.plannedSessions),
    sessionIds: newIds(before.sessions, after.sessions),
    prevPlanned,
    archivedProgramIds: archived.filter((id) => before.programs.some((p) => p.id === id && !p.archivedAt)),
    archivedPlanIds: archivedPlanIds.filter((id) => before.plans.some((p) => p.id === id && !p.archivedAt)),
  };
}

/**
 * Откатить импорт: убрать добавленное, вернуть прежние карточки и программы
 * из архива. Своё упражнение остаётся, если им уже пользуются в другой тренировке.
 */
export function undoImport(rec: ImportRecord, cur: ImportTarget): ImportTarget {
  const drop = <T extends { id: string }>(list: T[], ids: string[]) => {
    const set = new Set(ids);
    return list.filter((x) => !set.has(x.id));
  };
  const sessions = drop(cur.sessions, rec.sessionIds);
  const programs = drop(cur.programs, rec.programIds).map((p) => (rec.archivedProgramIds.includes(p.id) ? { ...p, archivedAt: null } : p));
  const prev = new Map(rec.prevPlanned.map((p) => [p.id, p]));
  const plannedSessions = drop(cur.plannedSessions, rec.plannedIds).map((p) => prev.get(p.id) ?? p);
  const used = new Set([
    ...sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)),
    ...programs.flatMap((p) => p.workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId))),
  ]);
  const exercises = cur.exercises.filter((e) => !rec.exerciseIds.includes(e.id) || used.has(e.id));
  const plans = drop(cur.plans, rec.planIds).map((p) => (rec.archivedPlanIds?.includes(p.id) ? { ...p, archivedAt: null } : p));
  return { exercises, programs, plans, plannedSessions, sessions };
}
