import { useCallback, useEffect, useState } from "react";
import {
  Box,
  BottomNavigation,
  BottomNavigationAction,
  Button,
  Container,
  CssBaseline,
  Paper,
  Snackbar,
} from "@mui/material";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import HistoryIcon from "@mui/icons-material/History";
import InsightsIcon from "@mui/icons-material/Insights";
import PersonIcon from "@mui/icons-material/Person";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import { ThemeProvider } from "@mui/material/styles";
import { theme } from "./theme";
import {
  advanceProgram,
  copySessionTo,
  lastSessionOfWorkout,
  load,
  newProgram,
  newSession,
  saveBodyEntries,
  saveCardioKinds,
  saveCustomExercises,
  saveMobilityKinds,
  savePhotos,
  savePrograms,
  saveRecovery,
  saveSessions,
  startProgramWorkout,
} from "./lib/store";
import { newId } from "./lib/id";
import { today } from "./lib/format";
import CalendarScreen from "./screens/CalendarScreen";
import HistoryScreen from "./screens/HistoryScreen";
import AnalyticsScreen from "./screens/AnalyticsScreen";
import ProfileScreen from "./screens/ProfileScreen";
import ProgramsScreen from "./screens/ProgramsScreen";
import ProgramEditor from "./screens/ProgramEditor";
import SessionEditor from "./screens/SessionEditor";
import SessionView from "./screens/SessionView";
import NewSessionDialog from "./components/NewSessionDialog";
import type { CreateOptions } from "./components/NewSessionDialog";
import { isDone } from "./lib/types";
import type {
  BodyEntry,
  CustomActivity,
  Exercise,
  MuscleGroup,
  ProgressPhoto,
  RecoveryEntry,
  Session,
  SessionKind,
  TrainingProgram,
} from "./lib/types";

type Tab = "calendar" | "history" | "program" | "stats" | "profile";

