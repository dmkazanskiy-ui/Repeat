/**
 * Выгрузка и восстановление истории одним текстом.
 *
 * Текст из двух частей:
 *  1. Читаемая сводка в Markdown — для человека и для разбора в Claude.
 *  2. Точные данные — JSON между маркерами BEGIN/END. Только по нему идёт
 *     восстановление; сводку импорт не читает.
 *
 * Зачем текст, а не файл: во встроенном браузере Telegram на iPhone скачивание
 * файлов ненадёжно, а буфер обмена работает везде. Так же история переносится
 * между адресами приложения (данные IndexedDB привязаны к адресу).
 *
 * Фото прогресса не выгружаются — это картинки, в текст они не помещаются.
 */
import { activePlateaus, formatWodResult, muscleSetTotals, sessionAttempt } from "./analytics";
import { addDays, formatDistance, formatDuration, formatVolume, formatWeight, today } from "./format";
import { L } from "./i18n";
import {
  INTENSITY_LABELS,
  SESSION_LABELS,
  BODY_METRICS,
  activityLabel,
  countsDoneOnly,
  exerciseName,
  moodContextFor,
  moodReading,
  sessionAvgHr,
  sessionDurationSec,
  sessionVolume,
} from "./types";
import { sessionCalories } from "./calories";
import type {
  BodyEntry,
  CustomActivity,
  Exercise,
  RecoveryEntry,
  Session,
  TrainingProgram,
  WorkoutSet,
} from "./types";
import { FOCUS_GOALS } from "./workoutBuilder";
import type { FocusGoal } from "./workoutBuilder";

export const BACKUP_FORMAT = "repeat-export";
export const BACKUP_VERSION = 1;
const BEGIN = "<<<REPEAT-EXPORT v1 BEGIN>>>";
const END = "<<<REPEAT-EXPORT v1 END>>>";

export type BackupPeriod = "day" | "week" | "month" | "all";

/** Всё, что переносится. Фото — нет. */
export interface BackupData {
  sessions: Session[];
  customExercises: Exercise[];
  cardioKinds: CustomActivity[];
  mobilityKinds: CustomActivity[];
  bodyEntries: BodyEntry[];
  programs: TrainingProgram[];
  recovery: RecoveryEntry[];
  focusGoal: FocusGoal | null;
}

interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  period: BackupPeriod;
  from: string | null;
  to: string;
  data: BackupData;
}

export const PERIOD_LABELS: Record<BackupPeriod, string> = {
  get day() { return L("День", "Day"); },
  get week() { return L("Неделя", "Week"); },
  get month() { return L("Месяц", "Month"); },
  get all() { return L("Всё время", "All time"); },
};

/** Начало периода (включительно). `null` — без ограничения. */
export function periodStart(period: BackupPeriod, ref = today()): string | null {
  if (period === "day") return ref;
  if (period === "week") return addDays(ref, -6);
  if (period === "month") return addDays(ref, -29);
  return null;
}

function inRange(date: string, from: string | null, to: string): boolean {
  return (from == null || date >= from) && date <= to;
}

// ───────────────────────────── Выгрузка ─────────────────────────────

export function buildExport(
  full: BackupData,
  allExercises: Exercise[],
  period: BackupPeriod,
): string {
  const to = today();
  const from = periodStart(period, to);
  // Справочники (программы, свои упражнения и виды, цель) — всегда целиком:
  // они маленькие и нужны, чтобы понять тренировки. Записи — по периоду.
  const data: BackupData = {
    ...full,
    sessions: full.sessions
      .filter((s) => inRange(s.date, from, to))
      .sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? ""))),
    bodyEntries: full.bodyEntries.filter((e) => inRange(e.date, from, to)),
    recovery: full.recovery.filter((e) => inRange(e.date, from, to)),
  };
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    period,
    from,
    to,
    data,
  };
  return `${renderSummary(data, allExercises, period, from, to)}\n\n${BEGIN}\n${JSON.stringify(file)}\n${END}\n`;
}

function setText(set: WorkoutSet, doneOnly: boolean): string {
  const main = `${formatWeight(set.weight)}×${set.reps ?? "—"}`;
  const drops = (set.drops ?? []).map((d) => ` → ${formatWeight(d.weight)}×${d.reps ?? "—"}`).join("");
  // Неотмеченный подход в тоннаж и прогресс не идёт — помечаем, чтобы разбор
  // не принял план за сделанное.
  const skipped = doneOnly && !set.done ? L(" (не отмечен)", " (not checked)") : "";
  return `${set.warmup ? L("разминка ", "warm-up ") : ""}${main}${drops}${skipped}`;
}

