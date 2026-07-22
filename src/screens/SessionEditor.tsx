import { useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import AddIcon from "@mui/icons-material/Add";
import ExercisePickerDialog from "../components/ExercisePickerDialog";
import { newSessionExercise, newSet } from "../lib/store";
import { formatDateFull, formatPace } from "../lib/format";
import { CARDIO_LABELS, distanceUnit } from "../lib/types";
import type {
  CardioKind,
  Exercise,
  MuscleGroup,
  Session,
  SessionExercise,
} from "../lib/types";

interface Props {
  session: Session;
  exercises: Exercise[];
  onChange: (session: Session) => void;
  onDelete: () => void;
  onBack: () => void;
  onCreateExercise: (name: string, group: MuscleGroup) => Exercise;
  onCopyTo: (date: string) => void;
}

/** Пустая строка должна очищать поле, а не превращаться в 0. */
function toNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export default function SessionEditor({
  session,
  exercises,
  onChange,
  onDelete,
  onBack,
  onCreateExercise,
  onCopyTo,
}: Props) {
  const [picking, setPicking] = useState(false);
  const [copyDate, setCopyDate] = useState("");

  function patchExercise(
    id: string,
    patch: (exercise: SessionExercise) => SessionExercise,
  ) {
    onChange({
      ...session,
      exercises: session.exercises.map((e) => (e.id === id ? patch(e) : e)),
    });
  }

  const unit = distanceUnit(session.cardioKind);

  return (
    <Box sx={{ pb: 6 }}>
      <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: "center" }}>
        <IconButton onClick={onBack} edge="start" aria-label="Назад">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="body2" color="text.secondary">
          {formatDateFull(session.date)}
        </Typography>
      </Stack>

      <TextField
        fullWidth
        variant="standard"
        placeholder={
          session.kind === "cardio" && session.cardioKind
            ? CARDIO_LABELS[session.cardioKind]
            : "Название тренировки"
        }
        value={session.title ?? ""}
        onChange={(event) =>
          onChange({ ...session, title: event.target.value || null })
        }
        slotProps={{ input: { style: { fontSize: 24, fontWeight: 700 } } }}
        sx={{ mb: 3 }}
      />

      {session.kind === "cardio" && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <TextField
            select
            label="Вид"
            fullWidth
            value={session.cardioKind ?? "run"}
            onChange={(event) =>
              onChange({ ...session, cardioKind: event.target.value as CardioKind })
            }
            sx={{ mb: 2 }}
          >
            {(Object.keys(CARDIO_LABELS) as CardioKind[]).map((kind) => (
              <MenuItem key={kind} value={kind}>
                {CARDIO_LABELS[kind]}
              </MenuItem>
            ))}
          </TextField>

          <Stack direction="row" spacing={1}>
            <TextField
              label={`Дистанция, ${unit}`}
              fullWidth
              slotProps={{ htmlInput: { inputMode: "decimal" } }}
              value={
                session.cardio?.distanceM == null
                  ? ""
                  : unit === "км"
                    ? session.cardio.distanceM / 1000
                    : session.cardio.distanceM
              }
              onChange={(event) => {
                const value = toNumber(event.target.value);
                onChange({
                  ...session,
                  cardio: {
                    ...session.cardio!,
                    distanceM:
                      value == null ? null : unit === "км" ? value * 1000 : value,
                  },
                });
              }}
            />
            <TextField
              label="Время, мин"
              fullWidth
              slotProps={{ htmlInput: { inputMode: "decimal" } }}
              value={
                session.cardio?.durationSec == null
                  ? ""
                  : Math.round(session.cardio.durationSec / 60)
              }
              onChange={(event) => {
                const value = toNumber(event.target.value);
                onChange({
                  ...session,
                  cardio: {
                    ...session.cardio!,
                    durationSec: value == null ? null : value * 60,
                  },
                });
              }}
            />
          </Stack>

          <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: "center" }}>
            <TextField
              label="Средний пульс"
              fullWidth
              slotProps={{ htmlInput: { inputMode: "numeric" } }}
              value={session.cardio?.avgHr ?? ""}
              onChange={(event) =>
                onChange({
                  ...session,
                  cardio: { ...session.cardio!, avgHr: toNumber(event.target.value) },
                })
              }
            />
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Темп
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                {formatPace(
                  session.cardio?.distanceM ?? null,
                  session.cardio?.durationSec ?? null,
                  session.cardioKind,
                )}
              </Typography>
            </Box>
          </Stack>
        </Paper>
      )}

      {session.kind === "strength" && (
        <>
          {session.exercises.map((item) => {
            const exercise = exercises.find((e) => e.id === item.exerciseId);
            return (
              <Paper key={item.id} variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
                <Stack
                  direction="row"
                  sx={{ mb: 1, alignItems: "center", justifyContent: "space-between" }}
                >
                  <Typography variant="subtitle2">
                    {exercise?.name ?? "Упражнение"}
                  </Typography>
                  <IconButton
                    size="small"
                    aria-label="Убрать упражнение"
                    onClick={() =>
                      onChange({
                        ...session,
                        exercises: session.exercises.filter((e) => e.id !== item.id),
                      })
                    }
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>

                <Stack spacing={1}>
                  {item.sets.map((set, index) => (
                    <Stack key={set.id} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ width: 14 }}
                      >
                        {index + 1}
                      </Typography>
                      <TextField
                        placeholder="кг"
                        slotProps={{ htmlInput: { inputMode: "decimal" } }}
                        value={set.weight ?? ""}
                        onChange={(event) =>
                          patchExercise(item.id, (ex) => ({
                            ...ex,
                            sets: ex.sets.map((s) =>
                              s.id === set.id
                                ? { ...s, weight: toNumber(event.target.value) }
                                : s,
                            ),
                          }))
                        }
                        sx={{ flex: 1 }}
                      />
                      <TextField
                        placeholder="повт"
                        slotProps={{ htmlInput: { inputMode: "numeric" } }}
                        value={set.reps ?? ""}
                        onChange={(event) =>
                          patchExercise(item.id, (ex) => ({
                            ...ex,
                            sets: ex.sets.map((s) =>
                              s.id === set.id
                                ? { ...s, reps: toNumber(event.target.value) }
                                : s,
                            ),
                          }))
                        }
                        sx={{ flex: 1 }}
                      />
                      <Checkbox
                        checked={set.done}
                        onChange={(event) =>
                          patchExercise(item.id, (ex) => ({
                            ...ex,
                            sets: ex.sets.map((s) =>
                              s.id === set.id ? { ...s, done: event.target.checked } : s,
                            ),
                          }))
                        }
                      />
                      <IconButton
                        size="small"
                        aria-label="Убрать подход"
                        onClick={() =>
                          patchExercise(item.id, (ex) => ({
                            ...ex,
                            sets: ex.sets.filter((s) => s.id !== set.id),
                          }))
                        }
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  ))}
                </Stack>

                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() =>
                    // Новый подход наследует вес и повторы предыдущего —
                    // чаще всего они те же, и вводить заново не нужно.
                    patchExercise(item.id, (ex) => ({
                      ...ex,
                      sets: [...ex.sets, newSet(ex.sets[ex.sets.length - 1])],
                    }))
                  }
                  sx={{ mt: 1 }}
                >
                  Подход
                </Button>
              </Paper>
            );
          })}

          <Button
            fullWidth
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => setPicking(true)}
          >
            Добавить упражнение
          </Button>
        </>
      )}

      <TextField
        fullWidth
        multiline
        minRows={2}
        label="Заметки"
        value={session.notes ?? ""}
        onChange={(event) =>
          onChange({ ...session, notes: event.target.value || null })
        }
        sx={{ mt: 3 }}
      />

      <Button fullWidth variant="contained" onClick={onBack} sx={{ mt: 2 }}>
        Сохранить
      </Button>

      <Divider sx={{ my: 3 }} />

      <Typography variant="caption" color="text.secondary">
        Повторить эту тренировку в другой день
      </Typography>
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <TextField
          type="date"
          fullWidth
          value={copyDate}
          onChange={(event) => setCopyDate(event.target.value)}
        />
        <Button
          variant="outlined"
          disabled={!copyDate}
          onClick={() => {
            onCopyTo(copyDate);
            setCopyDate("");
          }}
        >
          Повторить
        </Button>
      </Stack>

      <Button fullWidth color="error" onClick={onDelete} sx={{ mt: 3 }}>
        Удалить тренировку
      </Button>

      <ExercisePickerDialog
        open={picking}
        exercises={exercises}
        onClose={() => setPicking(false)}
        onPick={(exerciseId) =>
          onChange({
            ...session,
            exercises: [...session.exercises, newSessionExercise(exerciseId)],
          })
        }
        onCreate={onCreateExercise}
      />
    </Box>
  );
}
