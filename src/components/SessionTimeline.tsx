import { useEffect, useState } from "react";
import { Box, Stack } from "@mui/material";
import { alpha } from "@mui/material/styles";
import SwipeToDelete from "./SwipeToDelete";
import WorkoutTicket, { type TicketField } from "./WorkoutTicket";
import { ActivityIcon } from "../lib/icons";
import { typeColor } from "../lib/activityColors";
import { formatWodResult, sessionAttempt, wodScheme } from "../lib/analytics";
import { L } from "../lib/i18n";
import {
  PERCEIVED_EFFECT_LABELS,
  moodReading,
  SESSION_LABELS,
  activityIcon,
  activityLabel,
  exerciseName,
  isDone,
  liveElapsedSec,
  recoveryDurationSec,
  sessionDurationSec,
  countedSession,
  sessionAvgHr,
  sessionVolume,
} from "../lib/types";
import type { Exercise, Session } from "../lib/types";
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatVolume,
  today,
} from "../lib/format";

interface Props {
  sessions: Session[];
  exercises: Exercise[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onChangeTime: (id: string, time: string | null) => void;
}

type Status = "planned" | "running" | "done";

/**
 * Состояние справа. Восстановление и прошедшие записи — свершившийся факт (done),
 * будущие даты — planned, запущенный таймер — running. Отдельного «отменена» в
 * модели нет, поэтому и не показываем.
 */
function statusOf(session: Session): Status {
  if (session.startedAt && !session.endedAt) return "running";
  if (session.date > today() && !isDone(session)) return "planned";
  return "done";
}

function sessionTitle(session: Session): string {
  return session.title || activityLabel(session) || SESSION_LABELS[session.kind];
}

/** Описание: что было — без тоннажа (он в метриках). */
function description(session: Session, exercises: Exercise[]): string {
  if (session.kind === "strength") {
    if (session.exercises.length === 0) return L("Пусто — добавь упражнения", "Empty — add exercises");
    const names = session.exercises
      .map((item) => exerciseName(exercises.find((e) => e.id === item.exerciseId)))
      .filter(Boolean);
    return `${names.slice(0, 3).join(" · ")}${names.length > 3 ? "…" : ""}`;
  }
  if (session.kind === "wod") {
    const parts: string[] = [];
    const result = formatWodResult(sessionAttempt(session));
    if (result !== "—") parts.push(result);
    const scheme = wodScheme(session).replace(/\s*\n\s*/g, " · ");
    if (scheme) parts.push(scheme.length > 60 ? `${scheme.slice(0, 60)}…` : scheme);
    return parts.join(" · ");
  }
  if (session.kind === "recovery") {
    const parts: string[] = [];
    if (session.mood) parts.push(moodReading("recovery", session.mood));
    else if (session.recovery?.effect) parts.push(PERCEIVED_EFFECT_LABELS[session.recovery.effect]);
    const note = session.recovery?.note;
    if (note) parts.push(note.length > 50 ? `${note.slice(0, 50)}…` : note);
    return parts.join(" · ");
  }
  return "";
}

/** «MM:SS» или «H:MM:SS» — для тикающего таймера в карточке. */
function elapsedText(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = `${m}`.padStart(h ? 2 : 1, "0");
  const ss = `${s}`.padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** ISO → «ЧЧ:ММ» по местному времени. */
function hhmm(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** «ЧЧ:ММ» + секунды → «ЧЧ:ММ». */
function addClock(time: string, sec: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m + Math.round(sec / 60)) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Показатели билета по виду тренировки — только те, что есть. */
function ticketFields(session: Session): TicketField[] {
  const out: TicketField[] = [];
  const push = (label: string, value: string | null | undefined) => {
    if (value && value !== "—") out.push({ label, value });
  };
  if (session.kind === "strength") {
    const c = countedSession(session);
    const vol = sessionVolume(session);
    const sets = c.exercises.reduce((n, e) => n + e.sets.filter((x) => !x.warmup).length, 0);
    const reps = c.exercises.reduce((n, e) => n + e.sets.reduce((r, x) => r + (x.warmup ? 0 : (x.reps ?? 0)), 0), 0);
    push(L("Тоннаж", "Tonnage"), vol > 0 ? formatVolume(vol) : null);
    push(L("Подходы", "Sets"), sets ? String(sets) : null);
    push(L("Повторы", "Reps"), reps ? String(reps) : null);
    push(L("Упражн.", "Exerc."), c.exercises.length ? String(c.exercises.length) : null);
  } else if (session.kind === "cardio" && session.cardio) {
    push(L("Дистанция", "Distance"), formatDistance(session.cardio.distanceM, session.cardioKind));
    push(L("Темп", "Pace"), formatPace(session.cardio.distanceM, session.cardio.durationSec, session.cardioKind));
    const hr = sessionAvgHr(session);
    push(L("Пульс", "HR"), hr ? String(hr) : null);
    const kcal = session.calories ?? session.caloriesEst ?? null;
    push(L("Ккал", "kcal"), kcal ? String(Math.round(kcal)) : null);
  } else if (session.kind === "wod") {
    push(L("Результат", "Result"), formatWodResult(sessionAttempt(session)));
  } else {
    const hr = sessionAvgHr(session);
    push(L("Пульс", "HR"), hr ? String(hr) : null);
    const kcal = session.calories ?? session.caloriesEst ?? null;
    push(L("Ккал", "kcal"), kcal ? String(Math.round(kcal)) : null);
  }
  return out.slice(0, 4);
}

function SessionCard({
  session,
  exercises,
  onOpen,
  onChangeTime,
  nowMs,
}: {
  session: Session;
  exercises: Exercise[];
  onOpen: (id: string) => void;
  onChangeTime: (id: string, time: string | null) => void;
  nowMs: number;
}) {
  const color = typeColor(session.kind);
  const status = statusOf(session);
  const running = status === "running";
  const dur = running
    ? liveElapsedSec(session, nowMs)
    : session.kind === "recovery"
      ? recoveryDurationSec(session)
      : sessionDurationSec(session);
  const start = session.time ?? hhmm(session.startedAt) ?? null;
  // Конец = начало + длительность, чтобы «маршрут» и длительность не спорили
  // (у кардио длительность часто введена руками, а «Завершить» нажато позже).
  const end = running ? null : start && dur ? addClock(start, dur) : hhmm(session.endedAt);

  return (
    <Box role="button" tabIndex={0} onClick={() => onOpen(session.id)} sx={{ cursor: "pointer" }}>
      <WorkoutTicket
        icon={<ActivityIcon icon={activityIcon(session)} />}
        color={color}
        kind={SESSION_LABELS[session.kind]}
        title={sessionTitle(session)}
        status={
          running
            ? { label: L("Идёт", "Live"), tone: "running" }
            : status === "planned"
              ? { label: L("План", "Planned"), tone: "planned" }
              : session.autoEnded
                ? { label: L("Оценено", "Estimated"), tone: "estimated" }
                : { label: L("Готово", "Done"), tone: "done" }
        }
        from={{ big: start ?? "—:—", small: L("начало", "start") }}
        to={{ big: running ? elapsedText(dur ?? 0) : (end ?? "—"), small: running ? L("идёт", "elapsed") : L("конец", "end") }}
        middle={
          // Общее время тренировки — между началом и концом у всех видов.
          running ? L("идёт", "live") : !dur ? L("без времени", "no time") : dur < 60 ? L("< 1 мин", "< 1 min") : formatDuration(dur)
        }
        fields={ticketFields(session)}
        note={description(session, exercises) || undefined}
        timeValue={session.time ?? null}
        onTimeChange={(t) => onChangeTime(session.id, t)}
      />
    </Box>
  );
}

/** Лента тренировок: карточки друг под другом, время — внутри карточки. */
export default function SessionTimeline({ sessions, exercises, onOpen, onDelete, onChangeTime }: Props) {
  // Тикаем раз в секунду, только если есть запущенная тренировка (иначе покой).
  const hasRunning = sessions.some((s) => s.startedAt && !s.endedAt);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!hasRunning) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasRunning]);

  return (
    <Stack spacing={1.5}>
      {sessions.map((session) => (
        <SwipeToDelete key={session.id} onDelete={() => onDelete(session.id)} accent={alpha(typeColor(session.kind), 0.25)}>
          <SessionCard session={session} exercises={exercises} onOpen={onOpen} onChangeTime={onChangeTime} nowMs={nowMs} />
        </SwipeToDelete>
      ))}
    </Stack>
  );
}
