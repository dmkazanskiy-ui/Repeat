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
import AddIcon from "@mui/icons-material/Add";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import EditIcon from "@mui/icons-material/Edit";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import type { Exercise, TrainingProgram } from "../lib/types";

interface Props {
  programs: TrainingProgram[];
  exercises: Exercise[];
  onBack?: () => void;
  onStart: (program: TrainingProgram, workoutIndex: number, deload: boolean) => void;
  onEdit: (program: TrainingProgram) => void;
  onCreate: () => void;
}

export default function ProgramsScreen({
  programs,
  exercises,
  onBack,
  onStart,
  onEdit,
  onCreate,
}: Props) {
  const [deload, setDeload] = useState(false);
  const active = programs.filter((p) => !p.archivedAt);
  const program = active[0] ?? null;

  const nameOf = (id: string) =>
    exercises.find((e) => e.id === id)?.name ?? "Упражнение";

  return (
    <Box sx={{ pb: 10 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
        {onBack && (
          <IconButton onClick={onBack} edge="start" aria-label="Назад">
            <ArrowBackIcon />
          </IconButton>
        )}
        <Typography variant="h1">Программа</Typography>
      </Stack>

      {!program ? (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Собери сплит A/B/C/D — и запускай тренировку дня в один тап, с
            переносом весов и предзаполнением из плана.
          </Typography>
          <Button
            fullWidth
            variant="contained"
            startIcon={<AddIcon />}
            onClick={onCreate}
          >
            Создать программу
          </Button>
        </>
      ) : (
        <>
          <Stack
            direction="row"
            sx={{ alignItems: "center", justifyContent: "space-between", mb: 0.5 }}
          >
            <Typography variant="h2">{program.name}</Typography>
            <Button size="small" startIcon={<EditIcon />} onClick={() => onEdit(program)}>
              Изменить
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Круг {program.cycleNumber}
          </Typography>

          <Stack spacing={1} sx={{ mt: 2 }}>
            {[...program.workouts]
              .sort((a, b) => a.order - b.order)
              .map((workout, index) => {
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
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Typography variant="subtitle2" sx={{ flex: 1 }}>
                        {workout.name}
                      </Typography>
                      {isNext && (
                        <Chip
                          label="следующая"
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      )}
                      <PlayArrowIcon fontSize="small" sx={{ color: "primary.main" }} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {workout.exercises.length === 0
                        ? "Пусто — добавь упражнения"
                        : `${names}${workout.exercises.length > 3 ? "…" : ""}`}
                    </Typography>
                  </Paper>
                );
              })}
          </Stack>

          <FormControlLabel
            control={
              <Switch checked={deload} onChange={(e) => setDeload(e.target.checked)} />
            }
            label="Разгрузочная неделя"
            sx={{ mt: 1 }}
          />

          <Button
            fullWidth
            variant="contained"
            startIcon={<PlayArrowIcon />}
            onClick={() => onStart(program, program.currentWorkoutIndex, deload)}
            sx={{ mt: 1 }}
          >
            Начать тренировку дня
          </Button>
        </>
      )}
    </Box>
  );
}
