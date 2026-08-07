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

interface Props {
  program: TrainingProgram;
  exercises: Exercise[];
  onBack: () => void;
  onStart: (program: TrainingProgram, workoutIndex: number, deload: boolean) => void;
  onEdit: (program: TrainingProgram) => void;
  onDelete: (program: TrainingProgram) => void;
}

import { useT } from "../lib/i18n";

export default function ProgramDetail({
  program,
  exercises,
  onBack,
  onStart,
  onEdit,
  onDelete,
}: Props) {
  const t = useT();
  const [deload, setDeload] = useState(false);
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

      <FormControlLabel
        control={<Switch checked={deload} onChange={(e) => setDeload(e.target.checked)} />}
        label={t("Разгрузочная неделя", "Deload week")}
        sx={{ mt: 1 }}
      />

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
