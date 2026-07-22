import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Container,
  CssBaseline,
  Snackbar,
  Typography,
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { theme } from "./theme";
import {
  copySessionTo,
  load,
  newSession,
  saveCardioKinds,
  saveCustomExercises,
  saveMobilityKinds,
  saveSessions,
} from "./lib/store";
import { newId } from "./lib/id";
import { today } from "./lib/format";
import CalendarScreen from "./screens/CalendarScreen";
import SessionEditor from "./screens/SessionEditor";
import NewSessionDialog from "./components/NewSessionDialog";
import type { CreateOptions } from "./components/NewSessionDialog";
import type {
  CustomActivity,
  Exercise,
  MuscleGroup,
  Session,
  SessionKind,
} from "./lib/types";

export default function App() {
  const [ready, setReady] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [cardioKinds, setCardioKinds] = useState<CustomActivity[]>([]);
  const [mobilityKinds, setMobilityKinds] = useState<CustomActivity[]>([]);
  const [selected, setSelected] = useState(today);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Удалённая тренировка живёт здесь, пока висит плашка «Отменить».
  const [undo, setUndo] = useState<Session | null>(null);
  // Скопированная тренировка — её можно вставить в любой другой день.
  const [clipboard, setClipboard] = useState<Session | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    load().then((data) => {
      setSessions(data.sessions);
      setExercises(data.exercises);
      setCardioKinds(data.cardioKinds);
      setMobilityKinds(data.mobilityKinds);
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
    (kind: SessionKind, options: CreateOptions) => {
      const session = newSession(selected, kind, options);
      commit([...sessions, session]);
      setOpenId(session.id);
    },
    [selected, sessions, commit],
  );

  const deleteSession = useCallback(
    (id: string) => {
      const victim = sessions.find((s) => s.id === id) ?? null;
      commit(sessions.filter((s) => s.id !== id));
      setUndo(victim);
    },
    [sessions, commit],
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

  const addCustomActivity = useCallback(
    (kind: "cardio" | "mobility", activity: CustomActivity) => {
      const list = kind === "cardio" ? cardioKinds : mobilityKinds;
      if (list.some((item) => item.name === activity.name)) return;
      const next = [...list, activity];
      if (kind === "cardio") {
        setCardioKinds(next);
        void saveCardioKinds(next);
      } else {
        setMobilityKinds(next);
        void saveMobilityKinds(next);
      }
    },
    [cardioKinds, mobilityKinds],
  );

  const pasteSession = useCallback(() => {
    if (!clipboard) return;
    const copy = copySessionTo(clipboard, selected);
    commit([...sessions, copy]);
    setOpenId(copy.id);
  }, [clipboard, selected, sessions, commit]);

  const open = openId ? (sessions.find((s) => s.id === openId) ?? null) : null;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="sm" sx={{ py: 2 }}>
        {!ready ? null : open ? (
          <SessionEditor
            session={open}
            exercises={exercises}
            cardioKinds={cardioKinds}
            mobilityKinds={mobilityKinds}
            onChange={updateSession}
            onBack={() => setOpenId(null)}
            onDelete={() => {
              deleteSession(open.id);
              setOpenId(null);
            }}
            onCreateExercise={createExercise}
            onCopyTo={(date) => {
              const copy = copySessionTo(open, date);
              commit([...sessions, copy]);
              setSelected(date);
              setOpenId(null);
            }}
            onCopyToClipboard={() => {
              setClipboard(open);
              setToast("Скопировано — вставь через «Добавить тренировку»");
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
              onDelete={deleteSession}
            />
            <NewSessionDialog
              open={creating}
              cardioKinds={cardioKinds}
              mobilityKinds={mobilityKinds}
              hasClipboard={Boolean(clipboard)}
              onClose={() => setCreating(false)}
              onCreate={createSession}
              onAddCustom={addCustomActivity}
              onPaste={pasteSession}
            />
          </>
        )}
        <Box sx={{ height: 24 }} />

        <Snackbar
          open={Boolean(undo)}
          autoHideDuration={6000}
          onClose={() => setUndo(null)}
          message="Тренировка удалена"
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          action={
            <Button
              size="small"
              onClick={() => {
                if (undo) commit([...sessions, undo]);
                setUndo(null);
              }}
            >
              Отменить
            </Button>
          }
        />

        <Snackbar
          open={Boolean(toast)}
          autoHideDuration={4000}
          onClose={() => setToast(null)}
          message={toast ?? ""}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        />
      </Container>
    </ThemeProvider>
  );
}
