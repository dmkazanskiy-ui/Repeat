import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import SessionTimeline from "../components/SessionTimeline";
import { formatDateFull } from "../lib/format";
import { sessionsOn } from "../lib/store";
import type { Exercise, Session } from "../lib/types";

interface Props {
  sessions: Session[];
  exercises: Exercise[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

/** Все тренировки таймлайном, свежие сверху, сгруппированы по дню. */
export default function HistoryScreen({
  sessions,
  exercises,
  onOpen,
  onDelete,
}: Props) {
  const dates = useMemo(() => {
    const set = new Set(sessions.map((s) => s.date));
    return [...set].sort((a, b) => (a < b ? 1 : -1));
  }, [sessions]);

  return (
    <Box sx={{ pb: 10 }}>
      <Typography variant="h1" sx={{ mb: 2 }}>
        История
      </Typography>

      {sessions.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
          Пока пусто. Заноси тренировки — они появятся здесь.
        </Typography>
      )}

      {dates.map((date) => (
        <Box key={date} sx={{ mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            {formatDateFull(date)}
          </Typography>
          <SessionTimeline
            sessions={sessionsOn(sessions, date)}
            exercises={exercises}
            onOpen={onOpen}
            onDelete={onDelete}
          />
        </Box>
      ))}
    </Box>
  );
}