function sessionLines(s: Session, exercises: Exercise[]): string[] {
  const title = s.title || activityLabel(s) || SESSION_LABELS[s.kind];
  const meta: string[] = [];
  const dur = sessionDurationSec(s);
  if (dur) meta.push(formatDuration(dur));
  const vol = sessionVolume(s);
  if (vol > 0) meta.push(`${L("тоннаж", "volume")} ${formatVolume(vol)}`);
  if (s.intensity) meta.push(INTENSITY_LABELS[s.intensity].toLowerCase());
  const kcal = sessionCalories(s);
  if (kcal) meta.push(`${Math.round(kcal)} ${L("ккал", "kcal")}`);
  const hr = sessionAvgHr(s);
  if (hr) meta.push(`${L("пульс", "HR")} ${hr}`);
  if (s.deload) meta.push(L("разгрузка", "deload"));
  if (s.weekType) meta.push(`${L("неделя", "week")}: ${s.weekType.name}`);
  // «Не завершена» — только у начатой и не законченной; у записей без таймера
  // (восстановление, внесённое задним числом) это не ошибка.
  if (s.startedAt && !s.endedAt) meta.push(L("ещё идёт", "in progress"));
  if (s.autoEnded) meta.push(L("время оценено: «Завершить» не нажата", "time estimated: Finish wasn’t tapped"));

  const head = `- ${s.time ? `${s.time} ` : ""}**${title}** (${SESSION_LABELS[s.kind].toLowerCase()})${meta.length ? ` — ${meta.join(", ")}` : ""}`;
  const lines = [head];

  const doneOnly = countsDoneOnly(s);
  for (const item of s.exercises) {
    const sets = item.sets.filter((x) => x.weight != null || x.reps != null);
    if (!sets.length) continue;
    const name = exerciseName(exercises.find((e) => e.id === item.exerciseId));
    lines.push(`  - ${name}${item.groupId ? L(" (супер-сет)", " (superset)") : ""}: ${sets.map((x) => setText(x, doneOnly)).join(", ")}`);
    if (item.notes) lines.push(`    - ${L("заметка", "note")}: ${item.notes}`);
  }
  if (s.cardio) {
    const c = s.cardio;
    const parts = [
      c.durationSec ? formatDuration(c.durationSec) : null,
      c.distanceM ? formatDistance(c.distanceM, s.cardioKind) : null,
      c.inclineDeg != null ? `${L("наклон", "incline")} ${c.inclineDeg}°` : null,
      c.resistance != null ? `${L("уровень", "level")} ${c.resistance}` : null,
      c.powerW != null ? `${c.powerW} ${L("Вт", "W")}` : null,
      c.floors != null ? `${L("этажи", "floors")} ${c.floors}` : null,
    ].filter(Boolean);
    if (parts.length) lines.push(`  - ${parts.join(", ")}`);
    for (const seg of c.segments ?? []) {
      lines.push(
        `  - ${L("интервал", "interval")}: ${seg.repeat} × ${seg.distanceM ? formatDistance(seg.distanceM, s.cardioKind) : formatDuration(seg.durationSec)}${seg.restSec ? `, ${L("отдых", "rest")} ${formatDuration(seg.restSec)}` : ""}`,
      );
    }
  }
  if (s.wod) {
    const res = formatWodResult(sessionAttempt(s));
    lines.push(`  - ${[s.wod.scheme, res].filter(Boolean).join(" — ")}`);
  }
  if (s.recovery) {
    const r = s.recovery;
    const parts = [r.durationMin ? `${r.durationMin} ${L("мин", "min")}` : null, r.note].filter(Boolean);
    if (parts.length) lines.push(`  - ${parts.join(", ")}`);
  }
  if (s.mood) lines.push(`  - ${L("самочувствие после", "felt after")}: ${moodReading(moodContextFor(s.kind), s.mood)}`);
  if (s.notes) lines.push(`  - ${L("заметка", "note")}: ${s.notes}`);
  return lines;
}

function bodyLabel(key: (typeof BODY_METRICS)[number]["key"]): string {
  const labels: Record<string, [string, string]> = {
    weightKg: ["вес", "weight"],
    chest: ["грудь", "chest"],
    waist: ["талия", "waist"],
    hips: ["бёдра", "hips"],
    biceps: ["бицепс", "biceps"],
    thigh: ["бедро", "thigh"],
    neck: ["шея", "neck"],
  };
  const [ru, en] = labels[key] ?? [key, key];
  return L(ru, en);
}

