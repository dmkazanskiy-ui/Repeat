import { useMemo, useState } from "react";
import {
  Box,
  Chip,
  IconButton,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import MetricChart from "../components/analytics/MetricChart";
import StrengthProgress from "../components/analytics/StrengthProgress";
import {
  buildPeriod,
  compareMetric,
  consistency,
  isOngoing,
  distribution,
  movementBalance,
  muscleLoads,
  newRecordsInPeriod,
  programProgress,
  series,
  summarize,
  trainedExercises,
  averagePerActiveDay,
} from "../lib/analytics";
import type { BalanceRow, MuscleLoad, WorkoutComparison } from "../lib/analytics";
import type { MetricComparison, MetricKey, PersonalRecord } from "../lib/analytics";
import type { PeriodMode } from "../lib/analytics";
import {
  CHART_METRICS,
  KPI_METRICS,
  METRIC_META,
  formatPercent,
} from "../lib/metricMeta";
import {
  WEEKDAYS_SHORT,
  addDays,
  formatDate,
  formatDuration,
  formatVolume,
  formatWeight,
  monthTitle,
  parseDateKey,
  today,
} from "../lib/format";
import type { Exercise, Session, TrainingProgram } from "../lib/types";

interface Props {
  sessions: Session[];
  exercises: Exercise[];
  programs: TrainingProgram[];
}

export default function AnalyticsScreen({ sessions, exercises, programs }: Props) {
  const [mode, setMode] = useState<PeriodMode>("week");
  const [anchor, setAnchor] = useState(today());
  const [from, setFrom] = useState(addDays(today(), -29));
  const [to, setTo] = useState(today());
  const [metric, setMetric] = useState<MetricKey>("volume");

  const period = useMemo(
    () => buildPeriod(mode, anchor, from, to),
    [mode, anchor, from, to],
  );

  const trained = useMemo(
    () => trainedExercises(sessions, exercises),
    [sessions, exercises],
  );
  const records = useMemo(
    () => newRecordsInPeriod(sessions, exercises, period.startDate, period.endDate),
    [sessions, exercises, period],
  );
  const cons = useMemo(() => consistency(sessions, period), [sessions, period]);
  const dist = useMemo(
    () => distribution(sessions, period.startDate, period.endDate),
    [sessions, period],
  );
  const muscles = useMemo(
    () => muscleLoads(sessions, exercises, period),
    [sessions, exercises, period],
  );
  const balance = useMemo(
    () => movementBalance(sessions, exercises, period.startDate, period.endDate),
    [sessions, exercises, period],
  );
  // Прогресс по программе — по всей истории активной программы, вне периода.
  const programCompare = useMemo(() => {
    const active = programs.find((p) => !p.archivedAt);
    return active ? programProgress(active, sessions, exercises) : [];
  }, [programs, sessions, exercises]);
  const summary = useMemo(
    () => summarize(sessions, period.startDate, period.endDate),
    [sessions, period],
  );

  function shift(dir: number) {
    setAnchor(
      mode === "month" ? addMonthAnchor(anchor, dir) : addDays(anchor, dir * 7),
    );
  }

  function labelOf(key: string): string {
    if (period.aggregation === "day") {
      const d = parseDateKey(key).getDay();
      return WEEKDAYS_SHORT[(d + 6) % 7];
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
          Аналитика
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
          Добавьте первую тренировку, чтобы увидеть аналитику.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 10 }}>
      <Typography variant="h1" sx={{ mb: 2 }}>
        Аналитика
      </Typography>

      <ToggleButtonGroup
        value={mode}
        exclusive
        fullWidth
        size="small"
        onChange={(_, v) => v && setMode(v)}
        sx={{ mb: 2 }}
      >
        <ToggleButton value="week">Неделя</ToggleButton>
        <ToggleButton value="month">Месяц</ToggleButton>
        <ToggleButton value="custom">Период</ToggleButton>
      </ToggleButtonGroup>

      {mode === "custom" ? (
        <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: "center" }}>
          <TextField
            type="date"
            label="С"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            sx={{ flex: 1 }}
          />
          <TextField
            type="date"
            label="По"
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
          <IconButton onClick={() => shift(-1)} aria-label="Раньше">
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {rangeLabel}
          </Typography>
          <IconButton onClick={() => shift(1)} aria-label="Позже">
            <ChevronRightIcon />
          </IconButton>
        </Stack>
      )}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", textAlign: "center", mb: 2 }}
      >
        сравнение с {formatDate(period.comparison.startDate)} —{" "}
        {formatDate(period.comparison.endDate)}
        {isOngoing(period) ? " · период ещё идёт" : ""}
      </Typography>

      {/* KPI-лента: горизонтальная прокрутка */}
      <Box
        sx={{
          display: "flex",
          gap: 1,
          overflowX: "auto",
          pb: 1,
          mx: -0.5,
          px: 0.5,
          scrollSnapType: "x proximity",
        }}
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
          В среднем {METRIC_META[metric].format(avgPerDay)} за активный день
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
            Распределение
          </Typography>
          <Stack spacing={1}>
            {dist.map((slice) => (
              <DistributionBar key={slice.key} slice={slice} />
            ))}
          </Stack>
        </Box>
      )}

      {/* Мышечные группы */}
      {muscles.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h2" sx={{ mb: 0.5 }}>
            Мышечные группы
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
            Эквивалентные подходы с учётом вторичной нагрузки. Классификация
            упражнений предварительная.
          </Typography>
          <Stack spacing={1.25}>
            {muscles.map((load) => (
              <MuscleBar key={load.muscle} load={load} max={muscles[0].adjustedSets} />
            ))}
          </Stack>
        </Box>
      )}

      {/* Баланс движений */}
      {balance.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h2" sx={{ mb: 1.5 }}>
            Баланс движений
          </Typography>
          <Stack spacing={1.5}>
            {balance.map((row) => (
              <BalanceBar key={row.key} row={row} />
            ))}
          </Stack>
        </Box>
      )}

      {/* Прогресс по программе A→A */}
      {programCompare.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h2" sx={{ mb: 1.5 }}>
            Прогресс по программе
          </Typography>
          <Stack spacing={1.5}>
            {programCompare.map((c) => (
              <ProgramCompareCard key={c.workoutId} c={c} />
            ))}
          </Stack>
        </Box>
      )}

      {/* Прогресс силы */}
      <Typography variant="h2" sx={{ mt: 3, mb: 1.5 }}>
        Прогресс силы
      </Typography>
      <StrengthProgress exercises={trained} />

      {/* Рекорды */}
      <Typography variant="h2" sx={{ mt: 3, mb: 1.5 }}>
        Рекорды
        {records.length > 0 && (
          <Typography component="span" variant="body2" color="primary" sx={{ ml: 1 }}>
            +{records.length} за период
          </Typography>
        )}
      </Typography>
      {records.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          За выбранный период новых рекордов нет.
        </Typography>
      ) : (
        <Stack spacing={1}>
          {records.map((r, i) => (
            <RecordRow key={`${r.type}-${r.exerciseId ?? "g"}-${i}`} record={r} />
          ))}
        </Stack>
      )}

      {/* Регулярность */}
      <Typography variant="h2" sx={{ mt: 3, mb: 1.5 }}>
        Регулярность
      </Typography>
      <Box
        sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}
      >
        <StatTile value={`${cons.activeDays}`} label="Активных дней" />
        <StatTile value={cons.perWeek.toFixed(1).replace(".", ",")} label="Трен./нед" />
        <StatTile value={`${Math.round(cons.activeWeekRatio * 100)}%`} label="Активных недель" />
        <StatTile value={`${cons.currentStreak}`} label="Серия сейчас" />
        <StatTile value={`${cons.longestStreak}`} label="Лучшая серия" />
        <StatTile value={`${cons.workouts}`} label="Тренировок" />
      </Box>

      {sessions.length < 4 && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 3 }}
        >
          Аналитика ещё формируется — для устойчивых трендов и сравнений нужно
          несколько тренировок.
        </Typography>
      )}
    </Box>
  );
}

