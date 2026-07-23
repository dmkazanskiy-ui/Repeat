import { useState } from "react";
import {
  Box,
  Button,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ExercisePickerDialog from "../components/ExercisePickerDialog";
import NumberField from "../components/NumberField";
import { newPlannedExercise, newProgramWorkout } from "../lib/store";
import type {
  Exercise,
  MuscleGroup,
  PlannedExercise,
  ProgramWorkout,
  TrainingProgram,
} from "../lib/types";

interface Props {
  program: TrainingProgram;
  exercises: Exercise[];
  onChange: (program: TrainingProgram) => void;
  onBack: () => void;
  onArchive: () => void;
  onCreateExercise: (name: string, group: MuscleGroup) => Exercise;
}

function reindex<T extends { order: number }>(items: T[]): T[] {
  return items.map((it, i) => ({ ...it, order: i }));
}

function move<T>(items: T[], index: number, dir: number): T[] {
  const to = index + dir;
  if (to < 0 || to >= items.length) return items;
  const copy = [...items];
  [copy[index], copy[to]] = [copy[to], copy[index]];
  return copy;
}

export default function ProgramEditor({
  program,
  exercises,
  onChange,
  onBack,
  onArchive,
  onCreateExercise,
}: Props) {
  const [pickingFor, setPickingFor] = useState<string | null>(null);

  function updateWorkout(id: string, patch: (w: ProgramWorkout) => ProgramWorkout) {
    onChange({
      ...program,
      workouts: program.workouts.map((w) => (w.id === id ? patch(w) : w)),
    });
  }

  function patchPlanned(
    workoutId: string,
    peId: string,
    patch: Partial<PlannedExercise>,
  ) {
    updateWorkout(workoutId, (w) => ({
      ...w,
      exercises: w.exercises.map((pe) =>
        pe.id === peId ? { ...pe, ...patch } : pe,
      ),
    }));
  }

  const workouts = [...program.workouts].sort((a, b) => a.order - b.order);

  return (
    <Box sx={{ pb: 6 }}>
      <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: "center" }}>
        <IconButton onClick={onBack} edge="start" aria-label="Назад">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="body2" color="text.secondary">
          Программа
        </Typography>
      </Stack>

      <TextField
        fullWidth
        variant="standard"
        placeholder="Название программы"
        value={program.name}
        onChange={(e) => onChange({ ...program, name: e.target.value })}
        slotProps={{ input: { style: { fontSize: 24, fontWeight: 700 } } }}
        sx={{ mb: 3 }}
      />

      {workouts.map((workout, wi) => (
        <Paper key={workout.id} variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2 }}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mb: 1 }}>
            <TextField
              variant="standard"
              value={workout.name}
              onChange={(e) => updateWorkout(workout.id, (w) => ({ ...w, name: e.target.value }))}
              slotProps={{ input: { style: { fontSize: 18, fontWeight: 600 } } }}
              sx={{ flex: 1 }}
            />
            <IconButton
              size="small"
              aria-label="Выше"
              disabled={wi === 0}
              onClick={() => onChange({ ...program, workouts: reindex(move(workouts, wi, -1)) })}
            >
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label="Ниже"
              disabled={wi === workouts.length - 1}
              onClick={() => onChange({ ...program, workouts: reindex(move(workouts, wi, 1)) })}
            >
              <ArrowDownwardIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label="Удалить тренировку"
              onClick={() =>
                onChange({
                  ...program,
                  workouts: reindex(workouts.filter((w) => w.id !== workout.id)),
                })
              }
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Stack>

          <Stack spacing={1}>
            {[...workout.exercises]
              .sort((a, b) => a.order - b.order)
              .map((pe, pi, arr) => {
                const name = exercises.find((e) => e.id === pe.exerciseId)?.name;
                return (
                  <Box key={pe.id}>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                      <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                        {name ?? "Упражнение"}
                      </Typography>
                      <IconButton
                        size="small"
                        aria-label="Выше"
                        disabled={pi === 0}
                        onClick={() =>
                          updateWorkout(workout.id, (w) => ({
                            ...w,
                            exercises: reindex(move(arr, pi, -1)),
                          }))
                        }
                      >
                        <ArrowUpwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label="Ниже"
                        disabled={pi === arr.length - 1}
                        onClick={() =>
                          updateWorkout(workout.id, (w) => ({
                            ...w,
                            exercises: reindex(move(arr, pi, 1)),
                          }))
                        }
                      >
                        <ArrowDownwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label="Убрать"
                        onClick={() =>
                          updateWorkout(workout.id, (w) => ({
                            ...w,
                            exercises: reindex(w.exercises.filter((x) => x.id !== pe.id)),
                          }))
                        }
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                      <NumberField
                        label="Подх."
                        integer
                        value={pe.targetSets}
                        onChange={(v) => patchPlanned(workout.id, pe.id, { targetSets: v ?? 1 })}
                        sx={{ width: 64 }}
                      />
                      <NumberField
                        label="Повт."
                        integer
                        value={pe.targetRepMin ?? null}
                        onChange={(v) => patchPlanned(workout.id, pe.id, { targetRepMin: v })}
                        sx={{ width: 72 }}
                      />
                      <NumberField
                        label="–"
                        integer
                        value={pe.targetRepMax ?? null}
                        onChange={(v) => patchPlanned(workout.id, pe.id, { targetRepMax: v })}
                        sx={{ width: 64 }}
                      />
                      <NumberField
                        label="Вес, кг"
                        value={pe.targetWeight ?? null}
                        onChange={(v) => patchPlanned(workout.id, pe.id, { targetWeight: v })}
                        sx={{ flex: 1 }}
                      />
                    </Stack>
                  </Box>
                );
              })}
          </Stack>

          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setPickingFor(workout.id)}
            sx={{ mt: 1 }}
          >
            Упражнение
          </Button>
        </Paper>
      ))}

      <Button
        fullWidth
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={() =>
          onChange({
            ...program,
            workouts: [...workouts, newProgramWorkout(workouts.length)],
          })
        }
      >
        Добавить тренировку
      </Button>

      <Button fullWidth variant="contained" onClick={onBack} sx={{ mt: 2 }}>
        Готово
      </Button>
      <Button fullWidth color="error" onClick={onArchive} sx={{ mt: 1 }}>
        Архивировать программу
      </Button>

      <ExercisePickerDialog
        open={pickingFor != null}
        exercises={exercises}
        onClose={() => setPickingFor(null)}
        onPick={(exerciseId) => {
          if (!pickingFor) return;
          updateWorkout(pickingFor, (w) => ({
            ...w,
            exercises: [...w.exercises, newPlannedExercise(exerciseId, w.exercises.length)],
          }));
        }}
        onCreate={onCreateExercise}
      />
    </Box>
  );
}
