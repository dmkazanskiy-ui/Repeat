import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Box,
  Button,
  Container,
  CssBaseline,
  IconButton,
  Snackbar,
  Typography,
} from "@mui/material";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import HistoryIcon from "@mui/icons-material/History";
import InsightsIcon from "@mui/icons-material/Insights";
import PersonIcon from "@mui/icons-material/Person";
import AddIcon from "@mui/icons-material/Add";
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

type Tab = "calendar" | "history" | "stats" | "profile";

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
  const [showPrograms, setShowPrograms] = useState(false);
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
    (program: TrainingProgram, index: number, deload: boolean, date = today()) => {
      const workout = [...program.workouts].sort((a, b) => a.order - b.order)[index];
      if (!workout) return;
      const last = lastSessionOfWorkout(sessions, workout.id);
      const session = startProgramWorkout(
        { ...program, currentWorkoutIndex: index },
        workout,
        date,
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
      setSelected(date);
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

  // Центральный «+» — быстрый лог: сегодняшний день, лист «новая тренировка».
  const logWorkout = useCallback(() => {
    setSelected(today());
    setTab("calendar");
    setCreating(true);
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
        ) : showPrograms ? (
          <ProgramsScreen
            programs={programs}
            exercises={exercises}
            onBack={() => setShowPrograms(false)}
            onStart={startProgramDay}
            onEdit={(p) => setProgramEditId(p.id)}
            onCreate={createProgram}
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
          <Box sx={{ pb: 12 }}>
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
                  programs={programs}
                  hasClipboard={Boolean(clipboard)}
                  onClose={() => setCreating(false)}
                  onCreate={createSession}
                  onAddCustom={addCustomActivity}
                  onStartProgram={(program, index) =>
                    startProgramDay(program, index, false, selected)
                  }
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
                programs={programs}
                onOpenPrograms={() => setShowPrograms(true)}
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
          sx={{ bottom: { xs: 96 } }}
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
          sx={{ bottom: { xs: 96 } }}
        />
      </Container>

      {/* Плавающий стеклянный таб-бар поверх контента (в духе iOS 26).
          По ширине совпадает с контентом (maxWidth sm), с подписями. */}
      {ready && !open && !programBeingEdited && !showPrograms && (
        <Box
          sx={{
            position: "fixed",
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
            left: 0,
            right: 0,
            px: 2,
            zIndex: 20,
            pointerEvents: "none",
          }}
        >
          <Box
            sx={{
              pointerEvents: "auto",
              maxWidth: 600,
              mx: "auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              px: 1.5,
              py: 0.5,
              borderRadius: 6,
              // «Жидкое стекло»: полупрозрачный фон + блюр + тонкая рамка.
              bgcolor: "rgba(22, 27, 34, 0.72)",
              backdropFilter: "blur(24px) saturate(180%)",
              WebkitBackdropFilter: "blur(24px) saturate(180%)",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 10px 34px rgba(0,0,0,0.45)",
            }}
          >
            <NavItem
              active={tab === "calendar"}
              label="Календарь"
              onClick={() => setTab("calendar")}
            >
              <CalendarMonthIcon />
            </NavItem>
            <NavItem
              active={tab === "history"}
              label="История"
              onClick={() => setTab("history")}
            >
              <HistoryIcon />
            </NavItem>

            <IconButton
              onClick={logWorkout}
              aria-label="Добавить тренировку"
              sx={{
                flex: "0 0 auto",
                mx: 0.5,
                width: 50,
                height: 50,
                bgcolor: "primary.main",
                color: "primary.contrastText",
                boxShadow: "0 6px 18px rgba(74,222,128,0.4)",
                "&:hover": { bgcolor: "primary.main" },
              }}
            >
              <AddIcon />
            </IconButton>

            <NavItem
              active={tab === "stats"}
              label="Аналитика"
              onClick={() => setTab("stats")}
            >
              <InsightsIcon />
            </NavItem>
            <NavItem
              active={tab === "profile"}
              label="Профиль"
              onClick={() => setTab("profile")}
            >
              <PersonIcon />
            </NavItem>
          </Box>
        </Box>
      )}
    </ThemeProvider>
  );
}

function NavItem({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Box
      component="button"
      onClick={onClick}
      aria-label={label}
      sx={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.25,
        py: 0.75,
        border: "none",
        bgcolor: "transparent",
        cursor: "pointer",
        fontFamily: "inherit",
        color: active ? "primary.main" : "text.secondary",
      }}
    >
      {children}
      <Typography variant="caption" sx={{ fontSize: 10, lineHeight: 1 }}>
        {label}
      </Typography>
    </Box>
  );
}