function addMonthAnchor(anchor: string, delta: number): string {
  const d = parseDateKey(anchor);
  const next = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
}

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
  const { trend, absolute, percent } = comparison;
  // Снижение не красим красным — только зелёный акцент на росте.
  const deltaColor = trend === "up" ? "primary.main" : "text.secondary";
  const sign = absolute > 0 ? "+" : absolute < 0 ? "−" : "";

  const max = Math.max(1, ...spark);
  const n = spark.length;
  const line = spark
    .map((v, i) => `${(i / Math.max(1, n - 1)) * 100},${28 - (v / max) * 26}`)
    .join(" ");

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        borderRadius: 2,
        minWidth: 132,
        flex: "0 0 auto",
        scrollSnapAlign: "start",
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {meta.label}
      </Typography>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
        {meta.format(comparison.current)}
      </Typography>
      <Box
        component="svg"
        viewBox="0 0 100 28"
        preserveAspectRatio="none"
        sx={{ width: "100%", height: 24, my: 0.5, display: "block" }}
      >
        <polyline
          points={line}
          fill="none"
          stroke={theme.palette.primary.main}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </Box>
      <Typography variant="caption" sx={{ color: deltaColor, fontWeight: 600 }}>
        {formatPercent(percent)}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {sign}
        {meta.format(Math.abs(absolute))}
      </Typography>
    </Paper>
  );
}

