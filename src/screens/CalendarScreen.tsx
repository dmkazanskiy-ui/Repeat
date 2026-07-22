import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import AddIcon from "@mui/icons-material/Add";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import DirectionsRunIcon from "@mui/icons-material/DirectionsRun";
import SelfImprovementIcon from "@mui/icons-material/SelfImprovement";
import {
  WEEKDAYS_SHORT,
  addDays,
  weekGrid,
  formatDateFull,
  formatDistance,
  formatDuration,
  monthGrid,
  monthTitle,
  parseDateKey,
  today,
  toDateKey,
} from "../lib/format";
import { datesWithSessions, sessionsOn } from "../lib/store";
import { SESSION_LABELS, cardioLabel } from "../lib/types";
import type { Exercise, Session } from "../lib/types";

interface Props {
  sessions: Session[];
  exercises: Exercise[];
  selected: string;
  onSelect: (date: string) => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
}

export function sessionIcon(session: Session) {
  if (session.kind === "cardio") return <DirectionsRunIcon fontSize="small" />;
  if (session.kind === "mobility") return <SelfImprovementIcon fontSize="small" />;
  return <FitnessCenterIcon fontSize="small" />;
}

export function sessionTitle(session: Session): string {
  if (session.title) return session.title;
  if (session.kind === "cardio") {
    return cardioLabel(session) ?? SESSION_LABELS.cardio;
  }
  return SESSION_LABELS[session.kind];
}

function sessionSummary(session: Session, exercises: Exercise[]): string {
  if (session.kind === "cardio" && session.cardio) {
    const parts = [
      formatDistance(session.cardio.distanceM, session.cardioKind),
      formatDuration(session.cardio.durationSec),
    ].filter((part) => part !== "—");
    return parts.length ? parts.join(" · ") : "Без данных";
  }

  if (session.exercises.length === 0) return "Пусто — добавь упражнения";
  const names = session.exercises
    .map((item) => exercises.find((e) => e.id === item.exerciseId)?.name)
    .filter(Boolean);
  const sets = session.exercises.reduce((n, e) => n + e.sets.length, 0);
  return `${names.slice(0, 3).join(" · ")}${names.length > 3 ? "…" : ""} — ${sets} подх.`;
}

export default function CalendarScreen({
  sessions,
  exercises,
  selected,
  onSelect,
  onOpen,
  onCreate,
}: Props) {
  const [cursor, setCursor] = useState(() => parseDateKey(selected));
  // По умолчанию календарь свёрнут в одну неделю: на экране телефона
  // это оставляет место списку тренировок, а месяц нужен реже.
  const [expanded, setExpanded] = useState(false);

  const grid = useMemo(
    () => (expanded ? monthGrid(cursor) : weekGrid(selected)),
    [expanded, cursor, selected],
  );
  const marked = useMemo(() => datesWithSessions(sessions), [sessions]);
  const dayList = sessionsOn(sessions, selected);
  const todayKey = today();
  const cursorMonth = cursor.getMonth();

  /** Свёрнутый календарь листается неделями, развёрнутый — месяцами. */
  function shift(delta: number) {
    if (expanded) {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
      return;
    }
    const next = addDays(selected, delta * 7);
    setCursor(parseDateKey(next));
    onSelect(next);
  }

  function goToday() {
    setCursor(new Date());
    onSelect(todayKey);
  }

  return (
    <Box sx={{ pb: 10 }}>
      <Stack
        direction="row"
        sx={{ mb: 1, alignItems: "center", justifyContent: "space-between" }}
      >
        <IconButton
          onClick={() => shift(-1)}
          aria-label={expanded ? "Предыдущий месяц" : "Предыдущая неделя"}
        >
          <ChevronLeftIcon />
        </IconButton>

        <Button
          onClick={() => setExpanded((value) => !value)}
          endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          sx={{ color: "text.primary", fontSize: 18, fontWeight: 600, py: 0.5 }}
        >
          {monthTitle(expanded ? cursor : parseDateKey(selected))}
        </Button>

        <IconButton
          onClick={() => shift(1)}
          aria-label={expanded ? "Следующий месяц" : "Следующая неделя"}
        >
          <ChevronRightIcon />
        </IconButton>
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", mb: 0.5 }}>
        {WEEKDAYS_SHORT.map((day) => (
          <Typography
            key={day}
            variant="caption"
            align="center"
            color="text.secondary"
          >
            {day}
          </Typography>
        ))}
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.5 }}>
        {grid.map((key) => {
          const date = parseDateKey(key);
          const isSelected = key === selected;
          const isToday = key === todayKey;
          // В свёрнутом виде соседние месяцы приглушать не надо —
          // неделя на стыке месяцев это нормальная неделя.
          const outside = expanded && date.getMonth() !== cursorMonth;

          return (
            <Box
              key={key}
              component="button"
              onClick={() => onSelect(key)}
              sx={{
                position: "relative",
                aspectRatio: "1",
                border: isToday ? "1px solid" : "1px solid transparent",
                borderColor: isToday ? "primary.main" : "transparent",
                borderRadius: 2,
                bgcolor: isSelected ? "primary.main" : "transparent",
                color: isSelected
                  ? "primary.contrastText"
                  : outside
                    ? "text.disabled"
                    : "text.primary",
                // Число центрируется по всей ячейке; точка вынесена из потока,
                // иначе она смещала цифру вверх.
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontFamily: "inherit",
                cursor: "pointer",
                opacity: outside ? 0.35 : 1,
              }}
            >
              {date.getDate()}
              <Box
                sx={{
                  position: "absolute",
                  bottom: 5,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  bgcolor: marked.has(key)
                    ? isSelected
                      ? "primary.contrastText"
                      : "primary.main"
                    : "transparent",
                }}
              />
            </Box>
          );
        })}
      </Box>

      <Stack
        direction="row"
        sx={{ mt: 3, mb: 1.5, alignItems: "center", justifyContent: "space-between" }}
      >
        <Typography variant="h2">{formatDateFull(selected)}</Typography>
        {selected !== todayKey && (
          <Button size="small" onClick={goToday}>
            Сегодня
          </Button>
        )}
      </Stack>

      <Stack spacing={1}>
        {dayList.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            {parseDateKey(selected) > parseDateKey(todayKey)
              ? "На этот день ничего не запланировано."
              : "В этот день тренировок не было."}
          </Typography>
        )}

        {dayList.map((session) => (
          <Paper
            key={session.id}
            variant="outlined"
            onClick={() => onOpen(session.id)}
            sx={{ p: 1.5, cursor: "pointer" }}
          >
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
              <Box sx={{ color: "primary.main", mt: "2px" }}>
                {sessionIcon(session)}
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Typography variant="subtitle2">
                    {sessionTitle(session)}
                  </Typography>
                  {/* Тип показываем только когда у тренировки своё название —
                      иначе заголовок и чип дублировали бы друг друга. */}
                  {session.title && (
                    <Chip
                      label={SESSION_LABELS[session.kind]}
                      size="small"
                      variant="outlined"
                      sx={{ height: 20, fontSize: 11 }}
                    />
                  )}
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {sessionSummary(session, exercises)}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        ))}
      </Stack>

      <Button
        fullWidth
        variant="contained"
        startIcon={<AddIcon />}
        onClick={onCreate}
        sx={{ mt: 2 }}
      >
        Добавить тренировку
      </Button>
    </Box>
  );
}

export { toDateKey };
