import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Container,
  CssBaseline,
  Snackbar,
} from "@mui/material";
import { CalendarMonth as CalendarMonthIcon } from "./ui/icons";
import { History as HistoryIcon } from "./ui/icons";
import { Insights as InsightsIcon } from "./ui/icons";
import { Person as PersonIcon } from "./ui/icons";
import { Add as AddIcon } from "./ui/icons";
import { ThemeProvider } from "@mui/material/styles";
import { theme } from "./theme";
import RubberTabBar from "./components/RubberTabBar";
import { L, LangContext, loadLang, saveLang, setCurrentLang } from "./lib/i18n";
import { autoFinishStale, fixDurationOutliers } from "./lib/staleSessions";
import { runSync, takeResetNotice } from "./lib/sync";
import { get as dbGet, set as dbSet } from "./lib/db";
import { globalUnit, useGlobalUnit } from "./lib/units";
import type { ExerciseUnits, WeightUnit } from "./lib/units";
import { loadThemePref, MODE, onSystemModeChange, resolveMode } from "./lib/themeMode";
import { CONSENT_VERSION, isConsentValid, loadConsent, saveConsent } from "./lib/consent";
import type { Consent } from "./lib/consent";
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
  savePrograms,
  saveRecovery,
  saveSessions,
  startProgramWorkout,
} from "./lib/store";
import { newId } from "./lib/id";
import type { BackupData } from "./lib/backup";
import { setTelegramBack } from "./lib/telegram";
import { today } from "./lib/format";
import { diffDays } from "./lib/analytics/period";
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
import AdminScreen from "./screens/AdminScreen";
import { hello, takeLogoutNotice, useAccount } from "./lib/auth";
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
import type { Step as NewSessionStep } from "./components/NewSessionDialog";
import GooMenu from "./components/GooMenu";
import { ActivityIcon } from "./lib/icons";
import { LibraryBooksRounded } from "./ui/icons";
import type { CreateOptions } from "./components/NewSessionDialog";
import type { ProgramPreset } from "./lib/programLibrary";
import type { FocusGoal, WorkoutSuggestion } from "./lib/workoutBuilder";
import { cleanName, isDiscardableSession, isDone, normalizeProgramReps } from "./lib/types";
import { withCalorieEstimates } from "./lib/calories";
import type {
  BodyEntry,
  CustomActivity,
  Exercise,
  MuscleGroup,
  RecoveryEntry,
  Session,
  SessionKind,
  TrainingProgram,
} from "./lib/types";

type Tab = "calendar" | "history" | "stats" | "profile";
const TABS: Tab[] = ["calendar", "history", "stats", "profile"];

const EXERCISE_UNITS_KEY = "exercise_units";

