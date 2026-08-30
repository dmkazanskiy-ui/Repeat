import { useId, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import EmojiEventsOutlinedIcon from "@mui/icons-material/EmojiEventsOutlined";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PriorityHighRounded from "@mui/icons-material/PriorityHighRounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import MetricChart from "../components/analytics/MetricChart";
import StrengthProgress from "../components/analytics/StrengthProgress";
import { RulerMeter, ScoreRing, WeekDots } from "../components/analytics/Meters";
import FitnessCenterOutlinedIcon from "@mui/icons-material/FitnessCenterOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import MonitorWeightOutlinedIcon from "@mui/icons-material/MonitorWeightOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import ListAltOutlinedIcon from "@mui/icons-material/ListAltOutlined";
import RepeatRoundedIcon from "@mui/icons-material/RepeatRounded";
import LoopRoundedIcon from "@mui/icons-material/LoopRounded";
import RadarChart from "../components/analytics/RadarChart";
import BodyMap from "../components/analytics/BodyMap";
import MuscleFocusCard from "../components/analytics/MuscleFocusCard";
import CapacitiesCard from "../components/analytics/CapacitiesCard";
import GoalLensCard from "../components/analytics/GoalLensCard";
import PlateauCard, { PLATEAU_COLOR } from "../components/analytics/PlateauCard";
import BodyPanel from "../components/BodyPanel";
import { TYPE_COLOR } from "../lib/activityColors";
import type { FocusGoal } from "../lib/workoutBuilder";
import RestBalanceCard from "../components/analytics/RestBalanceCard";
import SummaryHero from "../components/analytics/SummaryHero";
import type { HeroData } from "../components/analytics/SummaryHero";
import {
  activePlateaus,
  muscleFocus,
  FOCUS_WINDOW_DAYS,
  plateauDetail,
  formatWodResult,
  wodHistory,
  bucketKey,
  bucketStarts,
  buildPeriod,
  capacityProgress,
  compareMetric,
  goalVerdict,
  dayKeys,
  restBalance,
  consistency,
  isOngoing,
  distribution,
  heatmap,
  loadBaseline,
  movementBalance,
  muscleLoads,
  newRecordsInPeriod,
  programProgress,
  readiness,
  series,
  summarize,
  trainedExercises,
  averagePerActiveDay,
} from "../lib/analytics";
import type {
  BalanceRow,
  HeatCell,
  Muscle,
  PlateauDetail,
  WodSummary,
  MuscleLoad,
  WorkoutComparison,
} from "../lib/analytics";
import type { MetricComparison, MetricKey, PersonalRecord } from "../lib/analytics";
import type { PeriodMode } from "../lib/analytics";
import {
  CHART_METRICS,
  KPI_METRICS,
  METRIC_META,
  formatPercent,
} from "../lib/metricMeta";
import { areaPath, smoothPath } from "../lib/chart";
import { L, useLang, useT } from "../lib/i18n";
import type { Pt } from "../lib/chart";
import {
  weekdaysShort,
    addDays,
  formatDate,
  formatDuration,
  formatVolume,
  formatWeight,
  monthTitle,
  parseDateKey,
  today,
  weekGrid,
} from "../lib/format";
import { bestE1rm, exerciseName, isTrainingSession } from "../lib/types";
import type {
  BodyEntry,
  Exercise,
  ProgressPhoto,
  RecoveryEntry,
  Session,
  TrainingProgram,
} from "../lib/types";

interface Props {
  sessions: Session[];
  exercises: Exercise[];
  programs: TrainingProgram[];
  recovery: RecoveryEntry[];
  focusGoal: FocusGoal | null;
  /** Вкладка «Тело»: замеры и вход в галерею фото. */
  bodyEntries: BodyEntry[];
  photos: ProgressPhoto[];
  onChangeBody: (entries: BodyEntry[]) => void;
  onOpenPhotos: () => void;
}

// Разделы аналитики — по четырём вопросам пользователя.
type View = "volume" | "strength" | "muscles" | "recovery" | "body";

export default function AnalyticsScreen({
  sessions: allSessions,
  exercises,
  programs,
  recovery,
  focusGoal,
  bodyEntries,
  photos,
  onChangeBody,
  onOpenPhotos,
}: Props) {
  const t = useT();
  const lang = useLang();
  // Записи восстановления — не тренировки: в тренировочную аналитику (объём,
  // счётчики, сила, мышцы, heatmap) они не идут. Отдельная аналитика баланса
  // восстановления получит полный список отдельно (следующий этап).
  const sessions = useMemo(
    () => allSessions.filter(isTrainingSession),
    [allSessions],
  );
  const [mode, setMode] = useState<PeriodMode>("week");
  const [anchor, setAnchor] = useState(today());
  const [from, setFrom] = useState(addDays(today(), -29));
  const [to, setTo] = useState(today());
  const [metric, setMetric] = useState<MetricKey>("workouts");
  const [view, setView] = useState<View>("volume");
  const [lensGoal, setLensGoal] = useState<FocusGoal>(focusGoal ?? "strength");
  const [strengthOpen, setStrengthOpen] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false);
  // Подсветка мышцы на карте по тапу в сводке.
  const [focusMuscle, setFocusMuscle] = useState<Muscle | null>(null);
  // Плато: алерт вверху ведёт в раздел «Прогресс» и раскрывает первое плато.
  const [openPlateau, setOpenPlateau] = useState<string | null>(null);
  const plateauRef = useRef<HTMLDivElement>(null);

  function openPlateaus() {
    setView("strength");
    setOpenPlateau(plateaus[0]?.id ?? null);
    // Ререндер раздела успевает пройти до скролла.
    window.setTimeout(
      () => plateauRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      60,
    );
  }

  const period = useMemo(
    () => buildPeriod(mode, anchor, from, to),
    [mode, anchor, from, to],
  );

  const trained = useMemo(
    () => trainedExercises(sessions, exercises),
    [sessions, exercises, lang],
  );
  const capacities = useMemo(
    () => capacityProgress(sessions, period),
    [sessions, period, lang],
  );
  // Баланс отдыха считаем по ПОЛНОМУ списку (нужны и recovery-записи, и нагрузка),
  // а не по отфильтрованному от восстановления.
  const rest = useMemo(() => restBalance(allSessions, recovery), [allSessions, recovery, lang]);
  const records = useMemo(
    () => newRecordsInPeriod(sessions, exercises, period.startDate, period.endDate),
    [sessions, exercises, period, lang],
  );
  const cons = useMemo(() => consistency(sessions, period), [sessions, period]);
  // Нагрузка и heatmap — по текущей неделе / всей истории, не по периоду.
  const load = useMemo(() => loadBaseline(sessions), [sessions, lang]);
  // Даты восстановления (из полного списка) — красим ими пустые дни в heatmap.
  const recoveryDates = useMemo(
    () => new Set(allSessions.filter((s) => s.kind === "recovery").map((s) => s.date)),
    [allSessions],
  );
  // Для бар-графика «Итоги»: бакеты периода, где было восстановление, но НЕ было
  // тренировки — красим голубым (как пустые дни восстановления в heatmap).
  const heroRecoveryDays = useMemo(() => {
    const inPeriod = (d: string) => d >= period.startDate && d <= period.endDate;
    const trainingBuckets = new Set(
      sessions
        .filter((s) => inPeriod(s.date))
        .map((s) => bucketKey(s.date, period.aggregation)),
    );
    const recoveryBuckets = new Set(
      allSessions
        .filter((s) => s.kind === "recovery" && inPeriod(s.date))
        .map((s) => bucketKey(s.date, period.aggregation)),
    );
    return bucketStarts(period).map(
      (b) => recoveryBuckets.has(b) && !trainingBuckets.has(b),
    );
  }, [sessions, allSessions, period]);
  const heat = useMemo(() => heatmap(sessions, 12, today(), recoveryDates), [sessions, recoveryDates]);
  const ready = useMemo(() => readiness(sessions, recovery), [sessions, recovery, lang]);
  // Активность текущей недели точками — для блока регулярности.
  const weekActive = useMemo(() => {
    const set = new Set(sessions.map((s) => s.date));
    return weekGrid(today()).map((d) => set.has(d));
  }, [sessions]);
  const todayIdx = (parseDateKey(today()).getDay() + 6) % 7;
  const plateaus = useMemo(
    () => activePlateaus(sessions, exercises),
    [sessions, exercises, lang],
  );
  // Задания (HYROX/WOD) — по всей истории, а не по периоду: их делают редко.
  const wods = useMemo(() => wodHistory(allSessions), [allSessions, lang]);
  // Разбор каждого плато: динамика по неделям + рекомендации.
  const plateauDetails = useMemo(
    () =>
      plateaus
        .map((p) => plateauDetail(sessions, exercises, p.id))
        .filter((d): d is PlateauDetail => d != null),
    [plateaus, sessions, exercises, lang],
  );
  // Сводка прогресса силы: сколько упражнений растёт/стабильно/снижается +
  // лидеры роста по изменению e1RM. Чтобы не листать десятки карточек.
  const strengthSummary = useMemo(() => {
    let up = 0;
    let flat = 0;
    let down = 0;
    const movers: Array<{ name: string; delta: number }> = [];
    for (const ex of trained) {
      if (ex.trend === "up") up += 1;
      else if (ex.trend === "down") down += 1;
      else if (ex.trend === "flat") flat += 1;
      const e = ex.points.filter((p) => p.e1rm != null);
      if (e.length >= 2) {
        movers.push({ name: ex.name, delta: e[e.length - 1].e1rm! - e[0].e1rm! });
      }
    }
    const gainers = movers
      .filter((m) => m.delta > 0.5)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 3);
    return { up, flat, down, plateau: plateaus.length, gainers };
  }, [trained, plateaus, lang]);
  const dist = useMemo(
    () => distribution(sessions, period.startDate, period.endDate),
    [sessions, period, lang],
  );
  const muscles = useMemo(
    () => muscleLoads(sessions, exercises, period),
    [sessions, exercises, period, lang],
  );
  const balance = useMemo(
    () => movementBalance(sessions, exercises, period.startDate, period.endDate),
    [sessions, exercises, period, lang],
  );
  // Баланс инерционен: на недельном окне один пропущенный день ног читается как
  // «дыра». Поэтому сводка всегда считается за четыре недели, независимо от
  // выбранного периода — об этом прямо написано в карточке.
  const focus = useMemo(() => {
    const end = today();
    const start = addDays(end, -(FOCUS_WINDOW_DAYS - 1));
    const window = buildPeriod("custom", end, start, end);
    return muscleFocus({
      loads: muscleLoads(sessions, exercises, window),
      balance: movementBalance(sessions, exercises, start, end),
      strengthSessions: sessions.filter(
        (s) => s.kind === "strength" && s.date >= start && s.date <= end,
      ).length,
      goal: focusGoal,
    });
  }, [sessions, exercises, focusGoal, lang]);
  // Прогресс по программе — по всей истории активной программы, вне периода.
  const programCompare = useMemo(() => {
    const active = programs.find((p) => !p.archivedAt);
    return active ? programProgress(active, sessions, exercises) : [];
  }, [programs, sessions, exercises, lang]);
  const summary = useMemo(
    () => summarize(sessions, period.startDate, period.endDate),
    [sessions, period],
  );

  // Линза цели: вердикт «как идёшь к цели» под выбранную цель.
  const lensVerdict = useMemo(
    () =>
      goalVerdict({
        goal: lensGoal,
        perWeek: cons.perWeek,
        streak: cons.currentStreak,
        readiness01: ready.score,
        restWarningHigh: rest.warning?.severity === "high",
        strengthUp: strengthSummary.up,
        plateau: strengthSummary.plateau,
        recordsCount: records.length,
        volumePercent: compareMetric(sessions, period, "volume").percent,
        endurance: capacities.find((c) => c.key === "endurance"),
        speed: capacities.find((c) => c.key === "speed"),
        cardioKm: summary.distance / 1000,
      }),
    [lensGoal, cons, ready, rest, strengthSummary, records, sessions, period, capacities, summary, lang],
  );

  // Лучший e1RM внутри периода + упражнение — для инсайта «Лучший результат».
  const bestInPeriod = useMemo(() => {
    let best = 0;
    let name = "";
    for (const s of sessions) {
      if (s.kind !== "strength") continue;
      if (s.date < period.startDate || s.date > period.endDate) continue;
      for (const ex of s.exercises) {
        const v = bestE1rm(ex);
        if (v != null && v > best) {
          best = v;
          name = exerciseName(exercises.find((e) => e.id === ex.exerciseId));
        }
      }
    }
    return best > 0 ? { value: best, name } : null;
  }, [sessions, exercises, period, lang]);

  // Дневные ряды для мини-спарклайнов инсайтов (по дням периода).
  const heroSparks = useMemo(() => {
    const days = dayKeys(period.startDate, period.endDate);
    const inP = (d: string) => d >= period.startDate && d <= period.endDate;
    const dist = new Map<string, number>();
    const sets = new Map<string, number>();
    const e1rmDay = new Map<string, number>();
    const mobByDay = new Map<string, number>();
    for (const s of sessions) {
      if (s.date < period.startDate || s.date > period.endDate) continue;
      if (s.kind === "cardio") {
        dist.set(s.date, (dist.get(s.date) ?? 0) + (s.cardio?.distanceM ?? 0));
      }
      if (s.kind === "mobility") {
        mobByDay.set(s.date, (mobByDay.get(s.date) ?? 0) + 1);
      }
      if (s.kind === "strength") {
        let ss = 0;
        let best = 0;
        for (const ex of s.exercises) {
          ss += ex.sets.length;
          const v = bestE1rm(ex);
          if (v != null && v > best) best = v;
        }
        sets.set(s.date, (sets.get(s.date) ?? 0) + ss);
        if (best > 0) e1rmDay.set(s.date, Math.max(e1rmDay.get(s.date) ?? 0, best));
      }
    }
    // Лучший результат — накопительный максимум e1RM (растущая линия).
    let run = 0;
    const best = days.map((d) => {
      const v = e1rmDay.get(d);
      if (v && v > run) run = v;
      return run;
    });
    // Рекорды — накопительное число за период.
    const recByDay = new Map<string, number>();
    for (const r of records) recByDay.set(r.achievedAt, (recByDay.get(r.achievedAt) ?? 0) + 1);
    let c = 0;
    const recordsCum = days.map((d) => {
      c += recByDay.get(d) ?? 0;
      return c;
    });
    // Восстановление — из полного списка (не тренировка), накопительно.
    const recovByDay = new Map<string, number>();
    for (const s of allSessions) {
      if (s.kind === "recovery" && inP(s.date)) {
        recovByDay.set(s.date, (recovByDay.get(s.date) ?? 0) + 1);
      }
    }
    let cm = 0;
    const mobilityCum = days.map((d) => {
      cm += mobByDay.get(d) ?? 0;
      return cm;
    });
    let cr = 0;
    const recoveryCum = days.map((d) => {
      cr += recovByDay.get(d) ?? 0;
      return cr;
    });
    return {
      cardio: days.map((d) => dist.get(d) ?? 0),
      sets: days.map((d) => sets.get(d) ?? 0),
      best,
      records: recordsCum,
      mobility: mobilityCum,
      recovery: recoveryCum,
    };
  }, [sessions, allSessions, period, records]);

  // Данные карточки-фокуса «Итоги».
  const hero: HeroData = useMemo(() => {
    const volCompare = compareMetric(sessions, period, "volume");
    const dailyVolume = series(sessions, period, "volume").map((p) => p.value);
    const wk = summary.workouts;
    const days = summary.activeDays;
    const modeWord = mode === "month" ? L("месяца", "month") : mode === "custom" ? L("периода", "period") : L("недели", "week");
    const compareWord =
      mode === "month" ? L("прошлому месяцу", "last month") : mode === "custom" ? L("прошлому периоду", "last period") : L("прошлой неделе", "last week");
    const pct = volCompare.percent;
    const up = strengthSummary.up;
    const inP = (d: string) => d >= period.startDate && d <= period.endDate;
    const mobilityCount = sessions.filter((s) => s.kind === "mobility" && inP(s.date)).length;
    const recoveryCount = allSessions.filter((s) => s.kind === "recovery" && inP(s.date)).length;
    return {
      title: `${L("Итоги", "Summary")}: ${modeWord}`,
      changeLabel: `${L("к", "vs")} ${compareWord}`,
      changePercent: pct,
      workoutsText: `${wk} ${lang === "ru" ? ruPlural(wk, "тренировка", "тренировки", "тренировок") : wk === 1 ? "workout" : "workouts"}`,
      daysText: `${L("в", "across")} ${days} ${lang === "ru" ? ruPlural(days, "тренировочном дне", "тренировочных днях", "тренировочных днях") : days === 1 ? "training day" : "training days"}`,
      volumeText: formatVolume(summary.volume),
      dailyVolume,
      recoveryDays: heroRecoveryDays,
      cardio: {
        value:
          summary.distance > 0
            ? `${(summary.distance / 1000).toFixed(1).replace(".", L(",", "."))} ${L("км", "km")}`
            : "—",
        sub: summary.distance > 0 ? L("дистанция", "distance") : L("нет кардио", "no cardio"),
        spark: heroSparks.cardio,
        color: "#f87171",
      },
      best: {
        prefix: bestInPeriod ? "e1RM" : undefined,
        value: bestInPeriod ? `${Math.round(bestInPeriod.value)} ${L("кг", "kg")}` : "—",
        sub: bestInPeriod
          ? bestInPeriod.name
            ? `«${bestInPeriod.name}»`
            : L("лучший подход периода", "best set of the period")
          : L("нет силовых данных", "no strength data"),
        spark: heroSparks.best,
        color: "#a78bfa",
      },
      records: {
        value: `${records.length}`,
        suffix: lang === "ru" ? ruPlural(records.length, "новый", "новых", "новых") : "new",
        sub: lang === "ru" ? ruPlural(records.length, "личный рекорд", "личных рекорда", "личных рекордов") : records.length === 1 ? "personal record" : "personal records",
        spark: heroSparks.records,
        color: "#f59e0b",
      },
      progress: {
        value: up > 0 ? `${up} ${L("упр.", "ex.")}` : "—",
        sub: up > 0 ? L("растут в силе", "gaining strength") : L("пока без роста", "no gains yet"),
        spark: heroSparks.sets,
        color: "#4ade80",
      },
      mobility: {
        value: mobilityCount > 0 ? `${mobilityCount}` : "—",
        suffix: mobilityCount > 0 ? (lang === "ru" ? ruPlural(mobilityCount, "сессия", "сессии", "сессий") : mobilityCount === 1 ? "session" : "sessions") : undefined,
        sub: mobilityCount > 0 ? L("мобилити", "mobility") : L("нет мобилити", "no mobility"),
        spark: heroSparks.mobility,
        color: "#4ade80",
      },
      recovery: {
        value: recoveryCount > 0 ? `${recoveryCount}` : "—",
        suffix: recoveryCount > 0 ? (lang === "ru" ? ruPlural(recoveryCount, "процедура", "процедуры", "процедур") : recoveryCount === 1 ? "session" : "sessions") : undefined,
        sub: recoveryCount > 0 ? L("восстановление", "recovery") : L("нет восстановления", "no recovery"),
        spark: heroSparks.recovery,
        color: "#38bdf8",
      },
    };
  }, [sessions, allSessions, period, summary, mode, strengthSummary, bestInPeriod, records, heroSparks, heroRecoveryDays, lang]);

  function shift(dir: number) {
    setAnchor(
      mode === "month" ? addMonthAnchor(anchor, dir) : addDays(anchor, dir * 7),
    );
  }

  function labelOf(key: string): string {
    if (period.aggregation === "day") {
      const d = parseDateKey(key).getDay();
      return weekdaysShort()[(d + 6) % 7];
    }
    return formatDate(key);
  }

  const rangeLabel =
    mode === "month"
      ? monthTitle(parseDateKey(anchor))
      : `${formatDate(period.startDate)} — ${formatDate(period.endDate)}`;

  const chartPoints = series(sessions, period, metric);
  // Предыдущий период той же длины и агрегации — для серой линии сравнения.
  const prevPoints = series(
    sessions,
    {
      startDate: period.comparison.startDate,
      endDate: period.comparison.endDate,
      aggregation: period.aggregation,
      comparison: period.comparison,
    },
    metric,
  );
  const avgPerDay = averagePerActiveDay(
    sessions,
    period.startDate,
    period.endDate,
    metric,
  );
  const metricTotal = summary[metric];

  if (sessions.length === 0) {
    return (
      <Box sx={{ pb: 10 }}>
        <Typography variant="h1" sx={{ mb: 2 }}>
          {t("Аналитика", "Analytics")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
          {t("Добавьте первую тренировку, чтобы увидеть аналитику.", "Add your first workout to see analytics.")}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 10 }}>
      <Typography variant="h1" sx={{ mb: 2 }}>
        {t("Аналитика", "Analytics")}
      </Typography>

      <ToggleButtonGroup
        value={mode}
        exclusive
        fullWidth
        size="small"
        onChange={(_, v) => v && setMode(v)}
        sx={{
          mb: 2,
          gap: 0.5,
          p: 0.5,
          borderRadius: 999,
          bgcolor: "action.hover",
          "& .MuiToggleButton-root": {
            border: 0,
            borderRadius: "999px !important",
            textTransform: "none",
            fontWeight: 600,
            color: "text.secondary",
            py: 0.75,
          },
          "& .MuiToggleButton-root.Mui-selected": {
            color: "primary.main",
            bgcolor: "rgba(74,222,128,0.14)",
            "&:hover": { bgcolor: "rgba(74,222,128,0.2)" },
          },
        }}
      >
        <ToggleButton value="week">{t("Неделя", "Week")}</ToggleButton>
        <ToggleButton value="month">{t("Месяц", "Month")}</ToggleButton>
        <ToggleButton value="custom">{t("Период", "Range")}</ToggleButton>
      </ToggleButtonGroup>

      {mode === "custom" ? (
        <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: "center" }}>
          <TextField
            type="date"
            label={t("С", "From")}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            sx={{ flex: 1 }}
          />
          <TextField
            type="date"
            label={t("По", "To")}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            sx={{ flex: 1 }}
          />
        </Stack>
      ) : (
        <Stack
          direction="row"
          sx={{ alignItems: "center", justifyContent: "space-between" }}
        >
          <IconButton onClick={() => shift(-1)} aria-label={t("Раньше", "Earlier")}>
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {rangeLabel}
          </Typography>
          <IconButton onClick={() => shift(1)} aria-label={t("Позже", "Later")}>
            <ChevronRightIcon />
          </IconButton>
        </Stack>
      )}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", textAlign: "center", mb: 2 }}
      >
        {t("сравнение с", "vs")} {formatDate(period.comparison.startDate)} —{" "}
        {formatDate(period.comparison.endDate)}
        {isOngoing(period) ? t(" · период ещё идёт", " · period in progress") : ""}
      </Typography>

      {/* Итоги периода — карточка-фокус с крупными числами и инсайтами 2×2 */}
      <SummaryHero hero={hero} />

      {/* Плато — маленький алерт под первым дашбордом, разбор живёт в «Прогрессе» */}
      {plateaus.length > 0 && (
        <Paper
          variant="outlined"
          onClick={openPlateaus}
          sx={{
            mb: 2,
            p: 1.25,
            borderRadius: 2,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            borderColor: alpha(PLATEAU_COLOR, 0.4),
            backgroundImage: `linear-gradient(100deg, ${alpha(PLATEAU_COLOR, 0.12)}, transparent 72%)`,
          }}
        >
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              flexShrink: 0,
              display: "grid",
              placeItems: "center",
              color: PLATEAU_COLOR,
              bgcolor: alpha(PLATEAU_COLOR, 0.18),
            }}
          >
            <PriorityHighRounded sx={{ fontSize: 18 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {plateaus.length === 1
                ? `${t("Плато", "Plateau")}: ${plateaus[0].name}`
                : `${t("Плато", "Plateaus")}: ${plateaus.length} ${t(
                    ruPlural(plateaus.length, "упражнение", "упражнения", "упражнений"),
                    plateaus.length === 1 ? "exercise" : "exercises",
                  )}`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("Разобрать в «Прогрессе»", "See the breakdown in Progress")}
            </Typography>
          </Box>
          <ChevronRightIcon fontSize="small" sx={{ color: "text.secondary" }} />
        </Paper>
      )}

      {/* Разделы — отвечают на 4 вопроса, чтобы не вываливать всё простынёй */}
      <Tabs
        value={view}
        onChange={(_, v: View) => setView(v)}
        variant="scrollable"
        scrollButtons={false}
        sx={{
          mb: 2,
          minHeight: 40,
          "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontSize: 14, px: 1.5 },
        }}
      >
        <Tab label={t("Объём", "Volume")} value="volume" />
        <Tab label={t("Прогресс", "Progress")} value="strength" />
        <Tab label={t("Мышцы", "Muscles")} value="muscles" />
        <Tab label={t("Восстановление", "Recovery")} value="recovery" />
        <Tab label={t("Тело", "Body")} value="body" />
      </Tabs>

      {view === "volume" && (
        <>
      {/* KPI: сетка по 2 в ряд, друг под другом */}
      <Box
        sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1 }}
      >
        {KPI_METRICS.map((m) => (
          <KpiCard
            key={m}
            metric={m}
            comparison={compareMetric(sessions, period, m)}
            spark={series(sessions, period, m).map((p) => p.value)}
          />
        ))}
      </Box>

      {/* Главный интерактивный график */}
      <Paper variant="outlined" sx={{ p: 2, mt: 2, borderRadius: 2 }}>
        <Box
          sx={{ display: "flex", gap: 0.5, overflowX: "auto", mb: 1, pb: 0.5 }}
        >
          {CHART_METRICS.map((m) => (
            <Chip
              key={m}
              label={METRIC_META[m].label}
              size="small"
              onClick={() => setMetric(m)}
              color={metric === m ? "primary" : "default"}
              variant={metric === m ? "filled" : "outlined"}
            />
          ))}
        </Box>
        <Typography variant="h2">{METRIC_META[metric].format(metricTotal)}</Typography>
        <Typography variant="caption" color="text.secondary">
          {t("В среднем", "Avg")} {METRIC_META[metric].format(avgPerDay)} {t("за активный день", "per active day")}
        </Typography>
        <MetricChart
          points={chartPoints}
          previous={prevPoints}
          average={avgPerDay}
          format={METRIC_META[metric].format}
          labelOf={labelOf}
        />
      </Paper>

      {/* Распределение активности */}
      {dist.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h2" sx={{ mb: 1.5 }}>
            {t("Распределение", "Distribution")}
          </Typography>
          {dist.length >= 3 ? (
            <RadarChart
              data={dist.map((slice) => ({ label: slice.label, value: slice.count }))}
              formatValue={(v) => String(Math.round(v))}
            />
          ) : (
            <Stack spacing={1}>
              {dist.map((slice) => (
                <DistributionBar key={slice.key} slice={slice} />
              ))}
            </Stack>
          )}
        </Box>
      )}

      {/* Регулярность */}
      <Typography variant="h2" sx={{ mt: 3, mb: 1.5 }}>
        {t("Регулярность", "Consistency")}
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, mb: 1.5, borderRadius: 2 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", mb: 1.5 }}>
          <Typography variant="subtitle2" sx={{ flex: 1 }}>
            {t("Эта неделя", "This week")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            🔥 {t("серия", "streak")} {cons.currentStreak}
          </Typography>
        </Stack>
        <WeekDots active={weekActive} labels={weekdaysShort()} todayIndex={todayIdx} />
      </Paper>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1 }}>
        <StatTile value={`${cons.activeDays}`} label={t("Активных дней", "Active days")} />
        <StatTile value={cons.perWeek.toFixed(1).replace(".", L(",", "."))} label={t("Тренировок в неделю", "Workouts / week")} />
        <StatTile value={`${cons.longestStreak}`} label={t("Лучшая серия", "Best streak")} />
        <StatTile value={`${Math.round(cons.activeWeekRatio * 100)}%`} label={t("Активных недель", "Active weeks")} />
      </Box>

      {/* Календарная heatmap активности */}
      <Typography variant="h2" sx={{ mt: 3, mb: 1.5 }}>
        {t("Активность", "Activity")}
      </Typography>
      <Heatmap grid={heat} />
        </>
      )}

      {view === "strength" && (
        <>
      {/* Плато — разбор: динамика по неделям и что делать */}
      <Box ref={plateauRef}>
        <PlateauCard
          details={plateauDetails}
          openId={openPlateau}
          onToggle={(id) => setOpenPlateau((prev) => (prev === id ? null : id))}
        />
      </Box>

      {/* Линза цели «как идёшь к цели» — с селектором цели */}
      {sessions.length > 0 && (
        <GoalLensCard goal={lensGoal} verdict={lensVerdict} onChangeGoal={setLensGoal} />
      )}

      {/* Что развивается — сила / выносливость / скорость */}
      <Typography variant="h2" sx={{ mb: 1.5 }}>
        {t("Что развивается", "What's improving")}
      </Typography>
      <CapacitiesCard items={capacities} />

      {/* Прогресс силы — дашборд без проваливания в каждое упражнение */}
      <Typography variant="h2" sx={{ mt: 4, mb: 1.5 }}>
        {t("Прогресс силы", "Strength progress")}
      </Typography>
      {trained.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t("Занеси несколько силовых с весом и повторами — появится прогресс.", "Log a few strength workouts with weight and reps — progress will show here.")}
        </Typography>
      ) : (
        <>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1 }}>
              <StatusCount value={strengthSummary.up} label={t("растут", "rising")} tone="up" />
              <StatusCount value={strengthSummary.flat} label={t("стабильны", "steady")} tone="flat" />
              <StatusCount value={strengthSummary.down} label={t("снижаются", "falling")} tone="flat" />
              <StatusCount value={strengthSummary.plateau} label={t("плато", "plateau")} tone="warn" />
            </Box>
            {strengthSummary.gainers.length > 0 && (
              <>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 2, mb: 1 }}
                >
                  {t("Лидеры роста e1RM", "e1RM gainers")}
                </Typography>
                <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                  {strengthSummary.gainers.map((g) => (
                    <Chip
                      key={g.name}
                      size="small"
                      color="primary"
                      variant="outlined"
                      label={`${exerciseName(g)} +${Math.round(g.delta)} ${L("кг", "kg")}`}
                    />
                  ))}
                </Box>
              </>
            )}
          </Paper>
          <Button
            fullWidth
            onClick={() => setStrengthOpen((v) => !v)}
            endIcon={
              <ExpandMoreIcon
                sx={{ transition: "transform .2s", transform: strengthOpen ? "rotate(180deg)" : "none" }}
              />
            }
            sx={{ mt: 1, justifyContent: "space-between", px: 2 }}
          >
            {t("Детализация по упражнениям", "Per-exercise detail")} · {trained.length}
          </Button>
          <Collapse in={strengthOpen} unmountOnExit>
            <Box sx={{ mt: 1 }}>
              <StrengthProgress exercises={trained} sessions={sessions} />
            </Box>
          </Collapse>
        </>
      )}

      {/* Рекорды — свежие сверху, остальные под дропдауном */}
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 4, mb: 1.5 }}>
        <EmojiEventsOutlinedIcon sx={{ color: "#f59e0b", fontSize: 22 }} />
        <Typography variant="h2">{t("Рекорды", "Records")}</Typography>
        {records.length > 0 && (
          <Chip
            size="small"
            label={`+${records.length} ${t("за период", "this period")}`}
            sx={{ height: 22, fontSize: 11, bgcolor: "rgba(74,222,128,0.12)", color: "primary.main" }}
          />
        )}
      </Stack>
      {records.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t("За выбранный период новых рекордов нет.", "No new records for the selected period.")}
        </Typography>
      ) : (
        <>
          <Stack spacing={1.25}>
            {records.slice(0, 2).map((r, i) => (
              <RecordRow key={`${r.type}-${r.exerciseId ?? "g"}-${i}`} record={r} />
            ))}
          </Stack>
          {records.length > 2 && (
            <>
              <Button
                fullWidth
                onClick={() => setRecordsOpen((v) => !v)}
                endIcon={
                  <ExpandMoreIcon
                    sx={{ transition: "transform .2s", transform: recordsOpen ? "rotate(180deg)" : "none" }}
                  />
                }
                sx={{ mt: 1.25, justifyContent: "space-between", px: 2 }}
              >
                {t("Ещё", "More")} {records.length - 2}
              </Button>
              <Collapse in={recordsOpen} unmountOnExit>
                <Stack spacing={1.25} sx={{ mt: 1.25 }}>
                  {records.slice(2).map((r, i) => (
                    <RecordRow key={`more-${r.type}-${r.exerciseId ?? "g"}-${i}`} record={r} />
                  ))}
                </Stack>
              </Collapse>
            </>
          )}
        </>
      )}

      {/* Прогресс по программе A→A */}
      {programCompare.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h2" sx={{ mb: 1.5 }}>
            {t("Прогресс по программе", "Program progress")}
          </Typography>
          <Stack spacing={2}>
            {programCompare.map((c) => (
              <ProgramCompareCard key={c.workoutId} c={c} />
            ))}
          </Stack>
        </Box>
      )}

      {/* Задания: HYROX и кроссфит-бенчмарки — одно и то же задание во времени */}
      {wods.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h2" sx={{ mb: 1.5 }}>
            {t("Задания и WOD", "Workouts & WODs")}
          </Typography>
          <Stack spacing={1.25}>
            {wods.map((w) => (
              <WodRow key={w.key} summary={w} />
            ))}
          </Stack>
        </Box>
      )}
        </>
      )}

      {view === "body" && (
        <BodyPanel
          bodyEntries={bodyEntries}
          photos={photos}
          onChangeBody={onChangeBody}
          onOpenPhotos={onOpenPhotos}
        />
      )}

      {view === "muscles" && (
        <>
      <MuscleFocusCard focus={focus} onPick={setFocusMuscle} />
      {muscles.length > 0 ? (
        <Box>
          <Typography variant="h2" sx={{ mb: 0.5 }}>
            {t("Мышечные группы", "Muscle groups")}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
            {t("Эквивалентные подходы с учётом вторичной нагрузки. Классификация упражнений предварительная.", "Equivalent sets counting secondary load. Exercise classification is preliminary.")}
          </Typography>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 1.5 }}>
            <BodyMap loads={muscles} highlight={focusMuscle} />
          </Paper>
          <Stack spacing={1.25}>
            {muscles.map((load) => (
              <MuscleBar key={load.muscle} load={load} max={muscles[0].adjustedSets} />
            ))}
          </Stack>
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {t("Занеси силовые с весом и повторами — появится нагрузка по мышцам.", "Log strength workouts with weight and reps — muscle load will show here.")}
        </Typography>
      )}

      {balance.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h2" sx={{ mb: 1.5 }}>
            {t("Баланс движений", "Movement balance")}
          </Typography>
          <Stack spacing={1.5}>
            {balance.map((row) => (
              <BalanceBar key={row.key} row={row} />
            ))}
          </Stack>
        </Box>
      )}
        </>
      )}

      {view === "recovery" && (
        <>
      {/* Баланс отдыха — тяжёлые дни подряд, отдых, предупреждение */}
      <Typography variant="h2" sx={{ mb: 1 }}>
        {t("Баланс отдыха", "Rest balance")}
      </Typography>
      <RestBalanceCard balance={rest} />

      {/* Персональная нагрузка недели */}
      <Typography variant="h2" sx={{ mt: 3, mb: 1 }}>
        {t("Нагрузка недели", "Weekly load")}
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", mb: 1.5 }}>
          <Typography variant="h2" sx={{ fontWeight: 700, flex: 1 }}>
            {load.currentSets} <Typography component="span" variant="body2" color="text.secondary">{t("рабочих подходов", "working sets")}</Typography>
          </Typography>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              color:
                load.level === "above" || load.level === "wellAbove"
                  ? "warning.main"
                  : "text.secondary",
            }}
          >
            {load.levelLabel}
          </Typography>
        </Stack>
        <RulerMeter
          position={load.ratio == null ? null : Math.min(1, load.ratio / 2)}
          warn={load.level === "above" || load.level === "wellAbove"}
        />
        <Stack direction="row" sx={{ justifyContent: "space-between", mt: 0.5, mb: 1 }}>
          <Typography variant="caption" color="text.secondary">{t("ниже", "low")}</Typography>
          <Typography variant="caption" color="text.secondary">{t("обычно", "usual")}</Typography>
          <Typography variant="caption" color="text.secondary">{t("выше", "high")}</Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {load.ratio != null
            ? `${t("Твой обычный объём", "Your usual volume")} ≈ ${Math.round(load.baselineSets)} ${t("подх./нед", "sets/wk")} (${t("по", "over")} ${load.weeksUsed} ${t("нед.", "wk")})`
            : t("Персональная норма ещё копится — нужно несколько недель.", "Your baseline is still building — needs a few weeks.")}
        </Typography>
        {rest.acwr.ratio != null && (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 1 }}>
            <Box
              sx={{
                px: 1,
                py: 0.25,
                borderRadius: 1,
                fontSize: 12,
                fontWeight: 700,
                color: rest.acwr.level === "high" ? "warning.main" : "text.secondary",
                bgcolor:
                  rest.acwr.level === "high"
                    ? "rgba(237, 162, 59, 0.12)"
                    : "action.hover",
              }}
            >
              {t("Острая:хроническая", "Acute:chronic")} ×{rest.acwr.ratio.toFixed(1).replace(".", L(",", "."))}
            </Box>
            <Typography variant="caption" color="text.secondary">
              {rest.acwr.level === "high"
                ? t("резкий скачок нагрузки", "sharp load spike")
                : rest.acwr.level === "low"
                  ? t("нагрузка ниже привычной", "load below usual")
                  : t("в оптимальном коридоре", "in the optimal range")}
            </Typography>
          </Stack>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          {t("Оценка по подходам. Данных о пульсе и RPE нет — предварительная.", "Estimated from sets. No heart-rate or RPE data — preliminary.")}
        </Typography>
      </Paper>

      {/* Готовность к нагрузке */}
      <Typography variant="h2" sx={{ mt: 3, mb: 1 }}>
        {t("Готовность", "Readiness")}
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          {ready.hasSignal ? (
            <ScoreRing
              fraction={ready.score5! / 5}
              center={ready.score5!.toFixed(1).replace(".", L(",", "."))}
              sub={t("из 5", "of 5")}
            />
          ) : (
            <ScoreRing fraction={0} center="—" sub={t("нет отметки", "no entry")} />
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              {ready.hasSubjective
                ? t("По твоей отметке", "From your check-in")
                : ready.feelFromSessions != null
                  ? t("По самочувствию после тренировок", "From how you felt after workouts")
                  : t("Предварительная оценка", "Preliminary estimate")}
              {ready.hasSubjective && ready.subjectiveDate
                ? ` · ${formatDate(ready.subjectiveDate)}`
                : ""}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              {ready.daysSinceStrength != null
                ? `${t("Последняя силовая", "Last strength")} ${ready.daysSinceStrength === 0 ? t("сегодня", "today") : `${ready.daysSinceStrength} ${t("дн. назад", "days ago")}`}. `
                : ""}
              {t("Нагрузка недели", "Weekly load")} {ready.loadLevelLabel}.
            </Typography>
            {!ready.hasSignal && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                {t("Отметь «Как ты после?» в завершённой тренировке или самочувствие в Профиле — оценка станет точнее.", "Mark “How do you feel?” on a finished workout or your check-in in Profile — the estimate will get more accurate.")}
              </Typography>
            )}
          </Box>
        </Stack>
      </Paper>
        </>
      )}

      {sessions.length < 4 && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 3 }}
        >
          {t("Аналитика ещё формируется — для устойчивых трендов и сравнений нужно несколько тренировок.", "Analytics is still building — a few workouts are needed for stable trends and comparisons.")}
        </Typography>
      )}
    </Box>
  );
}

