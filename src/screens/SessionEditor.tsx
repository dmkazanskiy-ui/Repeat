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
import NumberField from "../components/NumberField";
import { newSessionExercise, newSet } from "../lib/store";
import { formatDateFull, formatPace } from "../lib/format";
import { CARDIO_LABELS, cardioLabel, distanceUnit } from "../lib/types";
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
  cardioKinds: string[];
  onCreateExercise: (name: string, group: MuscleGroup) => Exercise;
  onCopyTo: (date: string) => void;
}

export default function SessionEditor({
  session,
  exercises,
  onChange,
  onDelete,
  onBack,
  cardioKinds,
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
          (session.kind === "cardio" ? cardioLabel(session) : null) ??
          "Название тренировки"
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
          {/* Свои виды кардио живут в том же списке, с префиксом в значении,
              чтобы не спутать «Гребля» пользователя с готовым видом. */}
          <TextField
            select
            label="Вид"
            fullWidth
            value={
              session.cardioCustom
                ? `custom:${session.cardioCustom}`
                : (session.cardioKind ?? "run")
            }
            onChange={(event) => {
              const value = event.target.value;
              onChange(
                value.startsWith("custom:")
                  ? {
                      ...session,
                      cardioKind: null,
                      cardioCustom: value.slice("custom:".length),
                    }
                  : {
                      ...session,
                      cardioKind: value as CardioKind,
                      cardioCustom: null,
                    },
              );
            }}
            sx={{ mb: 2 }}
          >
            {(Object.keys(CARDIO_LABELS) as CardioKind[]).map((kind) => (
              <MenuItem key={kind} value={kind}>
                {CARDIO_LABELS[kind]}
              </MenuItem>
            ))}
            {cardioKinds.map((custom) => (
              <MenuItem key={custom} value={`custom:${custom}`}>
                {custom}
              </MenuItem>
            ))}
          </TextField>

          <Stack direction="row" spacing={1}>
            <NumberField
              label={`Дистанция, ${unit}`}
              fullWidth
              value={
                session.cardio?.distanceM == null
                  ? null
                  : unit === "км"
                    ? session.cardio.distanceM / 1000
                    : session.cardio.distanceM
              }
              onChange={(value) =>
                onChange({
                  ...session,
                  cardio: {
                    ...session.cardio!,
                    // Округляем до метра: 6,08 км это 6080 м, а не 6080.0000001.
                    distanceM:
                      value == null
                        ? null
                        : Math.round(unit === "км" ? value * 1000 : value),
                  },
                })
              }
            />
            <NumberField
              label="Время, мин"
              fullWidth
              value={
                session.cardio?.durationSec == null
                  ? null
                  : Math.round((session.cardio.durationSec / 60) * 100) / 100
              }
              onChange={(value) =>
                onChange({
                  ...session,
                  cardio: {
                    ...session.cardio!,
                    durationSec: value == null ? null : Math.round(value * 60),
                  },
                })
              }
            />
          </Stack>

          <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: "center" }}>
            <NumberField
              label="Средний пульс"
              fullWidth
              integer
              value={session.cardio?.avgHr ?? null}
              onChange={(value) =>
                onChange({
                  ...session,
                  cardio: { ...session.cardio!, avgHr: value },
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
                      <NumberField
                        placeholder="кг"
                        value={set.weight}
                        onChange={(value) =>
                          patchExercise(item.id, (ex) => ({
                            ...ex,
                            sets: ex.sets.map((s) =>
                              s.id === set.id ? { ...s, weight: value } : s,
                            ),
                          }))
                        }
                        sx={{ flex: 1 }}
                      />
                      <NumberField
                        placeholder="повт"
                        integer
                        value={set.reps}
                        onChange={(value) =>
                          patchExercise(item.id, (ex) => ({
                            ...ex,
                            sets: ex.sets.map((s) =>
                              s.id === set.id ? { ...s, reps: value } : s,
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
