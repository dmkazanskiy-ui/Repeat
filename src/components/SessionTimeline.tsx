import type { ReactNode } from "react";
import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
import SwipeToDelete from "./SwipeToDelete";
import { ActivityIcon } from "../lib/icons";
import {
  SESSION_LABELS,
  activityIcon,
  activityLabel,
  isDone,
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
  /** Текущее время «HH:MM» — рисует горизонтальную линию «сейчас» (только сегодня). */
  now?: string;
}

type Status = "done" | "plan" | "draft";

function statusOf(session: Session): { label: string; kind: Status } {
  if (isDone(session)) return { label: "Завершена", kind: "done" };
  if (session.date > today()) return { label: "Запланирована", kind: "plan" };
  return { label: "Черновик", kind: "draft" };
}

function sessionTitle(session: Session): string {
  return session.title || activityLabel(session) || SESSION_LABELS[session.kind];
}

/** Описание: что было — без тоннажа (он в футере). */
function description(session: Session, exercises: Exercise[]): string {
  if (session.kind === "strength") {
    if (session.exercises.length === 0) return "Пусто — добавь упражнения";
    const names = session.exercises
      .map((item) => exercises.find((e) => e.id === item.exerciseId)?.name)
      .filter(Boolean);
    return `${names.slice(0, 3).join(" · ")}${names.length > 3 ? "…" : ""}`;
  }
  return "";
}

/** Футер карточки: время · тоннаж · подходы (силовая) либо дистанция · время · темп (кардио). */
function footerParts(session: Session): string[] {
  const parts: string[] = [];
  const dur = sessionDurationSec(session);
  if (session.kind === "strength") {
    if (dur && dur >= 60) parts.push(formatDuration(dur));
    const vol = sessionVolume(session);
    if (vol > 0) parts.push(formatVolume(vol));
    const sets = sessionSetCount(session);
    if (sets > 0) parts.push(`${sets} подх.`);
  } else if (session.kind === "cardio" && session.cardio) {
    const dist = formatDistance(session.cardio.distanceM, session.cardioKind);
    if (dist !== "—") parts.push(dist);
    if (session.cardio.durationSec) parts.push(formatDuration(session.cardio.durationSec));
    const pace = formatPace(session.cardio.distanceM, session.cardio.durationSec, session.cardioKind);
    if (pace !== "—") parts.push(pace);
  } else if (dur) {
    parts.push(formatDuration(dur));
  }
  return parts;
}

function SessionCard({
  session,
  exercises,
  onOpen,
}: {
  session: Session;
  exercises: Exercise[];
  onOpen: (id: string) => void;
}) {
  const status = statusOf(session);
  const title = sessionTitle(session);
  const desc = description(session, exercises);
  const footer = footerParts(session);
  const typeLabel = SESSION_LABELS[session.kind];

  return (
    <Paper
      variant="outlined"
      onClick={() => onOpen(session.id)}
      sx={{ p: 1.5, borderRadius: 2.5, cursor: "pointer" }}
    >
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 0.75 }}>
        <Box sx={{ color: "primary.main", display: "flex", mr: 0.25 }}>
          <ActivityIcon icon={activityIcon(session)} />
        </Box>
        <Chip
          label={status.label}
          size="small"
          variant="outlined"
          color={status.kind === "done" ? "primary" : "default"}
          sx={{ height: 20, fontSize: 11 }}
        />
        {title !== typeLabel && (
          <Chip
            label={typeLabel}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: 11 }}
          />
        )}
      </Stack>

      <Typography variant="subtitle2" sx={{ lineHeight: 1.3 }}>
        {title}
      </Typography>
      {desc && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {desc}
        </Typography>
      )}
      {footer.length > 0 && (
        <Typography
          variant="caption"
          sx={{ display: "block", mt: 0.5, fontWeight: 600, color: "text.secondary" }}
        >
          {footer.join(" · ")}
        </Typography>
      )}
    </Paper>
  );
}

const RAIL = 44; // ширина колонки времени
const NODE = 16; // ширина колонки точки/линии

/** Строка «сейчас» — горизонтальная пунктирная линия с тегом текущего времени. */
function NowRow({ now }: { now: string }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1.5 }}>
      <Box sx={{ width: RAIL, display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
        <Chip
          label={now}
          size="small"
          color="primary"
          sx={{
            height: 18,
            fontSize: 10,
            fontWeight: 700,
            flexShrink: 0,
            "& .MuiChip-label": { px: 0.6 },
          }}
        />
      </Box>
      <Box sx={{ width: NODE, position: "relative", flexShrink: 0 }}>
        <Box
          sx={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor: "primary.main",
          }}
        />
      </Box>
      <Box sx={{ flex: 1, borderTop: "1.5px dashed", borderColor: "primary.main", opacity: 0.7 }} />
    </Stack>
  );
}

/** Лента тренировок как вертикальный таймлайн: слева время + точка + линия. */
export default function SessionTimeline({
  sessions,
  exercises,
  onOpen,
  onDelete,
  now,
}: Props) {
  const n = sessions.length;
  // Куда вставить линию «сейчас»: после всех тренировок раньше текущего времени.
  const nowIndex = now
    ? sessions.filter((s) => (s.time ?? "00:00") <= now).length
    : -1;

  const rows: ReactNode[] = [];
  sessions.forEach((session, i) => {
    if (i === nowIndex && now) rows.push(<NowRow key="now" now={now} />);

    const status = statusOf(session);
    const dotColor =
      status.kind === "done"
        ? "primary.main"
        : status.kind === "plan"
          ? "text.secondary"
          : "divider";

    rows.push(
      <Stack key={session.id} direction="row" spacing={1}>
        {/* Время */}
        <Box sx={{ width: RAIL, flexShrink: 0 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", textAlign: "right", lineHeight: "18px", mt: "2px" }}
          >
            {session.time ?? ""}
          </Typography>
        </Box>
        {/* Точка и линия — по центру своей колонки */}
        <Box sx={{ width: NODE, position: "relative", flexShrink: 0 }}>
          {i < n - 1 && (
            <Box
              sx={{
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%)",
                top: 8,
                bottom: -12,
                width: "2px",
                bgcolor: "divider",
              }}
            />
          )}
          <Box
            sx={{
              position: "absolute",
              left: "50%",
              top: 3,
              transform: "translateX(-50%)",
              width: 12,
              height: 12,
              borderRadius: "50%",
              bgcolor: dotColor,
              border: "2px solid",
              borderColor: "background.default",
              zIndex: 1,
            }}
          />
        </Box>
        {/* Карточка */}
        <Box sx={{ flex: 1, minWidth: 0, pb: 1.5 }}>
          <SwipeToDelete onDelete={() => onDelete(session.id)}>
            <SessionCard session={session} exercises={exercises} onOpen={onOpen} />
          </SwipeToDelete>
        </Box>
      </Stack>,
    );
  });

  if (now && nowIndex === n) rows.push(<NowRow key="now" now={now} />);

  return <Box>{rows}</Box>;
}