/** Русское склонение по числу: 1 тренировка / 2 тренировки / 5 тренировок. */
function ruPlural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function addMonthAnchor(anchor: string, delta: number): string {
  const d = parseDateKey(anchor);
  const next = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Моно-иконка метрики (белая/приглушённая) — цвет только у графика и %. */
const KPI_ICON: Record<MetricKey, typeof FitnessCenterOutlinedIcon> = {
  workouts: FitnessCenterOutlinedIcon,
  activeDays: CalendarMonthOutlinedIcon,
  duration: ScheduleOutlinedIcon,
  volume: MonitorWeightOutlinedIcon,
  distance: PlaceOutlinedIcon,
  exercises: ListAltOutlinedIcon,
  sets: RepeatRoundedIcon,
  reps: LoopRoundedIcon,
};

function KpiCard({
  metric,
  comparison,
  spark,
}: {
  metric: MetricKey;
  comparison: MetricComparison;
  spark: number[];
}) {
  const theme = useTheme();
  const meta = METRIC_META[metric];
  const Icon = KPI_ICON[metric];
  const { trend, absolute, percent } = comparison;
  // Снижение не красим красным — только зелёный акцент на росте.
  const deltaColor = trend === "up" ? "primary.main" : "text.secondary";
  const sign = absolute > 0 ? "+" : absolute < 0 ? "−" : "";

  const gid = useId().replace(/:/g, "");
  const max = Math.max(1, ...spark);
  const n = spark.length;
  const green = theme.palette.primary.main;
  const pts: Pt[] = spark.map((v, i) => [
    (i / Math.max(1, n - 1)) * 100,
    30 - (v / max) * 22,
  ]);
  const line = smoothPath(pts);
  const area = areaPath(pts, 32, 0, 100);

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, display: "flex", flexDirection: "column" }}>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", color: "text.secondary", mb: 1 }}>
        <Icon sx={{ fontSize: 17 }} />
        <Typography variant="caption">{meta.label}</Typography>
      </Stack>
      <Typography sx={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>
        {meta.format(comparison.current)}
      </Typography>
      <Box
        component="svg"
        viewBox="0 0 100 32"
        preserveAspectRatio="none"
        sx={{ width: "100%", height: 34, my: 1.25, display: "block" }}
      >
        <defs>
          <linearGradient id={`spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={green} stopOpacity={0.26} />
            <stop offset="100%" stopColor={green} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#spark-${gid})`} />
        <path
          d={line}
          fill="none"
          stroke={green}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
        <Typography variant="body2" sx={{ color: deltaColor, fontWeight: 700 }}>
          {formatPercent(percent)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {sign}
          {meta.format(Math.abs(absolute))}
        </Typography>
      </Stack>
    </Paper>
  );
}