function DistributionBar({
  slice,
}: {
  slice: { label: string; count: number; duration: number; share: number };
}) {
  return (
    <Box>
      <Stack direction="row" sx={{ mb: 0.25 }}>
        <Typography variant="body2" sx={{ flex: 1 }}>
          {slice.label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {slice.count} трен.
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

function MuscleBar({ load, max }: { load: MuscleLoad; max: number }) {
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 0.25, alignItems: "baseline" }}>
        <Typography variant="body2" sx={{ flex: 1 }}>
          {load.label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {load.directSets} прям. · {Math.round(load.adjustedSets)} экв.
          {load.daysSince != null ? ` · ${load.daysSince} дн. назад` : ""}
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

function ProgramCompareCard({ c }: { c: WorkoutComparison }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", mb: 0.5 }}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          {c.workoutName} · {formatDate(c.prevDate)} → {formatDate(c.currDate)}
        </Typography>
        {c.deload && (
          <Chip label="разгрузка" size="small" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Интервал {c.intervalDays} дн · подходы плана {c.actualSets}/{c.plannedSets}
        {c.missed.length ? ` · пропущено: ${c.missed.join(", ")}` : ""}
      </Typography>
      <Stack spacing={0.5} sx={{ mt: 1 }}>
        {c.deltas.map((d) => (
          <DeltaRow key={d.exerciseId} d={d} deload={c.deload} />
        ))}
      </Stack>
    </Paper>
  );
}

function DeltaRow({
  d,
  deload,
}: {
  d: WorkoutComparison["deltas"][number];
  deload: boolean;
}) {
  const weightText =
    d.prevWeight != null && d.currWeight != null
      ? `${formatWeight(d.prevWeight)} → ${formatWeight(d.currWeight)} кг`
      : d.currWeight != null
        ? `${formatWeight(d.currWeight)} кг`
        : "—";
  const e1Change =
    d.prevE1rm != null && d.currE1rm != null
      ? Math.round(d.currE1rm - d.prevE1rm)
      : null;
  // Зелёным только рост; снижение (в т.ч. на разгрузке) — нейтрально.
  const color = d.status === "up" ? "primary.main" : "text.secondary";
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
      <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
        {d.name}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {weightText}
      </Typography>
      {d.status === "new" ? (
        <Typography variant="caption" color="text.secondary">
          новое
        </Typography>
      ) : (
        e1Change != null &&
        e1Change !== 0 && (
          <Typography variant="caption" sx={{ color, fontWeight: 600 }}>
            {e1Change > 0 ? "+" : ""}
            {e1Change} e1RM{deload && d.status === "down" ? " · разгрузка" : ""}
          </Typography>
        )
      )}
    </Stack>
  );
}

function formatRecordValue(record: PersonalRecord, value: number): string {
  switch (record.type) {
    case "distance":
      return `${(value / 1000).toFixed(1).replace(".", ",")} км`;
    case "duration":
      return formatDuration(value);
    case "sessionVolume":
    case "exerciseVolume":
      return formatVolume(value);
    default:
      return `${Math.round(value)} кг`;
  }
}

const RECORD_TITLE: Record<PersonalRecord["type"], string> = {
  e1rm: "e1RM",
  weight: "Рабочий вес",
  exerciseVolume: "Тоннаж упражнения",
  sessionVolume: "Тоннаж тренировки",
  distance: "Дистанция",
  duration: "Длительность",
};

function RecordRow({ record }: { record: PersonalRecord }) {
  const improvement =
    record.previousValue == null ? null : record.newValue - record.previousValue;
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
      <Stack direction="row" sx={{ alignItems: "baseline" }}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          {record.label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatDate(record.achievedAt)}
        </Typography>
      </Stack>
      <Typography variant="body2" sx={{ mt: 0.25 }}>
        {RECORD_TITLE[record.type]}: {formatRecordValue(record, record.newValue)}
        {improvement != null && improvement > 0 && (
          <Typography component="span" variant="caption" color="primary" sx={{ ml: 1 }}>
            +{formatRecordValue(record, improvement)}
          </Typography>
        )}
      </Typography>
      {record.previousValue != null && (
        <Typography variant="caption" color="text.secondary">
          было {formatRecordValue(record, record.previousValue)}
        </Typography>
      )}
    </Paper>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, textAlign: "center" }}>
      <Typography variant="h2" sx={{ fontWeight: 700 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Paper>
  );
}
