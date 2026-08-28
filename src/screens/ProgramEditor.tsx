import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
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
import type { PickerSection } from "../components/ExercisePickerDialog";
import { similarExercises } from "../lib/exerciseSuggest";
import { defaultWave } from "../lib/wave";
import { newId } from "../lib/id";
import { today } from "../lib/format";
import NumberField from "../components/NumberField";
import { newPlannedExercise, newProgramWorkout } from "../lib/store";
import { exerciseName } from "../lib/types";
import type {
  Exercise,
  MuscleGroup,
  PlannedExercise,
  ProgramWorkout,
  TrainingProgram,
  WeekType,
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

import { useT } from "../lib/i18n";

export default function ProgramEditor({
  program,
  exercises,
  onChange,
  onBack,
  onArchive,
  onCreateExercise,
}: Props) {
  const t = useT();
  // Пикер: добавить упражнение в тренировку или заменить конкретное в слоте.
  const [picker, setPicker] = useState<
    | { mode: "add"; workoutId: string }
    | { mode: "replace"; workoutId: string; plannedId: string; exerciseId: string }
    | null
  >(null);

  // Подборка «Похожие» для замены; истории тренировок в редакторе нет,
  // поэтому «ты уже делал» здесь не показываем.
  const pickerSections: PickerSection[] | undefined = useMemo(() => {
    if (picker?.mode !== "replace") return undefined;
    const target = exercises.find((e) => e.id === picker.exerciseId);
    if (!target) return undefined;
    const similar = similarExercises(target, exercises);
    return similar.length > 0
      ? [{ label: t("Похожие", "Similar"), exercises: similar }]
      : undefined;
  }, [picker, exercises, t]);

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

  function patchWeek(index: number, patch: Partial<WeekType>) {
    const wave = program.wave;
    if (!wave) return;
    onChange({
      ...program,
      wave: {
        ...wave,
        weeks: wave.weeks.map((w, i) => (i === index ? { ...w, ...patch } : w)),
      },
    });
  }

  function addWeek() {
    const wave = program.wave;
    if (!wave) return;
    onChange({
      ...program,
      wave: {
        ...wave,
        weeks: [
          ...wave.weeks,
          { id: newId(), name: t("Неделя", "Week"), sets: 3, repMin: 6, repMax: 8, percent: 100 },
        ],
      },
    });
  }

  function removeWeek(index: number) {
    const wave = program.wave;
    if (!wave || wave.weeks.length < 2) return;
    onChange({
      ...program,
      wave: { ...wave, weeks: wave.weeks.filter((_, i) => i !== index) },
    });
  }

  return (
    <Box sx={{ pb: 6 }}>
      <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: "center" }}>
        <IconButton onClick={onBack} edge="start" aria-label={t("Назад", "Back")}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="body2" color="text.secondary">
          {t("Программа", "Program")}
        </Typography>
      </Stack>

      <TextField
        fullWidth
        variant="standard"
        placeholder={t("Название программы", "Program name")}
        value={program.name}
        onChange={(e) => onChange({ ...program, name: e.target.value })}
        slotProps={{ input: { style: { fontSize: 24, fontWeight: 700 } } }}
        sx={{ mb: 1.5 }}
      />

      <TextField
        fullWidth
        multiline
        minRows={1}
        variant="standard"
        placeholder={t("Описание: для чего программа, как устроена", "Description: what it is for, how it works")}
        value={program.description ?? ""}
        onChange={(e) => onChange({ ...program, description: e.target.value || null })}
        sx={{ mb: 3 }}
      />

      {/* Волна недель: подходы, повторы и ориентир по весу для каждого типа */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 3, borderRadius: 2 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
            {t("Волна недель", "Week wave")}
          </Typography>
          {program.wave ? (
            <Button size="small" color="error" onClick={() => onChange({ ...program, wave: null })}>
              {t("Выключить", "Turn off")}
            </Button>
          ) : (
            <Button
              size="small"
              onClick={() => onChange({ ...program, wave: defaultWave(today()) })}
            >
              {t("Включить", "Turn on")}
            </Button>
          )}
        </Stack>

        {program.wave ? (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
              {t(
                "Недели идут по кругу и меняются по календарю. Вес считается от прошлой недели того же типа; процент — ориентир на первый раз.",
                "Weeks rotate and switch by calendar. Weight comes from the last week of the same type; the percentage is a first-time estimate.",
              )}
            </Typography>
            <Stack spacing={1.5}>
              {program.wave.weeks.map((type, index) => (
                <Box key={type.id}>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                    <TextField
                      variant="standard"
                      value={type.name}
                      onChange={(e) => patchWeek(index, { name: e.target.value })}
                      sx={{ flex: 1 }}
                    />
                    <Chip
                      size="small"
                      label={t("в плато не идёт", "skip in plateaus")}
                      color={type.light ? "warning" : "default"}
                      variant={type.light ? "filled" : "outlined"}
                      onClick={() => patchWeek(index, { light: !type.light })}
                    />
                    <IconButton
                      size="small"
                      aria-label={t("Убрать неделю", "Remove week")}
                      disabled={program.wave!.weeks.length < 2}
                      onClick={() => removeWeek(index)}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                    <NumberField
                      label={t("Подх.", "Sets")}
                      integer
                      value={type.sets}
                      onChange={(v) => patchWeek(index, { sets: Math.max(1, v ?? 1) })}
                      sx={{ width: 64 }}
                    />
                    <NumberField
                      label={t("Повт.", "Reps")}
                      integer
                      value={type.repMin ?? null}
                      onChange={(v) => patchWeek(index, { repMin: v })}
                      sx={{ width: 64 }}
                    />
                    <Typography sx={{ alignSelf: "center", color: "text.secondary" }}>–</Typography>
                    <NumberField
                      label=" "
                      integer
                      value={type.repMax ?? null}
                      onChange={(v) => patchWeek(index, { repMax: v })}
                      sx={{ width: 64 }}
                    />
                    <NumberField
                      label={t("% веса", "% weight")}
                      integer
                      value={type.percent ?? null}
                      onChange={(v) => patchWeek(index, { percent: v })}
                      sx={{ flex: 1 }}
                    />
                  </Stack>
                </Box>
              ))}
            </Stack>
            <Button size="small" startIcon={<AddIcon />} onClick={addWeek} sx={{ mt: 1 }}>
              {t("Тип недели", "Week type")}
            </Button>
          </>
        ) : (
          <Typography variant="caption" color="text.secondary">
            {t(
              "Без волны все недели одинаковые: подходы берутся из плана.",
              "Without a wave every week is the same: sets come from the plan.",
            )}
          </Typography>
        )}
      </Paper>

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
              aria-label={t("Выше", "Move up")}
              disabled={wi === 0}
              onClick={() => onChange({ ...program, workouts: reindex(move(workouts, wi, -1)) })}
            >
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label={t("Ниже", "Move down")}
              disabled={wi === workouts.length - 1}
              onClick={() => onChange({ ...program, workouts: reindex(move(workouts, wi, 1)) })}
            >
              <ArrowDownwardIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label={t("Удалить тренировку", "Delete workout")}
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
                const name = exerciseName(exercises.find((e) => e.id === pe.exerciseId));
                return (
                  <Box key={pe.id}>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                      <Typography
                        variant="body2"
                        noWrap
                        onClick={() =>
                          setPicker({
                            mode: "replace",
                            workoutId: workout.id,
                            plannedId: pe.id,
                            exerciseId: pe.exerciseId,
                          })
                        }
                        sx={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                      >
                        {name ?? t("Упражнение", "Exercise")}
                      </Typography>
                      <IconButton
                        size="small"
                        aria-label={t("Выше", "Move up")}
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
                        aria-label={t("Ниже", "Move down")}
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
                      {program.wave && (
                        <Chip
                          size="small"
                          label={t("фикс. подходы", "fixed sets")}
                          color={pe.waveExempt ? "warning" : "default"}
                          variant={pe.waveExempt ? "filled" : "outlined"}
                          onClick={() =>
                            patchPlanned(workout.id, pe.id, { waveExempt: !pe.waveExempt })
                          }
                          sx={{ height: 22, fontSize: 11 }}
                        />
                      )}
                      <IconButton
                        size="small"
                        aria-label={t("Убрать", "Remove")}
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
                        label={t("Подх.", "Sets")}
                        integer
                        value={pe.targetSets}
                        onChange={(v) => patchPlanned(workout.id, pe.id, { targetSets: v ?? 1 })}
                        sx={{ width: 64 }}
                      />
                      <NumberField
                        label={t("Повт.", "Reps")}
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
                        label={t("Вес, кг", "Weight, kg")}
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
            onClick={() => setPicker({ mode: "add", workoutId: workout.id })}
            sx={{ mt: 1 }}
          >
            {t("Упражнение", "Exercise")}
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
        {t("Добавить тренировку", "Add workout")}
      </Button>

      <Button fullWidth variant="contained" onClick={onBack} sx={{ mt: 2 }}>
        {t("Готово", "Done")}
      </Button>
      <Button fullWidth color="error" onClick={onArchive} sx={{ mt: 1 }}>
        {t("Архивировать программу", "Archive program")}
      </Button>

      <ExercisePickerDialog
        open={picker != null}
        exercises={exercises}
        title={
          picker?.mode === "replace"
            ? t("Заменить упражнение", "Replace exercise")
            : undefined
        }
        sections={pickerSections}
        onClose={() => setPicker(null)}
        onPick={(exerciseId) => {
          if (!picker) return;
          if (picker.mode === "replace") {
            // Слот остаётся: подходы, повторы, отдых и заметка не трогаются.
            updateWorkout(picker.workoutId, (w) => ({
              ...w,
              exercises: w.exercises.map((pe) =>
                pe.id === picker.plannedId ? { ...pe, exerciseId, targetWeight: null } : pe,
              ),
            }));
            return;
          }
          updateWorkout(picker.workoutId, (w) => ({
            ...w,
            exercises: [...w.exercises, newPlannedExercise(exerciseId, w.exercises.length)],
          }));
        }}
        onCreate={onCreateExercise}
      />
    </Box>
  );
}