function DistributionBar({
  slice,
}: {
  slice: { label: string; count: number; duration: number; share: number };
}) {
  const t = useT();
  return (
    <Box>
      <Stack direction="row" sx={{ mb: 0.25 }}>
        <Typography variant="body2" sx={{ flex: 1 }}>
          {slice.label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {slice.count} {t("трен.", "wk")}
          {slice.duration ? ` · ${formatDuration(slice.duration)}` : ""}
        </Typography>
      </Stack>
      <Box sx={{ height: 8, borderRadius: 4, bgcolor: "action.hover" }}>
        <Box
          sx={{
            height: 8,
            borderRadius: 4,
            width: `${Math.max(4, slice.share * 100)}%`,
            bgcolor: "primary.main",
          }}
        />
      </Box>
    </Box>
  );
}

function Heatmap({ grid }: { grid: HeatCell[][] }) {
  const t = useT();
  // Прозрачность зелёного по уровню; день без тренировки — нейтральная клетка.
  // Колонки тянутся на всю ширину фрейма, клетки квадратные.
  const opacity = [0, 0.3, 0.55, 0.78, 1];
  return (
    <Box sx={{ display: "flex", gap: "4px", width: "100%" }}>
      {grid.map((col, i) => (
        <Box
          key={i}
          sx={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}
        >
          {col.map((cell) => {
            // Тренировка — зелёная по уровню; день восстановления без тренировки
            // — прозрачно-голубой (цвет восстановления); пусто — нейтрально.
            const trained = cell.level > 0;
            return (
              <Box
                key={cell.date}
                title={`${cell.date}${
                  cell.hasSession ? ` · ${cell.sets} ${t("подх.", "sets")}` : cell.recovery ? ` · ${t("восстановление", "recovery")}` : ""
                }`}
                sx={{
                  width: "100%",
                  aspectRatio: "1",
                  borderRadius: "3px",
                  bgcolor: trained ? "primary.main" : cell.recovery ? "#38bdf8" : "action.hover",
                  opacity: trained ? opacity[cell.level] : cell.recovery ? 0.32 : 1,
                }}
              />
            );
          })}
        </Box>
      ))}
    </Box>
  );
}

function MuscleBar({ load, max }: { load: MuscleLoad; max: number }) {
  const t = useT();
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 0.25, alignItems: "baseline" }}>
        <Typography variant="body2" sx={{ flex: 1 }}>
          {load.label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {load.directSets} {t("прям.", "direct")} · {Math.round(load.adjustedSets)} {t("экв.", "equiv.")}
          {load.daysSince != null ? ` · ${load.daysSince} ${t("дн. назад", "days ago")}` : ""}
        </Typography>
      </Stack>
      <Box sx={{ height: 8, borderRadius: 4, bgcolor: "action.hover" }}>
        <Box
          sx={{
            height: 8,
            borderRadius: 4,
            width: `${Math.max(4, (load.adjustedSets / (max || 1)) * 100)}%`,
            bgcolor: "primary.main",
          }}
        />
      </Box>
      <Typography variant="caption" color="text.secondary">
        {load.levelLabel}
      </Typography>
    </Box>
  );
}

