import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EditIcon from "@mui/icons-material/Edit";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import { exerciseName } from "../lib/types";
import type { Exercise, TrainingProgram } from "../lib/types";
import { currentWeekType, defaultWave, setCurrentWeek, waveIndexFor } from "../lib/wave";
import { today } from "../lib/format";

interface Props {
  program: TrainingProgram;
  exercises: Exercise[];
  onBack: () => void;
  onStart: (program: TrainingProgram, workoutIndex: number, deload: boolean) => void;
  onEdit: (program: TrainingProgram) => void;
  onDelete: (program: TrainingProgram) => void;
  /** Сохранить программу (волна недель правится прямо отсюда). */
  onChange: (program: TrainingProgram) => void;
}

import { useT } from "../lib/i18n";

export default function ProgramDetail({
  program,
  exercises,
  onBack,
  onStart,
  onEdit,
  onDelete,
  onChange,
}: Props) {
  const t = useT();
  const [deload, setDeload] = useState(false);
  const wave = program.wave ?? null;
  const week = currentWeekType(program, today());
  const activeIndex = wave ? waveIndexFor(wave, today()) : -1;
  const nameOf = (id: string) =>
    exerciseName(exercises.find((e) => e.id === id));
  const workouts = [...program.workouts].sort((a, b) => a.order - b.order);

  return (
    <Box sx={{ pb: 10 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
        <IconButton onClick={onBack} edge="start" aria-label={t("Назад", "Back")}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h1" sx={{ flex: 1 }} noWrap>
          {program.name}
        </Typography>
        <IconButton onClick={() => onEdit(program)} aria-label={t("Изменить", "Edit")}>
          <EditIcon />
        </IconButton>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
        <Chip size="small" variant="outlined" label={`${t("Круг", "Cycle")} ${program.cycleNumber}`} />
        <Chip size="small" variant="outlined" label={`${workouts.length} ${workouts.length === 1 ? t("тренировка", "workout") : t("тренировок", "workouts")}`} />
      </Stack>

      {program.description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, whiteSpace: "pre-wrap" }}>
          {program.description}
        </Typography>
      )}

      <Typography variant="h2" sx={{ mb: 1.5 }}>
        {t("Тренировки в программе", "Workouts in program")}
      </Typography>

      <Stack spacing={1}>
        {workouts.map((workout, index) => {
          const isNext = index === program.currentWorkoutIndex;
          const names = workout.exercises
            .map((pe) => nameOf(pe.exerciseId))
            .slice(0, 3)
            .join(" · ");
          return (
            <Paper
              key={workout.id}
              variant="outlined"
              onClick={() => onStart(program, index, deload)}
              sx={{
                p: 1.5,
                borderRadius: 2,
                cursor: "pointer",
                borderColor: isNext ? "primary.main" : undefined,
              }}
            >
              <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: 2,
                    flexShrink: 0,
                    display: "grid",
                    placeItems: "center",
                    bgcolor: "action.hover",
                    color: "primary.main",
                  }}
                >
                  <FitnessCenterIcon fontSize="small" />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Typography variant="subtitle2" noWrap>
                      {workout.name}
                    </Typography>
                    {isNext && (
                      <Chip label={t("следующая", "next")} size="small" color="primary" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
                    )}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                    {workout.exercises.length === 0
                      ? t("Пусто — добавь упражнения", "Empty — add exercises")
                      : `${workout.exercises.length} ${t("упр.", "ex.")} · ${names}${workout.exercises.length > 3 ? "…" : ""}`}
                  </Typography>
                </Box>
                <PlayArrowIcon fontSize="small" sx={{ color: "primary.main" }} />
              </Stack>
            </Paper>
          );
        })}
      </Stack>

      {/* Волна недель: тип недели считается по календарю, но его можно поправить. */}
      {wave ? (
        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mt: 2 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
              {t("Волна недель", "Week wave")}
            </Typography>
            <Button size="small" onClick={() => onEdit(program)}>
              {t("Настроить", "Configure")}
            </Button>
          </Stack>
          <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
            {wave.weeks.map((type, index) => (
              <Chip
                key={type.id}
                size="small"
                label={`${type.name} · ${type.sets}`}
                color={index === activeIndex ? "primary" : "default"}
                variant={index === activeIndex ? "filled" : "outlined"}
                onClick={() =>
                  onChange({ ...program, wave: setCurrentWeek(wave, today(), index) })
                }
              />
            ))}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            {week
              ? t(
                  `Сейчас ${week.name.toLowerCase()} неделя · ${week.sets} подх${week.light ? " · в плато не идёт" : ""}. `,
                  `Current week: ${week.name.toLowerCase()} · ${week.sets} sets${week.light ? " · excluded from plateaus" : ""}. `,
                )
              : ""}
            {t("Не та неделя? Нажми нужную.", "Wrong week? Tap the right one.")}
          </Typography>
        </Paper>
      ) : (
        <>
          <FormControlLabel
            control={<Switch checked={deload} onChange={(e) => setDeload(e.target.checked)} />}
            label={t("Разгрузочная неделя", "Deload week")}
            sx={{ mt: 1 }}
          />
          <Button
            fullWidth
            variant="outlined"
            onClick={() => onChange({ ...program, wave: defaultWave(today()) })}
            sx={{ mt: 1 }}
          >
            {t("Включить волну недель", "Turn on the week wave")}
          </Button>
        </>
      )}

      <Button
        fullWidth
        variant="contained"
        startIcon={<PlayArrowIcon />}
        onClick={() => onStart(program, program.currentWorkoutIndex, deload)}
        sx={{ mt: 1 }}
      >
        {t("Начать тренировку дня", "Start the day's workout")}
      </Button>
      <Button
        fullWidth
        color="error"
        startIcon={<DeleteOutlineIcon />}
        onClick={() => onDelete(program)}
        sx={{ mt: 1 }}
      >
        {t("Удалить программу", "Delete program")}
      </Button>
    </Box>
  );
}
