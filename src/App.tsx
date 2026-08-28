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
import { LangContext, loadLang, saveLang, setCurrentLang } from "./lib/i18n";
import {
  currentWeekType,
  lastSameTypeSession,
  wavePlan,
  waveToast,
} from "./lib/wave";
import type { Lang } from "./lib/i18n";
import {
  advanceProgram,
  buildProgramFromPreset,
  copySessionTo,
  lastSessionOfWorkout,
  load,
  newProgram,
  newSessionExercise,
  newSet,
  newSession,
  saveBodyEntries,
  saveCardioKinds,
  saveFocusGoal,
  saveOnboarded,
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
import {
  acuteChronicLoad,
  autoregPlan,
  autoregToast,
  dayModifier,
  readiness,
} from "./lib/analytics";
import CalendarScreen from "./screens/CalendarScreen";
import HistoryScreen from "./screens/HistoryScreen";
import AnalyticsScreen from "./screens/AnalyticsScreen";
import ProfileScreen from "./screens/ProfileScreen";
import OnboardingScreen from "./screens/OnboardingScreen";
import ProgramsScreen from "./screens/ProgramsScreen";
import HiitScreen from "./screens/HiitScreen";
import { loadHiit, saveHiit, hiitWorkSec } from "./lib/hiit";
import type { HiitConfig } from "./lib/hiit";
import ProgramDetail from "./screens/ProgramDetail";
import ProgramEditor from "./screens/ProgramEditor";
import SessionEditor from "./screens/SessionEditor";
import RecoveryEditor from "./screens/RecoveryEditor";
import WodEditor from "./screens/WodEditor";
import SessionView from "./screens/SessionView";
import NewSessionDialog from "./components/NewSessionDialog";
import type { CreateOptions } from "./components/NewSessionDialog";
import type { ProgramPreset } from "./lib/programLibrary";
import type { FocusGoal, WorkoutSuggestion } from "./lib/workoutBuilder";
import { isDiscardableSession, isDone } from "./lib/types";
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
  const [focusGoal, setFocusGoal] = useState<FocusGoal | null>(null);
  const [onboarded, setOnboarded] = useState(true);
  const [programEditId, setProgramEditId] = useState<string | null>(null);
  const [openProgramId, setOpenProgramId] = useState<string | null>(null);
  const [showPrograms, setShowPrograms] = useState(false);
  const [showHiit, setShowHiit] = useState(false);
  const [hiitCfg, setHiitCfg] = useState<HiitConfig>(() => loadHiit());
  const [tab, setTab] = useState<Tab>("calendar");
  const [lang, setLang] = useState<Lang>(loadLang);
  const [selected, setSelected] = useState(today);
  const t = (ru: string, en: string) => (lang === "ru" ? ru : en);

  const changeLang = useCallback((next: Lang) => {
    setCurrentLang(next);
    setLang(next);
    saveLang(next);
  }, []);
  const [openId, setOpenId] = useState<string | null>(null);
  // Правим ли завершённую тренировку — иначе она показывается read-only.
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  // С какого шага открыть лист «Новая тренировка»: обычный выбор или сразу
  // мастер «Тренер» (из проактивного «Сегодня»).
  const [dialogStart, setDialogStart] = useState<"kind" | "goal">("kind");
  const [undo, setUndo] = useState<Session | null>(null);
  const [clipboard, setClipboard] = useState<Session | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Необязательная кнопка у тоста («И в программе» после замены упражнения).
  const [toastAction, setToastAction] = useState<{ label: string; run: () => void } | null>(null);

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
      setFocusGoal(data.focusGoal);
      // Онбординг — только для новых: если уже есть тренировки, не показываем.
      setOnboarded(data.onboarded || data.sessions.length > 0);
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

  const changeSessionTime = useCallback(
    (id: string, time: string | null) => {
      commit(sessions.map((s) => (s.id === id ? { ...s, time } : s)));
    },
    [sessions, commit],
  );

  const createSession = useCallback(
    (kind: SessionKind, options: CreateOptions) => {
      const session = newSession(selected, kind, options);
      commit([...sessions, session]);
      setOpenId(session.id);
      setEditing(true);
    },
    [selected, sessions, commit],
  );

  // Финиш HIIT-таймера → готовая кардио-сессия (сегменты + длительность).
  const finishHiit = useCallback(
    (cfg: HiitConfig, elapsedSec: number) => {
      saveHiit(cfg);
      setHiitCfg(cfg);
      setShowHiit(false);
      if (elapsedSec < 5) return; // отменили сразу — не создаём пустышку
      const session = newSession(selected, "cardio", { cardioKind: "hiit" });
      const end = new Date();
      session.startedAt = new Date(end.getTime() - elapsedSec * 1000).toISOString();
      session.endedAt = end.toISOString();
      session.cardio = {
        durationSec: hiitWorkSec(cfg),
        distanceM: null,
        avgHr: null,
        segments: [
          { id: newId(), repeat: cfg.rounds, durationSec: cfg.workSec, restSec: cfg.restSec, distanceM: null },
        ],
      };
      commit([...sessions, session]);
      setOpenId(session.id);
      setEditing(false); // открываем готовый вид (с «как ты после»)
      setSelected(selected);
      setTab("calendar");
    },
    [selected, sessions, commit],
  );

  // Подобранная тренировка → обычная сессия с предзаполненным планом, дальше
  // открывается в существующем редакторе (отдельного «режима выполнения» нет).
  const createSuggestedWorkout = useCallback(
    (suggestion: WorkoutSuggestion) => {
      if (suggestion.kind !== "strength" || suggestion.exercises.length === 0) {
        // Восстановительная цель — лёгкая мобилити.
        const s = newSession(selected, "mobility", { mobilityKind: "stretching" });
        commit([...sessions, s]);
        setOpenId(s.id);
        setEditing(true);
        return;
      }
      const created: Exercise[] = [];
      const resolveExerciseId = (name: string, group: MuscleGroup): string => {
        const key = name.toLowerCase();
        const found =
          exercises.find((e) => e.name.toLowerCase() === key) ??
          created.find((e) => e.name.toLowerCase() === key);
        if (found) return found.id;
        const ex: Exercise = { id: newId(), name, muscleGroup: group, custom: true };
        created.push(ex);
        return ex.id;
      };
      const session = newSession(selected, "strength");
      session.exercises = suggestion.exercises.map((ex) => {
        const se = newSessionExercise(resolveExerciseId(ex.name, ex.group));
        se.sets = Array.from({ length: ex.sets }, () => ({
          ...newSet(),
          reps: ex.repMin,
          weight: ex.lastWeight ?? null,
        }));
        return se;
      });
      if (created.length > 0) {
        const nextEx = [...exercises, ...created];
        setExercises(nextEx);
        void saveCustomExercises(nextEx);
      }
      commit([...sessions, session]);
      setOpenId(session.id);
      setEditing(true);
    },
    [selected, sessions, exercises, commit],
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

  const changeFocusGoal = useCallback((goal: FocusGoal | null) => {
    setFocusGoal(goal);
    void saveFocusGoal(goal);
  }, []);

  const finishOnboarding = useCallback(() => {
    setOnboarded(true);
    void saveOnboarded(true);
  }, []);

  /** Заменить упражнение в шаблоне программы — по кнопке в тосте после замены. */
  const replaceInProgram = useCallback(
    (programId: string, workoutId: string, plannedExerciseId: string, exerciseId: string) => {
      setPrograms((prev) => {
        const next = prev.map((program) =>
          program.id !== programId
            ? program
            : {
                ...program,
                workouts: program.workouts.map((workout) =>
                  workout.id !== workoutId
                    ? workout
                    : {
                        ...workout,
                        exercises: workout.exercises.map((pe) =>
                          pe.id === plannedExerciseId ? { ...pe, exerciseId } : pe,
                        ),
                      },
                ),
              },
        );
        void savePrograms(next);
        return next;
      });
    },
    [],
  );

  const commitPrograms = useCallback((next: TrainingProgram[]) => {
    setPrograms(next);
    void savePrograms(next);
  }, []);

  const createProgram = useCallback(() => {
    const program = newProgram();
    commitPrograms([...programs, program]);
    setProgramEditId(program.id);
  }, [programs, commitPrograms]);

  // Добавить готовую программу из библиотеки: недостающие упражнения заводим
  // тут (в одном проходе, чтобы повторяющиеся имена не дублировались), затем
  // создаём программу и открываем её деталь.
  const addPreset = useCallback(
    (preset: ProgramPreset) => {
      const created: Exercise[] = [];
      const resolveExerciseId = (name: string, group: MuscleGroup): string => {
        const key = name.toLowerCase();
        const found =
          exercises.find((e) => e.name.toLowerCase() === key) ??
          created.find((e) => e.name.toLowerCase() === key);
        if (found) return found.id;
        const ex: Exercise = { id: newId(), name, muscleGroup: group, custom: true };
        created.push(ex);
        return ex.id;
      };
      const program = buildProgramFromPreset(preset, resolveExerciseId);
      if (created.length > 0) {
        const nextEx = [...exercises, ...created];
        setExercises(nextEx);
        void saveCustomExercises(nextEx);
      }
      commitPrograms([...programs, program]);
      setOpenProgramId(program.id);
    },
    [exercises, programs, commitPrograms],
  );

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
      const ready = readiness(sessions, recovery, date);
      const acwr = acuteChronicLoad(sessions, date);
      // Готовность и нагрузка дают модификатор дня; он одинаково подчиняет себе
      // и волну, и обычную авторегуляцию.
      const { modifier } = dayModifier(ready.score, ready.hasSignal, acwr.level);
      const weekType = currentWeekType(program, date);

      // Волна недель задаёт коридор (подходы, повторы, от какого веса плясать),
      // авторегуляция двигает внутри него. Без волны — прежняя авторегуляция.
      const wave =
        weekType && !deload
          ? wavePlan({
              workout,
              weekType,
              lastSameType: lastSameTypeSession(sessions, workout.id, weekType.id),
              lastAny: last,
              exercises,
              modifier,
            })
          : null;
      const plan =
        wave || deload
          ? null
          : autoregPlan({
              workout,
              lastSession: last,
              exercises,
              readinessScore: ready.score,
              readinessHasSignal: ready.hasSignal,
              acwrLevel: acwr.level,
            });
      const session = startProgramWorkout(
        { ...program, currentWorkoutIndex: index },
        workout,
        date,
        last,
        wave?.byPlanned ?? plan?.byPlanned,
      );
      // Лёгкая неделя — это разгрузка: в плато и базовую нагрузку не идёт.
      session.deload = deload || Boolean(weekType?.light);
      session.weekType = weekType ? { id: weekType.id, name: weekType.name } : null;
      commit([...sessions, session]);
      if (wave?.hasSignal) setToast(waveToast(wave, exercises));
      else if (plan?.hasSignal) setToast(autoregToast(plan, exercises));
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
      // Уходим из экранов программ, иначе открытая тренировка перекроется деталью.
      setShowPrograms(false);
      setOpenProgramId(null);
      setOpenId(session.id);
      setEditing(true);
    },
    [sessions, programs, recovery, exercises, commit, commitPrograms],
  );

  const pasteSession = useCallback(() => {
    if (!clipboard) return;
    const copy = copySessionTo(clipboard, selected);
    commit([...sessions, copy]);
    setOpenId(copy.id);
    setEditing(true);
  }, [clipboard, selected, sessions, commit]);

  // Открыть лист «Новая тренировка»: обычный выбор или сразу мастер «Тренер».
  const openCreate = useCallback((step: "kind" | "goal" = "kind") => {
    setDialogStart(step);
    setCreating(true);
  }, []);

  // «Повторить прошлую» из проактивного «Сегодня»: копия на сегодня, сразу в правку.
  const repeatSession = useCallback(
    (session: Session) => {
      const copy = copySessionTo(session, today());
      commit([...sessions, copy]);
      setOpenId(copy.id);
      setEditing(true);
    },
    [sessions, commit],
  );

  const closeSession = useCallback(() => {
    // Пустую недоделанную тренировку («потыкал и вышел») выбрасываем.
    const open = openId ? sessions.find((s) => s.id === openId) : null;
    if (open && isDiscardableSession(open)) {
      commit(sessions.filter((s) => s.id !== open.id));
    }
    setOpenId(null);
    setEditing(false);
  }, [openId, sessions, commit]);

  // Центральный «+» — быстрый лог: сегодняшний день, лист «новая тренировка».
  const logWorkout = useCallback(() => {
    setSelected(today());
    setTab("calendar");
    setDialogStart("kind");
    setCreating(true);
  }, []);

  const open = openId ? (sessions.find((s) => s.id === openId) ?? null) : null;
  // Завершённую тренировку по умолчанию показываем read-only.
  const showView = open && isDone(open) && !editing;
  const programBeingEdited = programEditId
    ? (programs.find((p) => p.id === programEditId) ?? null)
    : null;
  const programBeingViewed = openProgramId
    ? (programs.find((p) => p.id === openProgramId) ?? null)
    : null;

  return (
    <LangContext.Provider value={lang}>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {ready && !onboarded && (
        <OnboardingScreen
          focusGoal={focusGoal}
          onPickGoal={changeFocusGoal}
          onDone={finishOnboarding}
        />
      )}
      <Container maxWidth="sm" sx={{ py: 2 }}>
        {!ready ? null : showHiit ? (
          <HiitScreen
            initial={hiitCfg}
            onBack={() => setShowHiit(false)}
            onFinish={finishHiit}
            onConfigChange={setHiitCfg}
          />
        ) : programBeingEdited ? (
          <ProgramEditor
            program={programBeingEdited}
            exercises={exercises}
            onChange={updateProgram}
            onBack={() => setProgramEditId(null)}
            onArchive={() => archiveProgram(programBeingEdited.id)}
            onCreateExercise={createExercise}
          />
        ) : programBeingViewed ? (
          <ProgramDetail
            program={programBeingViewed}
            exercises={exercises}
            onBack={() => setOpenProgramId(null)}
            onStart={startProgramDay}
            onEdit={(p) => setProgramEditId(p.id)}
            onChange={(p) =>
              commitPrograms(programs.map((item) => (item.id === p.id ? p : item)))
            }
            onDelete={(p) => {
              archiveProgram(p.id);
              setOpenProgramId(null);
            }}
          />
        ) : showPrograms ? (
          <ProgramsScreen
            programs={programs}
            onBack={() => setShowPrograms(false)}
            onOpen={(p) => setOpenProgramId(p.id)}
            onCreate={createProgram}
            onAddPreset={addPreset}
          />
        ) : open ? (
          open.kind === "wod" ? (
            <WodEditor
              session={open}
              sessions={sessions}
              onChange={updateSession}
              onBack={closeSession}
              onDelete={() => {
                deleteSession(open.id);
                closeSession();
              }}
            />
          ) : open.kind === "recovery" ? (
            <RecoveryEditor
              session={open}
              onChange={updateSession}
              onBack={closeSession}
              onDelete={() => {
                deleteSession(open.id);
                closeSession();
              }}
            />
          ) : showView ? (
            <SessionView
              session={open}
              exercises={exercises}
              onChange={updateSession}
              onBack={closeSession}
              onEdit={() => setEditing(true)}
              onDelete={() => {
                deleteSession(open.id);
                closeSession();
              }}
              onCopyToClipboard={() => {
                setClipboard(open);
                setToast(t("Тренировка скопирована. Открой нужный день и нажми + → «Вставить тренировку»", "Workout copied. Open the day you want and tap + → “Paste workout”."));
              }}
            />
          ) : (
            <SessionEditor
              session={open}
              sessions={sessions}
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
              onReplaced={(info) => {
                setToast(
                  t(
                    `Заменил: ${info.fromName} → ${info.toName}`,
                    `Replaced: ${info.fromName} → ${info.toName}`,
                  ),
                );
                // Тренировка из программы — предлагаем поправить и шаблон.
                const programId = open.programId;
                const workoutId = open.programWorkoutId;
                const plannedId = info.plannedExerciseId;
                setToastAction(
                  programId && workoutId && plannedId
                    ? {
                        label: t("И в программе", "In program too"),
                        run: () =>
                          replaceInProgram(programId, workoutId, plannedId, info.exerciseId),
                      }
                    : null,
                );
              }}
              onCopyTo={(date) => {
                const copy = copySessionTo(open, date);
                commit([...sessions, copy]);
                setSelected(date);
                closeSession();
              }}
              onCopyToClipboard={() => {
                setClipboard(open);
                setToast(t("Тренировка скопирована. Открой нужный день и нажми + → «Вставить тренировку»", "Workout copied. Open the day you want and tap + → “Paste workout”."));
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
                  programs={programs}
                  recovery={recovery}
                  focusGoal={focusGoal}
                  selected={selected}
                  onSelect={setSelected}
                  onOpen={openSession}
                  onCreate={() => openCreate("kind")}
                  onDelete={deleteSession}
                  onChangeTime={changeSessionTime}
                  onStartProgramDay={(program, index) =>
                    startProgramDay(program, index, false, selected)
                  }
                  onSuggest={() => openCreate("goal")}
                  onOpenLibrary={() => setShowPrograms(true)}
                  onRepeatLast={repeatSession}
                />
                <NewSessionDialog
                  open={creating}
                  cardioKinds={cardioKinds}
                  mobilityKinds={mobilityKinds}
                  programs={programs}
                  hasClipboard={Boolean(clipboard)}
                  initialStep={dialogStart}
                  onClose={() => setCreating(false)}
                  onCreate={createSession}
                  onAddCustom={addCustomActivity}
                  onStartProgram={(program, index) =>
                    startProgramDay(program, index, false, selected)
                  }
                  onStartHiit={() => {
                    setCreating(false);
                    setShowHiit(true);
                  }}
                  onPaste={pasteSession}
                  onSuggested={createSuggestedWorkout}
                  sessions={sessions}
                  exercises={exercises}
                  focusGoal={focusGoal}
                />
              </>
            )}
            {tab === "history" && (
              <HistoryScreen
                sessions={sessions}
                exercises={exercises}
                onOpen={openSession}
                onDelete={deleteSession}
                onChangeTime={changeSessionTime}
              />
            )}
            {tab === "stats" && (
              <AnalyticsScreen
                sessions={sessions}
                exercises={exercises}
                programs={programs}
                recovery={recovery}
                focusGoal={focusGoal}
              />
            )}
            {tab === "profile" && (
              <ProfileScreen
                bodyEntries={bodyEntries}
                photos={photos}
                recovery={recovery}
                programs={programs}
                focusGoal={focusGoal}
                onOpenPrograms={() => setShowPrograms(true)}
                onChangeBody={changeBody}
                onChangePhotos={changePhotos}
                onChangeRecovery={changeRecovery}
                onChangeFocusGoal={changeFocusGoal}
                onChangeLang={changeLang}
              />
            )}
          </Box>
        )}

        <Snackbar
          open={Boolean(undo)}
          autoHideDuration={6000}
          onClose={() => setUndo(null)}
          message={t("Тренировка удалена", "Workout deleted")}
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
              {t("Отменить", "Undo")}
            </Button>
          }
        />

        <Snackbar
          open={Boolean(toast)}
          autoHideDuration={6000}
          onClose={() => {
            setToast(null);
            setToastAction(null);
          }}
          message={toast ?? ""}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          sx={{ bottom: { xs: 96 } }}
          action={
            toastAction ? (
              <Button
                size="small"
                onClick={() => {
                  toastAction.run();
                  setToast(null);
                  setToastAction(null);
                }}
              >
                {toastAction.label}
              </Button>
            ) : undefined
          }
        />
      </Container>

      {/* Плавающий стеклянный таб-бар поверх контента (в духе iOS 26).
          По ширине совпадает с контентом (maxWidth sm), с подписями. */}
      {ready && !open && !programBeingEdited && !programBeingViewed && !showPrograms && (
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
              label={t("Календарь", "Calendar")}
              onClick={() => setTab("calendar")}
            >
              <CalendarMonthIcon />
            </NavItem>
            <NavItem
              active={tab === "history"}
              label={t("История", "History")}
              onClick={() => setTab("history")}
            >
              <HistoryIcon />
            </NavItem>

            <IconButton
              onClick={logWorkout}
              aria-label={t("Добавить тренировку", "Add workout")}
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
              label={t("Аналитика", "Analytics")}
              onClick={() => setTab("stats")}
            >
              <InsightsIcon />
            </NavItem>
            <NavItem
              active={tab === "profile"}
              label={t("Профиль", "Profile")}
              onClick={() => setTab("profile")}
            >
              <PersonIcon />
            </NavItem>
          </Box>
        </Box>
      )}
    </ThemeProvider>
    </LangContext.Provider>
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