function BalanceBar({ row }: { row: BalanceRow }) {
  const total = row.left + row.right || 1;
  const ratioText =
    row.left && row.right
      ? `${(row.left / row.right).toFixed(1).replace(".", ",")} : 1`
      : "—";
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 0.25 }}>
        <Typography variant="body2" sx={{ flex: 1 }}>
          {row.leftLabel} {row.left} · {row.rightLabel} {row.right}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {ratioText}
        </Typography>
      </Stack>
      <Box
        sx={{
          display: "flex",
          height: 8,
          borderRadius: 4,
          overflow: "hidden",
          bgcolor: "action.hover",
        }}
      >
        <Box sx={{ width: `${(row.left / total) * 100}%`, bgcolor: "primary.main" }} />
        <Box sx={{ width: `${(row.right / total) * 100}%`, bgcolor: "text.disabled" }} />
      </Box>
    </Box>
  );
}

const PROGRAM_COLOR = "#f59e0b";

/** Строка задания: последний результат, лучший и число попыток. */
function WodRow({ summary }: { summary: WodSummary }) {
  const t = useT();
  const color = TYPE_COLOR.wod;
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        borderRadius: 2,
        borderColor: alpha(color, 0.3),
        borderLeft: `3px solid ${color}`,
        backgroundImage: `linear-gradient(100deg, ${alpha(color, 0.1)}, transparent 72%)`,
      }}
    >
      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
            {summary.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {summary.attempts.length}{" "}
            {t(
              ruPlural(summary.attempts.length, "попытка", "попытки", "попыток"),
              summary.attempts.length === 1 ? "attempt" : "attempts",
            )}
            {summary.last ? ` · ${t("последняя", "last")} ${formatDate(summary.last.date)}` : ""}
          </Typography>
        </Box>
        <Box sx={{ textAlign: "right" }}>
          <Typography sx={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>
            {formatWodResult(summary.last)}
          </Typography>
          <Typography variant="caption" sx={{ color: summary.bestIsLast ? color : "text.secondary" }}>
            {summary.bestIsLast
              ? t("это лучший результат", "that's your best")
              : `${t("лучший", "best")} ${formatWodResult(summary.best)}`}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}

function ProgramCompareCard({ c }: { c: WorkoutComparison }) {
  const t = useT();
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        border: "1px solid",
        borderColor: alpha(PROGRAM_COLOR, 0.25),
        borderLeft: `3px solid ${PROGRAM_COLOR}`,
        backgroundImage: `linear-gradient(100deg, ${alpha(PROGRAM_COLOR, 0.1)}, transparent 72%)`,
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 1.5 }}>
        <Box
          sx={{
            width: 42,
            height: 42,
            borderRadius: 2,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            color: PROGRAM_COLOR,
            backgroundImage: `linear-gradient(135deg, ${alpha(PROGRAM_COLOR, 0.28)}, ${alpha(PROGRAM_COLOR, 0.08)})`,
          }}
        >
          <RepeatRoundedIcon fontSize="small" />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
            {c.workoutName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatDate(c.prevDate)} → {formatDate(c.currDate)}
          </Typography>
        </Box>
        {c.deload && (
          <Chip label={t("разгрузка", "deload")} size="small" variant="outlined" sx={{ height: 22, fontSize: 11, flexShrink: 0 }} />
        )}
      </Stack>

      <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75, mb: 1.5 }}>
        <Chip size="small" variant="outlined" icon={<ScheduleOutlinedIcon />} label={`${c.intervalDays} ${t("дн", "d")}`} />
        <Chip size="small" variant="outlined" icon={<ListAltOutlinedIcon />} label={`${t("план", "plan")} ${c.actualSets}/${c.plannedSets}`} />
        {c.swaps.map((swap) => (
          <Chip
            key={`${swap.from}-${swap.to}`}
            size="small"
            variant="outlined"
            icon={<SwapHorizRoundedIcon />}
            label={`${t("замена", "swap")}: ${swap.from} → ${swap.to}`}
          />
        ))}
        {c.missed.length > 0 && (
          <Chip size="small" variant="outlined" color="warning" label={`${t("пропущено", "missed")}: ${c.missed.join(", ")}`} />
        )}
      </Stack>

      <Divider sx={{ borderColor: alpha(PROGRAM_COLOR, 0.15) }} />

      <Stack spacing={1.25} sx={{ mt: 1.5 }}>
        {c.deltas.map((d) => (
          <DeltaRow key={d.exerciseId} d={d} deload={c.deload} />
        ))}
      </Stack>
    </Box>
  );
}