function renderSummary(
  data: BackupData,
  exercises: Exercise[],
  period: BackupPeriod,
  from: string | null,
  to: string,
): string {
  const out: string[] = [];
  const range = from ? `${from} — ${to}` : `${L("по", "through")} ${to}`;
  out.push(`# ${L("История тренировок Repeat", "Repeat workout history")}`);
  out.push("");
  out.push(
    L(
      `> Это выгрузка из приложения Repeat (${PERIOD_LABELS[period].toLowerCase()}: ${range}). Проанализируй её как тренер: прогресс по упражнениям, плато, баланс нагрузки по мышечным группам, регулярность, восстановление — и дай рекомендации. Блок REPEAT-EXPORT в конце — те же данные в точном виде (JSON), нужен приложению для восстановления.`,
      `> This is an export from the Repeat app (${PERIOD_LABELS[period].toLowerCase()}: ${range}). Analyse it like a coach: progress per exercise, plateaus, load balance across muscle groups, consistency, recovery — and give recommendations. The REPEAT-EXPORT block at the end is the same data in exact form (JSON) used by the app to restore it.`,
    ),
  );
  out.push("");

  // Итог
  const trainings = data.sessions.filter((s) => s.kind !== "recovery");
  const days = new Set(trainings.map((s) => s.date)).size;
  const volume = data.sessions.reduce((sum, s) => sum + sessionVolume(s), 0);
  out.push(`## ${L("Итог", "Summary")}`);
  const recoveryCount = data.sessions.length - trainings.length;
  out.push(
    `- ${L("Тренировок", "Workouts")}: ${trainings.length}${recoveryCount ? ` ${L(`(плюс процедур восстановления: ${recoveryCount}, всего записей: ${data.sessions.length})`, `(plus ${recoveryCount} recovery sessions, ${data.sessions.length} entries total)`)}` : ""}, ${L("активных дней", "active days")}: ${days}`,
  );
  if (volume > 0) out.push(`- ${L("Общий тоннаж", "Total volume")}: ${formatVolume(volume)}`);
  const byKind = new Map<string, number>();
  for (const s of data.sessions) byKind.set(SESSION_LABELS[s.kind], (byKind.get(SESSION_LABELS[s.kind]) ?? 0) + 1);
  if (byKind.size) out.push(`- ${L("По видам", "By type")}: ${[...byKind].map(([k, n]) => `${k} ${n}`).join(", ")}`);
  if (data.focusGoal) {
    const goal = FOCUS_GOALS.find((g) => g.goal === data.focusGoal);
    out.push(`- ${L("Цель", "Goal")}: ${goal?.label ?? data.focusGoal}`);
  }
  const active = data.programs.filter((p) => !p.archivedAt);
  if (active.length) out.push(`- ${L("Программы", "Programs")}: ${active.map((p) => p.name).join(", ")}`);
  const plateaus = activePlateaus(data.sessions, exercises);
  if (plateaus.length) {
    out.push(`- ${L("Плато сейчас", "Current plateaus")}: ${plateaus.map((p) => `${p.name} — ${p.weeks} ${L("нед", "wk")}`).join("; ")}`);
  }
  out.push("");

  // Нагрузка по мышцам: рабочие подходы в неделю (засчитанные, без разминок).
  const sessionDates = data.sessions.map((s) => s.date).sort();
  if (sessionDates.length) {
    const start = from ?? sessionDates[0];
    const weeks = Math.max(1, (Date.parse(to) - Date.parse(start)) / (7 * 86_400_000));
    const muscles = muscleSetTotals(data.sessions, exercises, start, to).filter((m) => m.adjustedSets >= 0.5);
    if (muscles.length) {
      out.push(`## ${L("Нагрузка по мышцам", "Load by muscle")}`);
      out.push(
        L(
          "_Рабочих подходов в неделю: прямые (мышца — главная в упражнении) / с учётом подсобной работы._",
          "_Working sets per week: direct (muscle is the prime mover) / including assisting work._",
        ),
      );
      for (const m of muscles) {
        out.push(`- ${m.label}: ${(m.directSets / weeks).toFixed(1)} / ${(m.adjustedSets / weeks).toFixed(1)}`);
      }
      out.push("");
    }
  }

  // Тело: вес и обхваты — всё, что вносилось.
  const body = data.bodyEntries
    .filter((e) => BODY_METRICS.some((m) => e[m.key] != null))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (body.length) {
    out.push(`## ${L("Тело: вес и замеры", "Body: weight and measurements")}`);
    for (const e of body) {
      const parts = BODY_METRICS.filter((m) => e[m.key] != null).map(
        (m) => `${bodyLabel(m.key)} ${formatWeight(e[m.key] as number)} ${m.unit === "кг" ? L("кг", "kg") : L("см", "cm")}`,
      );
      out.push(`- ${e.date}: ${parts.join(", ")}${e.notes ? ` — ${e.notes}` : ""}`);
    }
    out.push("");
  }

  // Тренировки по дням
  out.push(`## ${L("Тренировки", "Workouts")}`);
  if (!data.sessions.length) out.push(L("_За период тренировок нет._", "_No workouts in this period._"));
  let lastDate = "";
  for (const s of data.sessions) {
    if (s.date !== lastDate) {
      out.push("");
      out.push(`### ${s.date}`);
      lastDate = s.date;
    }
    out.push(...sessionLines(s, exercises));
  }
  return out.join("\n");
}

