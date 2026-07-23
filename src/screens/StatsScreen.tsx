import { useMemo, useState } from "react";
import {
  Box,
  IconButton,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import ExerciseProgressDialog from "../components/ExerciseProgressDialog";
import {
  computeStats,
  monthRange,
  sessionsInRange,
  trainedExercises,
  weekRange,
} from "../lib/analytics";
import type { TrainedExercise } from "../lib/analytics";
import {
  addDays,
  formatDate,
  formatVolume,
  monthTitle,
  parseDateKey,
  today,
} from "../lib/format";
import type { Exercise, Session } from "../lib/types";

interface Props {
  sessions: Session[];
  exercises: Exercise[];
}

type Mode = "week" | "month" | "custom";

export default function StatsScreen({ sessions, exercises }: Props) {
  const [mode, setMode] = useState<Mode>("week");
  const [anchor, setAnchor] = useState(today());
  const [from, setFrom] = useState(addDays(today(), -29));
  const [to, setTo] = useState(today());
  const [openExercise, setOpenExercise] = useState<TrainedExercise | null>(null);

  const [rangeFrom, rangeTo] =
    mode === "week"
      ? weekRange(anchor)
      : mode === "month"
        ? monthRange(anchor)
        : [from, to];

  const stats = useMemo(
    () => computeStats(sessionsInRange(sessions, rangeFrom, rangeTo)),
    [sessions, rangeFrom, rangeTo],
  );

  // Тренд e1RM строим по всей истории, а не по периоду — так виден рост.
  const trained = useMemo(
    () => trainedExercises(sessions, exercises),
    [sessions, exercises],
  );

  function shift(delta: number) {
    setAnchor((a) => addDays(a, delta * (mode === "week" ? 7 : 30)));
  }

  const rangeLabel =
    mode === "week"
      ? `${formatDate(rangeFrom)} — ${formatDate(rangeTo)}`
      : monthTitle(parseDateKey(anchor));

  const tiles: Array<[string, string]> = [
    ["Тренировки", String(stats.workouts)],
    ["Дни", String(stats.days)],
    ["Недели", String(stats.weeks)],
    ["Часы", stats.hours ? stats.hours.toFixed(1).replace(".", ",") : "—"],
    ["Тоннаж", formatVolume(stats.volumeKg)],
    [
      "Дистанция",
      stats.distanceM
        ? `${(stats.distanceM / 1000).toFixed(1).replace(".", ",")} км`
        : "—",
    ],
    ["Упражнения", String(stats.exercises)],
    ["Подходы", String(stats.sets)],
    ["Повторы", String(stats.reps)],
  ];

  return (
    <Box sx={{ pb: 10 }}>
      <Typography variant="h1" sx={{ mb: 2 }}>
        Статистика
      </Typography>

      <ToggleButtonGroup
        value={mode}
        exclusive
        fullWidth
        size="small"
        onChange={(_, value) => value && setMode(value)}
        sx={{ mb: 2 }}
      >
        <ToggleButton value="week">Неделя</ToggleButton>
        <ToggleButton value="month">Месяц</ToggleButton>
        <ToggleButton value="custom">Период</ToggleButton>
      </ToggleButtonGroup>

      {mode === "custom" ? (
        <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: "center" }}>
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
          sx={{ mb: 2, alignItems: "center", justifyContent: "space-between" }}
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

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1,
        }}
      >
        {tiles.map(([label, value]) => (
          <Paper
            key={label}
            variant="outlined"
            sx={{ p: 1.5, borderRadius: 2, textAlign: "center" }}
          >
            <Typography variant="h2" sx={{ fontWeight: 700 }}>
              {value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
          </Paper>
        ))}
      </Box>

      <Typography variant="h2" sx={{ mt: 4, mb: 1.5 }}>
        Прогресс упражнений
      </Typography>

      {trained.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Занеси несколько силовых с весом и повторами — здесь появится тренд
          расчётного максимума по каждому упражнению.
        </Typography>
      ) : (
        <Stack spacing={1}>
          {trained.map((ex) => (
            <Paper
              key={ex.id}
              variant="outlined"
              onClick={() => setOpenExercise(ex)}
              sx={{
                p: 1.5,
                borderRadius: 2,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" noWrap>
                  {ex.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Лучший e1RM {Math.round(ex.best)} кг · {ex.points.length} трен.
                </Typography>
              </Box>
              <ChevronRightRoundedIcon sx={{ color: "text.secondary" }} />
            </Paper>
          ))}
        </Stack>
      )}

      <ExerciseProgressDialog
        exercise={openExercise}
        onClose={() => setOpenExercise(null)}
      />
    </Box>
  );
}