function DeltaRow({
  d,
  deload,
}: {
  d: WorkoutComparison["deltas"][number];
  deload: boolean;
}) {
  const t = useT();
  const kg = t("кг", "kg");
  const weightText =
    d.prevWeight != null && d.currWeight != null
      ? `${formatWeight(d.prevWeight)} → ${formatWeight(d.currWeight)} ${kg}`
      : d.currWeight != null
        ? `${formatWeight(d.currWeight)} ${kg}`
        : "—";
  const e1Change =
    d.prevE1rm != null && d.currE1rm != null
      ? Math.round(d.currE1rm - d.prevE1rm)
      : null;
  // Зелёным только рост; снижение (в т.ч. на разгрузке) — нейтрально.
  const up = d.status === "up";
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
      <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
        {d.name}
      </Typography>
      <Box sx={{ textAlign: "right", flexShrink: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.3 }}>
          {weightText}
        </Typography>
        {d.status === "new" ? (
          <Typography variant="caption" color="text.secondary">
            {t("новое упражнение", "new exercise")}
          </Typography>
        ) : (
          e1Change != null &&
          e1Change !== 0 && (
            <Typography
              variant="caption"
              sx={{ color: up ? "primary.main" : "text.secondary", fontWeight: 700, lineHeight: 1.3 }}
            >
              {e1Change > 0 ? "+" : ""}
              {e1Change} e1RM{deload && d.status === "down" ? ` · ${t("разгрузка", "deload")}` : ""}
            </Typography>
          )
        )}
      </Box>
    </Stack>
  );
}