export default function App() {
  const [ready, setReady] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [cardioKinds, setCardioKinds] = useState<CustomActivity[]>([]);
  const [mobilityKinds, setMobilityKinds] = useState<CustomActivity[]>([]);
  const [bodyEntries, setBodyEntries] = useState<BodyEntry[]>([]);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [programs, setPrograms] = useState<TrainingProgram[]>([]);
  const [recovery, setRecovery] = useState<RecoveryEntry[]>([]);
  const [programEditId, setProgramEditId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("calendar");
  const [selected, setSelected] = useState(today);
  const [openId, setOpenId] = useState<string | null>(null);
  // Правим ли завершённую тренировку — иначе она показывается read-only.
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [undo, setUndo] = useState<Session | null>(null);
  const [clipboard, setClipboard] = useState<Session | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    load().then((data) => {
      setSessions(data.sessions);
      setExercises(data.exercises);
      setCardioKinds(data.cardioKinds);
      setMobilityKinds(data.mobilityKinds);
      setBodyEntries(data.bodyEntries);
      setPhotos(data.photos);
      setPrograms(data.programs);
      setRecovery(data.recovery);
      setReady(true);
    });
  }, []);

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

  const openSession = useCallback((id: string) => {
    setOpenId(id);
    setEditing(false);
  }, []);

  const createSession = useCallback(
    (kind: SessionKind, options: CreateOptions) => {
      const session = newSession(selected, kind, options);
      commit([...sessions, session]);
      setOpenId(session.id);
      setEditing(true);
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
      const exercise: Exercise = { id: newId(), name, muscleGroup: group, custom: true };
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

  const changeBody = useCallback((next: BodyEntry[]) => {
    setBodyEntries(next);
    void saveBodyEntries(next);
  }, []);

  const changePhotos = useCallback((next: ProgressPhoto[]) => {
    setPhotos(next);
    void savePhotos(next);
  }, []);

  const changeRecovery = useCallback((next: RecoveryEntry[]) => {
    setRecovery(next);
    void saveRecovery(next);
  }, []);

  const commitPrograms = useCallback((next: TrainingProgram[]) => {
    setPrograms(next);
    void savePrograms(next);
  }, []);

  const createProgram = useCallback(() => {
    const program = newProgram();
    commitPrograms([...programs, program]);
    setProgramEditId(program.id);
  }, [programs, commitPrograms]);

  const updateProgram = useCallback(
    (updated: TrainingProgram) => {
      commitPrograms(programs.map((p) => (p.id === updated.id ? updated : p)));
    },
    [programs, commitPrograms],
  );

  const archiveProgram = useCallback(
    (id: string) => {
      commitPrograms(
        programs.map((p) =>
          p.id === id ? { ...p, archivedAt: new Date().toISOString() } : p,
        ),
      );
      setProgramEditId(null);
    },
    [programs, commitPrograms],
  );

  const startProgramDay = useCallback(
    (program: TrainingProgram, index: number, deload: boolean) => {
      const workout = [...program.workouts].sort((a, b) => a.order - b.order)[index];
      if (!workout) return;
      const last = lastSessionOfWorkout(sessions, workout.id);
      const session = startProgramWorkout(
        { ...program, currentWorkoutIndex: index },
        workout,
        today(),
        last,
      );
      session.deload = deload;
      commit([...sessions, session]);
      // Продвигаем цикл от выбранного дня, а не всегда от текущего.
      commitPrograms(
        programs.map((p) =>
          p.id === program.id
            ? advanceProgram({ ...program, currentWorkoutIndex: index })
            : p,
        ),
      );
      setSelected(today());
      setTab("calendar");
      setOpenId(session.id);
      setEditing(true);
    },
    [sessions, programs, commit, commitPrograms],
  );

  const pasteSession = useCallback(() => {
    if (!clipboard) return;
    const copy = copySessionTo(clipboard, selected);
    commit([...sessions, copy]);
    setOpenId(copy.id);
    setEditing(true);
  }, [clipboard, selected, sessions, commit]);

  const closeSession = useCallback(() => {
    setOpenId(null);
    setEditing(false);
  }, []);

  const open = openId ? (sessions.find((s) => s.id === openId) ?? null) : null;
  // Завершённую тренировку по умолчанию показываем read-only.
  const showView = open && isDone(open) && !editing;
  const programBeingEdited = programEditId
    ? (programs.find((p) => p.id === programEditId) ?? null)
    : null;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="sm" sx={{ py: 2 }}>
        {!ready ? null : programBeingEdited ? (
          <ProgramEditor
            program={programBeingEdited}
            exercises={exercises}
            onChange={updateProgram}
            onBack={() => setProgramEditId(null)}
            onArchive={() => archiveProgram(programBeingEdited.id)}
            onCreateExercise={createExercise}
          />
        ) : open ? (
          showView ? (
            <SessionView
              session={open}
              exercises={exercises}
              onBack={closeSession}
              onEdit={() => setEditing(true)}
              onDelete={() => {
                deleteSession(open.id);
                closeSession();
              }}
              onCopyToClipboard={() => {
                setClipboard(open);
                setToast("Скопировано — вставь через «Добавить тренировку»");
              }}
            />
          ) : (
            <SessionEditor
              session={open}
              exercises={exercises}
              cardioKinds={cardioKinds}
              mobilityKinds={mobilityKinds}
              onChange={updateSession}
              onBack={closeSession}
              onExitEditing={() => setEditing(false)}
              onDelete={() => {
                deleteSession(open.id);
                closeSession();
              }}
              onCreateExercise={createExercise}
              onCopyTo={(date) => {
                const copy = copySessionTo(open, date);
                commit([...sessions, copy]);
                setSelected(date);
                closeSession();
              }}
              onCopyToClipboard={() => {
                setClipboard(open);
                setToast("Скопировано — вставь через «Добавить тренировку»");
              }}
            />
          )
        ) : (
          <Box sx={{ pb: 7 }}>
            {tab === "calendar" && (
              <>
                <CalendarScreen
                  sessions={sessions}
                  exercises={exercises}
                  selected={selected}
                  onSelect={setSelected}
                  onOpen={openSession}
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
            {tab === "history" && (
              <HistoryScreen
                sessions={sessions}
                exercises={exercises}
                onOpen={openSession}
                onDelete={deleteSession}
              />
            )}
            {tab === "program" && (
              <ProgramsScreen
                programs={programs}
                exercises={exercises}
                onStart={startProgramDay}
                onEdit={(p) => setProgramEditId(p.id)}
                onCreate={createProgram}
              />
            )}
            {tab === "stats" && (
              <AnalyticsScreen
                sessions={sessions}
                exercises={exercises}
                programs={programs}
                recovery={recovery}
              />
            )}
            {tab === "profile" && (
              <ProfileScreen
                bodyEntries={bodyEntries}
                photos={photos}
                recovery={recovery}
                onChangeBody={changeBody}
                onChangePhotos={changePhotos}
                onChangeRecovery={changeRecovery}
              />
            )}
          </Box>
        )}

        <Snackbar
          open={Boolean(undo)}
          autoHideDuration={6000}
          onClose={() => setUndo(null)}
          message="Тренировка удалена"
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          sx={{ bottom: { xs: 72 } }}
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
          sx={{ bottom: { xs: 72 } }}
        />
      </Container>

      {/* Нижняя навигация прячется на полноэкранных редакторах. */}
      {ready && !open && !programBeingEdited && (
        <Paper
          elevation={0}
          sx={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            borderTop: "1px solid",
            borderColor: "divider",
            zIndex: 10,
          }}
        >
          <Container maxWidth="sm" disableGutters>
            <BottomNavigation
              value={tab}
              onChange={(_, value: Tab) => setTab(value)}
              showLabels
            >
              <BottomNavigationAction
                label="Календарь"
                value="calendar"
                icon={<CalendarMonthIcon />}
              />
              <BottomNavigationAction
                label="История"
                value="history"
                icon={<HistoryIcon />}
              />
              <BottomNavigationAction
                label="Программа"
                value="program"
                icon={<FitnessCenterIcon />}
              />
              <BottomNavigationAction
                label="Аналитика"
                value="stats"
                icon={<InsightsIcon />}
              />
              <BottomNavigationAction
                label="Профиль"
                value="profile"
                icon={<PersonIcon />}
              />
            </BottomNavigation>
          </Container>
        </Paper>
      )}
    </ThemeProvider>
  );
}
