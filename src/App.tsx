import { useCallback, useEffect, useState } from "react";
import { Box, Container, CssBaseline, Typography } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { theme } from "./theme";
import {
  copySessionTo,
  load,
  newSession,
  saveCustomExercises,
  saveSessions,
} from "./lib/store";
import { newId } from "./lib/id";
import { today } from "./lib/format";
import CalendarScreen from "./screens/CalendarScreen";
import SessionEditor from "./screens/SessionEditor";
import NewSessionDialog from "./components/NewSessionDialog";
import type {
  CardioKind,
  Exercise,
  MuscleGroup,
  Session,
  SessionKind,
} from "./lib/types";

export default function App() {
  const [ready, setReady] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selected, setSelected] = useState(today);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    load().then((data) => {
      setSessions(data.sessions);
      setExercises(data.exercises);
      setReady(true);
    });
  }, []);

  // Пишем на каждое изменение: тренировка правится в зале, где приложение
  // могут закрыть в любой момент. Отдельной кнопки «сохранить» по сути нет.
  const commit = useCallback((next: Session[]) => {
    setSessions(next);
    void saveSessions(next);
  }, []);

  const updateSession = useCallback(
    (updated: Session) => {
      commit(sessions.map((s) => (s.id === updated.id ? updated : s)));
    },
    [sessions, commit],
  );

  const createSession = useCallback(
    (kind: SessionKind, cardioKind: CardioKind | null) => {
      const session = newSession(selected, kind, cardioKind);
      commit([...sessions, session]);
      setOpenId(session.id);
    },
    [selected, sessions, commit],
  );

  const createExercise = useCallback(
    (name: string, group: MuscleGroup): Exercise => {
      const exercise: Exercise = {
        id: newId(),
        name,
        muscleGroup: group,
        custom: true,
      };
      const next = [...exercises, exercise];
      setExercises(next);
      void saveCustomExercises(next);
      return exercise;
    },
    [exercises],
  );

  const open = openId ? (sessions.find((s) => s.id === openId) ?? null) : null;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="sm" sx={{ py: 2 }}>
        {!ready ? null : open ? (
          <SessionEditor
            session={open}
            exercises={exercises}
            onChange={updateSession}
            onBack={() => setOpenId(null)}
            onDelete={() => {
              commit(sessions.filter((s) => s.id !== open.id));
              setOpenId(null);
            }}
            onCreateExercise={createExercise}
            onCopyTo={(date) => {
              const copy = copySessionTo(open, date);
              commit([...sessions, copy]);
              setSelected(date);
              setOpenId(null);
            }}
          />
        ) : (
          <>
            <Typography variant="h1" sx={{ mb: 2 }}>
              Repeat
            </Typography>
            <CalendarScreen
              sessions={sessions}
              exercises={exercises}
              selected={selected}
              onSelect={setSelected}
              onOpen={setOpenId}
              onCreate={() => setCreating(true)}
            />
            <NewSessionDialog
              open={creating}
              onClose={() => setCreating(false)}
              onCreate={createSession}
            />
          </>
        )}
        <Box sx={{ height: 24 }} />
      </Container>
    </ThemeProvider>
  );
}