function staleToast(n: number): string {
  return n === 1
    ? L("Тренировку без «Завершить» закрыли автоматически — время можно поправить", "A workout left running was closed automatically — you can adjust the time")
    : L(`Закрыли автоматически тренировок без «Завершить»: ${n}. Время можно поправить`, `Closed ${n} workouts left running. You can adjust the times`);
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [cardioKinds, setCardioKinds] = useState<CustomActivity[]>([]);
  const [mobilityKinds, setMobilityKinds] = useState<CustomActivity[]>([]);
  const [bodyEntries, setBodyEntries] = useState<BodyEntry[]>([]);
  const [programs, setPrograms] = useState<TrainingProgram[]>([]);
  const [recovery, setRecovery] = useState<RecoveryEntry[]>([]);
  const [focusGoal, setFocusGoal] = useState<FocusGoal | null>(null);
  const [onboarded, setOnboarded] = useState(true);
  const [consent, setConsent] = useState<Consent | null>(null);
  // Свои единицы веса упражнений (тренажёр в фунтах). Вес в данных — в кг.
  const [exerciseUnits, setExerciseUnits] = useState<ExerciseUnits>({});
  const weightUnit = useGlobalUnit();
  const [programEditId, setProgramEditId] = useState<string | null>(null);
  const [openProgramId, setOpenProgramId] = useState<string | null>(null);
  const [showPrograms, setShowPrograms] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showHiit, setShowHiit] = useState(false);
  const [hiitCfg, setHiitCfg] = useState<HiitConfig>(() => loadHiit());
  const [tab, setTab] = useState<Tab>("calendar");
  // Запрос из напоминания «обнови вес»: открыть «Тело» с формой замера.
  const [weightRequest, setWeightRequest] = useState(false);
  useEffect(() => {
    if (tab === "stats" && weightRequest) setWeightRequest(false);
  }, [tab, weightRequest]);
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
  const [dialogStart, setDialogStart] = useState<NewSessionStep>("kind");
  const [undo, setUndo] = useState<Session | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Необязательная кнопка у тоста («И в программе» после замены упражнения).
  const [toastAction, setToastAction] = useState<{ label: string; run: () => void } | null>(null);

  useEffect(() => {
    void loadConsent().then(setConsent);
    void dbGet<ExerciseUnits>(EXERCISE_UNITS_KEY).then((u) => setExerciseUnits(u ?? {}));
    load().then((data) => {
      // Зависшие таймеры: разово чиним историю и закрываем брошенные тренировки.
      const fixedOld = fixDurationOutliers(data.sessions);
      const stale = autoFinishStale(fixedOld.sessions, Date.now());
      const loaded = withCalorieEstimates(stale.sessions, data.bodyEntries);
      setSessions(loaded);
      if (takeResetNotice()) {
        setToast(L("Аккаунт и все данные удалены", "Account and all data deleted"));
      }
      if (takeLogoutNotice()) {
        setToast(L("Вы вышли — история осталась в аккаунте", "Signed out — your history stays in the account"));
      }
      if (fixedOld.fixed || stale.closed) {
        void saveSessions(loaded);
        setToast(staleToast(fixedOld.fixed + stale.closed));
      }
      setExercises(data.exercises);
      setCardioKinds(data.cardioKinds);
      setMobilityKinds(data.mobilityKinds);
      setBodyEntries(data.bodyEntries);
      // Перепутанные «от/до» повторов в старых программах чиним на загрузке.
      const programsFixed = data.programs.map(normalizeProgramReps);
      setPrograms(programsFixed);
      if (programsFixed.some((p, i) => p !== data.programs[i])) void savePrograms(programsFixed);
      setRecovery(data.recovery);
      setFocusGoal(data.focusGoal);
      // Онбординг — только для новых: если уже есть тренировки, не показываем.
      setOnboarded(data.onboarded || data.sessions.length > 0);
      setReady(true);
    });
  }, []);

  // Расчёт калорий проставляем в одной точке — на записи. Так аналитике не
  // нужно знать про вес: она читает готовое поле, а оценка не протухает,
  // пока вес меняется. Вес берём ближайший к дате тренировки.
  const bodyRef = useRef<BodyEntry[]>([]);
  bodyRef.current = bodyEntries;
  const sessionsRef = useRef<Session[]>([]);
  sessionsRef.current = sessions;
  const commit = useCallback((next: Session[]) => {
    // Любая правка идущей тренировки — отметка активности: по ней забытую
    // тренировку закроем через час тишины (см. staleSessions).
    const prevById = new Map(sessionsRef.current.map((s) => [s.id, s]));
    const nowIso = new Date().toISOString();
    const touched = next.map((s) =>
      s.startedAt && !s.endedAt && prevById.get(s.id) !== s ? { ...s, lastActivityAt: nowIso } : s,
    );
    const stamped = withCalorieEstimates(touched, bodyRef.current);
    setSessions(stamped);
    void saveSessions(stamped);
  }, []);

  const updateSession = useCallback(
    (updated: Session) => {
      commit(sessions.map((s) => (s.id === updated.id ? updated : s)));
    },
    [sessions, commit],
  );

  // «Авто»: системная тема сменилась на ходу — перезапускаемся в новой.
  useEffect(
    () =>
      onSystemModeChange(() => {
        if (loadThemePref() === "auto" && resolveMode("auto") !== MODE) window.location.reload();
      }),
    [],
  );

  // Вернулись в приложение — проверяем, не бросили ли тренировку.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      const res = autoFinishStale(sessionsRef.current, Date.now());
      if (res.closed) {
        commit(res.sessions);
        setToast(staleToast(res.closed));
      }
    };
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, 5 * 60_000);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(timer);
    };
  }, [commit]);

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
      const exercise: Exercise = { id: newId(), name: cleanName(name), muscleGroup: group, custom: true };
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

  const changeBody = useCallback(
    (next: BodyEntry[]) => {
      setBodyEntries(next);
      void saveBodyEntries(next);
      // Первый же занесённый вес должен оживить расчёт калорий во всей
      // истории — иначе он появится только при следующей правке тренировки.
      bodyRef.current = next;
      commit(sessionsRef.current);
    },
    [commit],
  );

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
    const c: Consent = { version: CONSENT_VERSION, at: new Date().toISOString() };
    setConsent(c);
    void saveConsent(c);
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

  // Снимок для выгрузки истории (без фото) и восстановление из вставки.
  const backupData: BackupData = {
    sessions,
    customExercises: exercises.filter((e) => e.custom),
    cardioKinds,
    mobilityKinds,
    bodyEntries,
    programs,
    recovery,
    focusGoal,
    consent,
    exerciseUnits,
  };
  // Синхронизация между устройствами (только в Telegram, см. lib/sync).
  // Пришедшие с сервера данные кладём напрямую, минуя commit: он ставит
  // отметку активности идущей тренировке, и устройства перебрасывались бы
  // ею бесконечно.
  const backupRef = useRef(backupData);
  backupRef.current = backupData;
  const applySynced = useCallback((next: BackupData) => {
    const stamped = withCalorieEstimates(next.sessions, next.bodyEntries);
    setSessions(stamped);
    void saveSessions(stamped);
    setExercises((prev) => {
      const ex = [...prev.filter((e) => !e.custom), ...next.customExercises];
      void saveCustomExercises(ex);
      return ex;
    });
    setCardioKinds(next.cardioKinds);
    void saveCardioKinds(next.cardioKinds);
    setMobilityKinds(next.mobilityKinds);
    void saveMobilityKinds(next.mobilityKinds);
    setBodyEntries(next.bodyEntries);
    void saveBodyEntries(next.bodyEntries);
    setPrograms(next.programs);
    void savePrograms(next.programs);
    setRecovery(next.recovery);
    void saveRecovery(next.recovery);
    setFocusGoal(next.focusGoal);
    void saveFocusGoal(next.focusGoal);
    setExerciseUnits(next.exerciseUnits ?? {});
    void dbSet(EXERCISE_UNITS_KEY, next.exerciseUnits ?? {});
    if (next.sessions.length > 0) {
      setOnboarded(true);
      void saveOnboarded(true);
    }
  }, []);
  const doSync = useCallback(async () => {
    const res = await runSync(() => backupRef.current);
    if (res?.kind === "data") applySynced(res.data);
    // Аккаунт удалён на другом устройстве: данные здесь уже стёрты.
    if (res?.kind === "reset") window.location.reload();
  }, [applySynced]);
  // Любая правка → обмен через 1,5 с (правки подряд склеиваются).
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => void doSync(), 1500);
    return () => window.clearTimeout(id);
  }, [ready, doSync, sessions, exercises, cardioKinds, mobilityKinds, bodyEntries, programs, recovery, focusGoal, consent, exerciseUnits]);

  /** Единица для упражнения: совпадает с общей — снимаем свою, иначе запоминаем. */
  const changeExerciseUnit = useCallback((exerciseId: string, unit: WeightUnit) => {
    setExerciseUnits((prev) => {
      const next = { ...prev };
      if (unit === globalUnit()) delete next[exerciseId];
      else next[exerciseId] = unit;
      void dbSet(EXERCISE_UNITS_KEY, next);
      return next;
    });
  }, []);
  // Вход: отметиться на сервере (посещение, «кто я», админка) и сразу
  // обменяться данными. Только после согласия — до него на сервер ничего не уходит.
  const account = useAccount();
  const consentOk = isConsentValid(consent);
  useEffect(() => {
    if (!ready || !consentOk || !account.authed) return;
    void hello();
    void doSync();
  }, [ready, consentOk, account.authed, doSync]);
  // И при возврате в приложение, и раз в минуту — чтобы подтянуть чужие правки.
  useEffect(() => {
    if (!ready) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void doSync();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void doSync(), 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [ready, doSync]);

  const restoreBackup = useCallback(
    (next: BackupData) => {
      commit(next.sessions);
      const ex = [...exercises.filter((e) => !e.custom), ...next.customExercises];
      setExercises(ex);
      void saveCustomExercises(ex);
      setCardioKinds(next.cardioKinds);
      void saveCardioKinds(next.cardioKinds);
      setMobilityKinds(next.mobilityKinds);
      void saveMobilityKinds(next.mobilityKinds);
      setBodyEntries(next.bodyEntries);
      void saveBodyEntries(next.bodyEntries);
      setPrograms(next.programs);
      void savePrograms(next.programs);
      setRecovery(next.recovery);
      void saveRecovery(next.recovery);
      setFocusGoal(next.focusGoal);
      void saveFocusGoal(next.focusGoal);
      if (next.exerciseUnits) {
        setExerciseUnits(next.exerciseUnits);
        void dbSet(EXERCISE_UNITS_KEY, next.exerciseUnits);
      }
      // Восстановили историю — онбординг больше не нужен.
      setOnboarded(true);
      void saveOnboarded(true);
    },
    [commit, exercises],
  );

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
  const logWorkout = useCallback((step: NewSessionStep = "kind") => {
    setSelected(today());
    setTab("calendar");
    setDialogStart(step);
    setCreating(true);
  }, []);

  // Вес старше двух недель — напоминаем: по нему считаются калории.
  // Тем, кто силовые не ведёт и вес не вносил ни разу, не надоедаем, пока нет тренировок.
  const lastWeightDate = bodyEntries
    .filter((b) => b.weightKg != null)
    .reduce<string | null>((max, b) => (max == null || b.date > max ? b.date : max), null);
  const weightAge = lastWeightDate ? diffDays(lastWeightDate, today()) : null;
  const weightStaleDays =
    lastWeightDate == null
      ? sessions.length > 0
        ? Infinity
        : null
      : weightAge != null && weightAge > 14
        ? weightAge
        : null;

  const open = openId ? (sessions.find((s) => s.id === openId) ?? null) : null;
  // Завершённую тренировку по умолчанию показываем read-only.
  const showView = open && isDone(open) && !editing;
  const programBeingEdited = programEditId
    ? (programs.find((p) => p.id === programEditId) ?? null)
    : null;
  const programBeingViewed = openProgramId
    ? (programs.find((p) => p.id === openProgramId) ?? null)
    : null;

  // Системная «Назад» Telegram — повторяет стрелку назад текущего экрана.
  // HIIT не трогаем: у него свой полноэкранный режим с таймером.
  const backHandler: (() => void) | null = showHiit
    ? null
    : programBeingEdited
      ? () => {
          const fixed = normalizeProgramReps(programBeingEdited);
          if (fixed !== programBeingEdited) updateProgram(fixed);
          setProgramEditId(null);
        }
      : programBeingViewed
        ? () => setOpenProgramId(null)
        : showAdmin && account.admin
          ? () => setShowAdmin(false)
          : showPrograms
            ? () => setShowPrograms(false)
            : open
              ? closeSession
              : null;
  const backRef = useRef(backHandler);
  backRef.current = backHandler;
  const hasBack = backHandler != null;
  useEffect(() => setTelegramBack(hasBack ? () => backRef.current?.() : null), [hasBack]);

  // Язык страницы — для VoiceOver: английский текст не читается русским голосом.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <LangContext.Provider value={lang}>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {ready && (!onboarded || !isConsentValid(consent)) && (
        <OnboardingScreen
          focusGoal={focusGoal}
          onPickGoal={changeFocusGoal}
          onDone={finishOnboarding}
          consentOnly={onboarded}
        />
      )}
      {/* key: смена общей единицы веса пересобирает экраны — все числа в новой единице. */}
      <Container key={weightUnit} maxWidth="sm" sx={{ py: 2 }}>
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
            exerciseUnits={exerciseUnits}
            onChange={updateProgram}
            onBack={() => {
              // Пока печатают, «от» может временно быть больше «до» — чиним на выходе.
              const fixed = normalizeProgramReps(programBeingEdited);
              if (fixed !== programBeingEdited) updateProgram(fixed);
              setProgramEditId(null);
            }}
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
        ) : showAdmin && account.admin ? (
          <AdminScreen onBack={() => setShowAdmin(false)} />
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
              exerciseUnits={exerciseUnits}
              onChange={updateSession}
              onBack={closeSession}
              onEdit={() => setEditing(true)}
              onCopyTo={(date) => {
                const copy = copySessionTo(open, date);
                commit([...sessions, copy]);
                setSelected(date);
                closeSession();
              }}
              onDelete={() => {
                deleteSession(open.id);
                closeSession();
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
              exerciseUnits={exerciseUnits}
              onExerciseUnit={changeExerciseUnit}
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
                  weightStaleDays={weightStaleDays}
                  onUpdateWeight={() => {
                    // Форма веса живёт в «Прогресс → Тело» — открываем её сразу.
                    setWeightRequest(true);
                    setTab("stats");
                  }}
                />
                <NewSessionDialog
                  open={creating}
                  cardioKinds={cardioKinds}
                  mobilityKinds={mobilityKinds}
                  programs={programs}
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
                bodyEntries={bodyEntries}
                onChangeBody={changeBody}
                startWithWeight={weightRequest}
              />
            )}
            {tab === "profile" && (
              <ProfileScreen
                recovery={recovery}
                programs={programs}
                focusGoal={focusGoal}
                onOpenPrograms={() => setShowPrograms(true)}
                onOpenAdmin={() => setShowAdmin(true)}
                onChangeRecovery={changeRecovery}
                onChangeFocusGoal={changeFocusGoal}
                onChangeLang={changeLang}
                backupData={backupData}
                allExercises={exercises}
                onRestore={restoreBackup}
              />
            )}
          </Box>
        )}

        <Snackbar
          open={Boolean(undo)}
          autoHideDuration={10000}
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
          autoHideDuration={10000}
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
      {ready && !open && !programBeingEdited && !programBeingViewed && !showPrograms && !(showAdmin && account.admin) && (
        <Box
          sx={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 20,
            // Закреплённый бар вместо плавающей капсулы: не перекрывает
            // контент и не съезжает от жестов.
            pb: "env(safe-area-inset-bottom, 0px)",
            bgcolor: "background.default",
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box
            sx={{
              maxWidth: 600,
              mx: "auto",
              height: 64,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              px: 1.5,
            }}
          >
            <RubberTabBar
              items={[
                { key: "calendar", label: t("Календарь", "Calendar"), icon: <CalendarMonthIcon /> },
                { key: "history", label: t("История", "History"), icon: <HistoryIcon /> },
                { key: "stats", label: t("Аналитика", "Analytics"), icon: <InsightsIcon /> },
                { key: "profile", label: t("Профиль", "Profile"), icon: <PersonIcon /> },
              ]}
              active={TABS.indexOf(tab)}
              onChange={(i) => setTab(TABS[i])}
              action={{
                label: t("Добавить тренировку", "Add workout"),
                icon: <AddIcon />,
                onClick: () => logWorkout(),
                // «+» выливает пузыри-действия (Goo Menu): частые старты в один тап.
                node: (
                  <GooMenu
                    label={t("Добавить тренировку", "Add workout")}
                    actions={[
                      { id: "program", label: t("Программа", "Program"), icon: <LibraryBooksRounded />, onSelect: () => logWorkout("program") },
                      { id: "strength", label: t("Силовая", "Strength"), icon: <ActivityIcon icon="gym" />, onSelect: () => {
                        // Силовая на сегодня — сразу в редактор.
                        const session = newSession(today(), "strength", {});
                        commit([...sessions, session]);
                        setSelected(today());
                        setTab("calendar");
                        setOpenId(session.id);
                        setEditing(true);
                      } },
                      { id: "cardio", label: t("Кардио", "Cardio"), icon: <ActivityIcon icon="run" />, onSelect: () => logWorkout("cardio") },
                      { id: "more", label: t("Ещё", "More"), icon: <AddIcon />, onSelect: () => logWorkout("kind") },
                    ]}
                  />
                ),
              }}
            />
          </Box>
        </Box>
      )}
    </ThemeProvider>
    </LangContext.Provider>
  );
}