function formatRecordValue(record: PersonalRecord, value: number): string {
  switch (record.type) {
    case "distance":
      return `${(value / 1000).toFixed(1).replace(".", L(",", "."))} ${L("км", "km")}`;
    case "duration":
      return formatDuration(value);
    case "sessionVolume":
    case "exerciseVolume":
      return formatVolume(value);
    default:
      return `${Math.round(value)} ${L("кг", "kg")}`;
  }
}

const RECORD_TITLE: Record<PersonalRecord["type"], string> = {
  e1rm: "e1RM",
  get weight() { return L("Рабочий вес", "Working weight"); },
  get exerciseVolume() { return L("Тоннаж упражнения", "Exercise tonnage"); },
  get sessionVolume() { return L("Тоннаж тренировки", "Session tonnage"); },
  get distance() { return L("Дистанция", "Distance"); },
  get duration() { return L("Длительность", "Duration"); },
};

/** Цвет и иконка рекорда по его типу — для плашки в карточке. */
function recordVisual(type: PersonalRecord["type"]): {
  color: string;
  Icon: typeof PlaceOutlinedIcon;
} {
  switch (type) {
    case "distance":
      return { color: "#f472b6", Icon: PlaceOutlinedIcon };
    case "duration":
      return { color: "#38bdf8", Icon: ScheduleOutlinedIcon };
    case "exerciseVolume":
    case "sessionVolume":
      return { color: "#a78bfa", Icon: MonitorWeightOutlinedIcon };
    default:
      return { color: "#a78bfa", Icon: FitnessCenterOutlinedIcon };
  }
}