// ───────────────────────────── Вставка ─────────────────────────────

export type ParseResult = { ok: true; file: BackupFile } | { ok: false; error: string };

export function parseExport(text: string): ParseResult {
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (start < 0 || end < 0 || end < start) {
    return {
      ok: false,
      error: L(
        "Не нашёл блок данных REPEAT-EXPORT. Вставь текст выгрузки целиком, вместе с концом.",
        "Couldn't find the REPEAT-EXPORT data block. Paste the whole export, including the end.",
      ),
    };
  }
  let file: BackupFile;
  try {
    file = JSON.parse(text.slice(start + BEGIN.length, end).trim());
  } catch {
    return {
      ok: false,
      error: L("Данные повреждены или обрезаны — выгрузи заново.", "The data is damaged or cut off — export again."),
    };
  }
  if (file?.format !== BACKUP_FORMAT || typeof file.version !== "number" || !file.data) {
    return { ok: false, error: L("Это не выгрузка Repeat.", "This isn't a Repeat export.") };
  }
  if (file.version > BACKUP_VERSION) {
    return {
      ok: false,
      error: L("Выгрузка из более новой версии — обнови приложение.", "Export is from a newer version — update the app."),
    };
  }
  const d = file.data;
  if (!Array.isArray(d.sessions) || d.sessions.some((s) => !s || typeof s.id !== "string" || typeof s.date !== "string")) {
    return { ok: false, error: L("В выгрузке битые тренировки.", "The export has broken workouts.") };
  }
  // Поля, которых могло не быть, — к пустым значениям.
  file.data = {
    sessions: d.sessions,
    customExercises: Array.isArray(d.customExercises) ? d.customExercises : [],
    cardioKinds: Array.isArray(d.cardioKinds) ? d.cardioKinds : [],
    mobilityKinds: Array.isArray(d.mobilityKinds) ? d.mobilityKinds : [],
    bodyEntries: Array.isArray(d.bodyEntries) ? d.bodyEntries : [],
    programs: Array.isArray(d.programs) ? d.programs : [],
    recovery: Array.isArray(d.recovery) ? d.recovery : [],
    focusGoal: d.focusGoal ?? null,
  };
  return { ok: true, file };
}

export interface MergePlan {
  next: BackupData;
  added: {
    sessions: number;
    programs: number;
    customExercises: number;
    bodyEntries: number;
    recovery: number;
  };
  skipped: number;
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): { list: T[]; added: number } {
  const have = new Set(current.map((x) => x.id));
  const fresh = incoming.filter((x) => x && typeof x.id === "string" && !have.has(x.id));
  return { list: [...current, ...fresh], added: fresh.length };
}

function mergeByName(current: CustomActivity[], incoming: CustomActivity[]): CustomActivity[] {
  const have = new Set(current.map((x) => x.name.toLowerCase()));
  return [...current, ...incoming.filter((x) => x?.name && !have.has(x.name.toLowerCase()))];
}

/**
 * Слияние без потерь: добавляем только то, чего нет (по id). Повторная
 * вставка той же выгрузки ничего не задваивает, а уже внесённое на новом
 * месте не затирается. Цель берём из выгрузки, только если своей ещё нет.
 */
export function planMerge(current: BackupData, incoming: BackupData): MergePlan {
  const sessions = mergeById(current.sessions, incoming.sessions);
  const programs = mergeById(current.programs, incoming.programs);
  const customExercises = mergeById(current.customExercises, incoming.customExercises);
  const bodyEntries = mergeById(current.bodyEntries, incoming.bodyEntries);
  const recovery = mergeById(current.recovery, incoming.recovery);
  return {
    next: {
      sessions: sessions.list,
      programs: programs.list,
      customExercises: customExercises.list,
      bodyEntries: bodyEntries.list,
      recovery: recovery.list,
      cardioKinds: mergeByName(current.cardioKinds, incoming.cardioKinds),
      mobilityKinds: mergeByName(current.mobilityKinds, incoming.mobilityKinds),
      focusGoal: current.focusGoal ?? incoming.focusGoal,
    },
    added: {
      sessions: sessions.added,
      programs: programs.added,
      customExercises: customExercises.added,
      bodyEntries: bodyEntries.added,
      recovery: recovery.added,
    },
    skipped: incoming.sessions.length - sessions.added,
  };
}
