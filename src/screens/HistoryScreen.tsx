import { useMemo } from "react";
import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
import SwipeToDelete from "../components/SwipeToDelete";
import {
  sessionIcon,
  sessionSummary,
  sessionTitle,
} from "./CalendarScreen";
import { formatDateFull } from "../lib/format";
import { sessionsOn } from "../lib/store";
import { SESSION_LABELS } from "../lib/types";
import type { Exercise, Session } from "../lib/types";

interface Props {
  sessions: Session[];
  exercises: Exercise[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

/** Все тренировки списком, свежие сверху, сгруппированы по дню. */
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
        <Box key={date} sx={{ mb: 2.5 }}>
          <Typography
            variant="subtitle2"
            color="text.secondary"
            sx={{ mb: 1 }}
          >
            {formatDateFull(date)}
          </Typography>
          <Stack spacing={1}>
            {sessionsOn(sessions, date).map((session) => (
              <SwipeToDelete
                key={session.id}
                onDelete={() => onDelete(session.id)}
              >
                <Paper
                  variant="outlined"
                  onClick={() => onOpen(session.id)}
                  sx={{ p: 1.5, cursor: "pointer", borderRadius: 1 }}
                >
                  <Stack
                    direction="row"
                    spacing={1.5}
                    sx={{ alignItems: "flex-start" }}
                  >
                    <Box sx={{ color: "primary.main", mt: "2px" }}>
                      {sessionIcon(session)}
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "center" }}
                      >
                        <Typography variant="subtitle2">
                          {sessionTitle(session)}
                        </Typography>
                        {session.title && (
                          <Chip
                            label={SESSION_LABELS[session.kind]}
                            size="small"
                            variant="outlined"
                            sx={{ height: 20, fontSize: 11 }}
                          />
                        )}
                        {session.time && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ ml: "auto", pl: 1 }}
                          >
                            {session.time}
                          </Typography>
                        )}
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {sessionSummary(session, exercises)}
                      </Typography>
                    </Box>
                  </Stack>
                </Paper>
              </SwipeToDelete>
            ))}
          </Stack>
        </Box>
      ))}
    </Box>
  );
}