function RecordRow({ record }: { record: PersonalRecord }) {
  const t = useT();
  const { color, Icon } = recordVisual(record.type);
  const improvement =
    record.previousValue == null ? null : record.newValue - record.previousValue;
  return (
    <Box
      sx={{
        display: "flex",
        gap: 1.5,
        p: 1.75,
        borderRadius: 2,
        border: "1px solid",
        borderColor: alpha(color, 0.25),
        borderLeft: `3px solid ${color}`,
        backgroundImage: `linear-gradient(100deg, ${alpha(color, 0.1)}, transparent 72%)`,
      }}
    >
      <Box
        sx={{
          width: 42,
          height: 42,
          borderRadius: 2,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          color,
          backgroundImage: `linear-gradient(135deg, ${alpha(color, 0.28)}, ${alpha(color, 0.08)})`,
        }}
      >
        <Icon fontSize="small" />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, minWidth: 0 }} noWrap>
            {record.label}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
            {formatDate(record.achievedAt)}
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {RECORD_TITLE[record.type]}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", flexWrap: "wrap", rowGap: 0.5, mt: 0.5 }}>
          <Typography sx={{ fontSize: 21, fontWeight: 800, lineHeight: 1.1 }}>
            {formatRecordValue(record, record.newValue)}
          </Typography>
          {improvement != null && improvement > 0 && (
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.25,
                px: 0.75,
                py: 0.125,
                borderRadius: 999,
                bgcolor: "rgba(74,222,128,0.12)",
                color: "primary.main",
              }}
            >
              <TrendingUpRoundedIcon sx={{ fontSize: 14 }} />
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                +{formatRecordValue(record, improvement)}
              </Typography>
            </Box>
          )}
        </Stack>
        {record.previousValue != null && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
            {t("было", "was")} {formatRecordValue(record, record.previousValue)}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function StatusCount({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "up" | "flat" | "warn";
}) {
  // Акцент только у растущих (зелёный) и плато (янтарь); остальное нейтрально.
  const accent = tone === "up" ? "#4ade80" : tone === "warn" ? "#f59e0b" : null;
  const tinted = accent != null && value > 0;
  const color = value === 0 ? "text.disabled" : (accent ?? "text.primary");
  return (
    <Box
      sx={{
        p: 1.25,
        borderRadius: 2,
        textAlign: "center",
        border: "1px solid",
        borderColor: tinted ? alpha(accent, 0.25) : "divider",
        backgroundImage: tinted
          ? `linear-gradient(135deg, ${alpha(accent, 0.1)}, transparent 75%)`
          : "none",
        bgcolor: tinted ? "transparent" : "action.hover",
      }}
    >
      <Typography sx={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1.15 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Typography variant="h1" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Paper>
  );
}
