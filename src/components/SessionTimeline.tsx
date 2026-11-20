import { IconBadge } from "../ui";
import { useEffect, useState } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { AccessTimeRounded as AccessTimeRoundedIcon } from "../ui/icons";
import MonitorWeightOutlinedIcon from "@mui/icons-material/MonitorWeightOutlined";
import { RepeatRounded as RepeatRoundedIcon } from "../ui/icons";
import { PlaceOutlined as PlaceOutlinedIcon } from "../ui/icons";
import SpeedRoundedIcon from "@mui/icons-material/SpeedRounded";
import { CheckRounded as CheckRoundedIcon } from "../ui/icons";
import { RadioButtonUncheckedRounded as RadioButtonUncheckedRoundedIcon } from "../ui/icons";
import SwipeToDelete from "./SwipeToDelete";
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
  sessionSetCount,
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

type MetricKey = "time" | "volume" | "sets" | "distance" | "pace";
interface Metric {
  key: MetricKey;
  text: string;
}

/** Метрики строкой: время идёт первым во всех карточках, дальше — специфика вида. */
function metricsOf(session: Session): Metric[] {
  const items: Metric[] = [];
  const dur =
    session.kind === "recovery"
      ? recoveryDurationSec(session)
      : sessionDurationSec(session);
  const minDur = session.kind === "strength" ? 60 : 1;
  if (dur && dur >= minDur) items.push({ key: "time", text: formatDuration(dur) });

  if (session.kind === "strength") {
    const vol = sessionVolume(session);
    if (vol > 0) items.push({ key: "volume", text: formatVolume(vol) });
    const sets = sessionSetCount(session);
    if (sets > 0) items.push({ key: "sets", text: `${sets} ${L("подх.", "sets")}` });
  } else if (session.kind === "cardio" && session.cardio) {
    const dist = formatDistance(session.cardio.distanceM, session.cardioKind);
    if (dist !== "—") items.push({ key: "distance", text: dist });
    const pace = formatPace(session.cardio.distanceM, session.cardio.durationSec, session.cardioKind);
    if (pace !== "—") items.push({ key: "pace", text: pace });
  }
  return items;
}

function MetricIcon({ metric }: { metric: MetricKey }) {
  const sx = { fontSize: 14, opacity: 0.75 };
  switch (metric) {
    case "time":
      return <AccessTimeRoundedIcon sx={sx} />;
    case "volume":
      return <MonitorWeightOutlinedIcon sx={sx} />;
    case "sets":
      return <RepeatRoundedIcon sx={sx} />;
    case "distance":
      return <PlaceOutlinedIcon sx={sx} />;
    case "pace":
      return <SpeedRoundedIcon sx={sx} />;
  }
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

/** Большое кольцо с тикающим таймером — только для «в процессе». Учитывает паузы. */
function RunningRing({ session, color, nowMs }: { session: Session; color: string; nowMs: number }) {
  return (
    <Box
      sx={{
        width: 46,
        height: 46,
        borderRadius: "50%",
        border: "2px solid",
        borderColor: color,
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
        boxShadow: `0 0 12px ${alpha(color, 0.35)}`,
      }}
    >
      <Typography sx={{ fontSize: 11, fontWeight: 700, color, lineHeight: 1 }}>
        {elapsedText(liveElapsedSec(session, nowMs))}
      </Typography>
    </Box>
  );
}

/** Компактный статус размером с тег — в правом углу ряда с тегом. */
function StatusChip({ status, color }: { status: Status; color: string }) {
  if (status === "done") {
    return (
      <Box
        sx={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          bgcolor: alpha(color, 0.16),
          border: "1px solid",
          borderColor: "divider",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <CheckRoundedIcon sx={{ color, fontSize: 14 }} />
      </Box>
    );
  }
  // planned
  return (
    <RadioButtonUncheckedRoundedIcon sx={{ color: "text.disabled", fontSize: 18, flexShrink: 0 }} />
  );
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
  const title = sessionTitle(session);
  const desc = description(session, exercises);
  const metrics = metricsOf(session);
  const typeLabel = SESSION_LABELS[session.kind];

  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={() => onOpen(session.id)}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        p: 2,
        cursor: "pointer",
        // Рамка, скругление и тень — на внешнем контейнере (SwipeToDelete),
        // чтобы красный фон удаления не просвечивал на углах. Здесь только
        // тёмная подложка с лёгким цветным оттенком слева, без яркой заливки.
        backgroundColor: "background.paper",
      }}
    >
      {/* Цветная плашка-иконка */}
      <IconBadge color={color}>
        <ActivityIcon icon={activityIcon(session)} fontSize="medium" />
      </IconBadge>

      {/* Центр: [тег · статус] · название · описание · метрики */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", mb: 0.5 }}
        >
          <Box
            component="span"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              height: 20,
              px: 0.9,
              borderRadius: 1,
              border: "1px solid",
              borderColor: "divider",
              color,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {typeLabel}
          </Box>
          {/* Время тренировки — в карточке; тап открывает нативный пикер */}
          <Box sx={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 0.4, color: "text.secondary" }}>
            <AccessTimeRoundedIcon sx={{ fontSize: 14, opacity: 0.75 }} />
            <Typography variant="caption" sx={{ fontSize: 11.5, fontVariantNumeric: "tabular-nums" }}>
              {session.time ?? "—:—"}
            </Typography>
            <Box
              component="input"
              type="time"
              value={session.time ?? ""}
              aria-label={L("Время тренировки", "Workout time")}
              onClick={(e: MouseEvent) => e.stopPropagation()}
              onChange={(e: ChangeEvent<HTMLInputElement>) => onChangeTime(session.id, e.target.value || null)}
              sx={{ position: "absolute", inset: -6, width: "calc(100% + 12px)", opacity: 0, cursor: "pointer", border: "none", p: 0, m: 0 }}
            />
          </Box>
          <Box sx={{ flex: 1 }} />
          {status !== "running" && <StatusChip status={status} color={color} />}
        </Stack>

        <Typography variant="subtitle2" sx={{ lineHeight: 1.3, fontWeight: 600 }} noWrap>
          {title}
        </Typography>
        {desc && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {desc}
          </Typography>
        )}
        {metrics.length > 0 && (
          <Stack direction="row" spacing={1.5} sx={{ mt: 0.75, flexWrap: "wrap", rowGap: 0.5 }}>
            {metrics.map((m) => (
              <Stack
                key={m.key}
                direction="row"
                spacing={0.4}
                sx={{ alignItems: "center", color: "text.secondary" }}
              >
                <MetricIcon metric={m.key} />
                <Typography variant="caption" sx={{ fontSize: 11.5 }}>
                  {m.text}
                </Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </Box>

      {/* Исключение — «в процессе»: большое кольцо с таймером справа */}
      {status === "running" && session.startedAt && (
        <RunningRing session={session} color={color} nowMs={nowMs} />
      )}
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
