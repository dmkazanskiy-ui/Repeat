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
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ExercisePickerDialog from "../components/ExercisePickerDialog";
import NumberField from "../components/NumberField";
import { newSegment, newSessionExercise, newSet } from "../lib/store";
import {
  formatDateFull,
  formatClock,
  formatDistance,
  formatDuration,
  formatPace,
} from "../lib/format";
import {
  CARDIO_LABELS,
  MOBILITY_LABELS,
  activityLabel,
  distanceUnit,
  segmentTotals,
} from "../lib/types";
import type {
  CardioKind,
  CustomActivity,
  Exercise,
  MobilityKind,
  MuscleGroup,
  Session,
  SessionExercise,
} from "../lib/types";

interface Props {
  session: Session;
  exercises: Exercise[];
  cardioKinds: CustomActivity[];
  mobilityKinds: CustomActivity[];
  onChange: (session: Session) => void;
  onDelete: () => void;
  onBack: () => void;
  onCreateExercise: (name: string, group: MuscleGroup) => Exercise;
  onCopyTo: (date: string) => void;
  onCopyToClipboard: () => void;
}

export default function SessionEditor({
  session,
  exercises,
  cardioKinds,
  mobilityKinds,
  onChange,
  onDelete,
  onBack,
  onCreateExercise,
  onCopyTo,
  onCopyToClipboard,
}: Props) {
  const [picking, setPicking] = useState(false);
  const [copyDate, setCopyDate] = useState("");

  const unit = distanceUnit(session.cardioKind);
  const segments = session.cardio?.segments ?? [];
  const totals = segmentTotals(segments);

  function patchExercise(
    id: string,
    patch: (exercise: SessionExercise) => SessionExercise,
  ) {
    onChange({
      ...session,
      exercises: session.exercises.map((e) => (e.id === id ? patch(e) : e)),
    });
  }

  function patchCardio(patch: Partial<NonNullable<Session["cardio"]>>) {
    onChange({ ...session, cardio: { ...session.cardio!, ...patch } });
  }

  function patchSegment(id: string, patch: Partial<(typeof segments)[number]>) {
    patchCardio({
      segments: segments.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  }

  /** Значение селекта вида: свои виды помечаем префиксом. */
  const kindValue = session.customKind
    ? `custom:${session.customKind}`
    : session.kind === "cardio"
      ? (session.cardioKind ?? "run")
      : (session.mobilityKind ?? "yoga");

  function pickKind(value: string) {
    if (value.startsWith("custom:")) {
      const name = value.slice("custom:".length);
      const list = session.kind === "cardio" ? cardioKinds : mobilityKinds;
      onChange({
        ...session,
        cardioKind: null,
        mobilityKind: null,
        customKind: name,
        icon: list.find((item) => item.name === name)?.icon ?? "bolt",
      });
      return;
    }
    onChange({
      ...session,
      customKind: null,
      icon: null,
      cardioKind: session.kind === "cardio" ? (value as CardioKind) : null,
      mobilityKind: session.kind === "mobility" ? (value as MobilityKind) : null,
    });
  }

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
        placeholder={activityLabel(session) ?? "Название тренировки"}
        value={session.title ?? ""}
        onChange={(event) =>
          onChange({ ...session, title: event.target.value || null })
        }
        slotProps={{ input: { style: { fontSize: 24, fontWeight: 700 } } }}
        sx={{ mb: 3 }}
      />

      {session.kind !== "strength" && (
        <TextField
          select
          label="Вид"
          fullWidth
          value={kindValue}
          onChange={(event) => pickKind(event.target.value)}
          sx={{ mb: 2 }}
        >
          {session.kind === "cardio"
            ? (Object.keys(CARDIO_LABELS) as CardioKind[]).map((kind) => (
                <MenuItem key={kind} value={kind}>
                  {CARDIO_LABELS[kind]}
                </MenuItem>
              ))
            : (Object.keys(MOBILITY_LABELS) as MobilityKind[]).map((kind) => (
                <MenuItem key={kind} value={kind}>
                  {MOBILITY_LABELS[kind]}
                </MenuItem>
              ))}
          {(session.kind === "cardio" ? cardioKinds : mobilityKinds).map((custom) => (
            <MenuItem key={custom.name} value={`custom:${custom.name}`}>
              {custom.name}
            </MenuItem>
          ))}
        </TextField>
      )}

      {session.kind === "cardio" && (
        <>
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
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
                  patchCardio({
                    // Округляем до метра: 6,08 км это 6080 м, а не 6080.0000001.
                    distanceM:
                      value == null
                        ? null
                        : Math.round(unit === "км" ? value * 1000 : value),
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
                  patchCardio({
                    durationSec: value == null ? null : Math.round(value * 60),
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
                onChange={(value) => patchCardio({ avgHr: value })}
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

          {/* Интервалы. Одна строка — это блок, повторённый N раз, поэтому
              «10 × 400 м через 90 с» вводится один раз, а не десять. */}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Интервалы
          </Typography>

          {segments.map((segment, index) => {
            const repeat = Math.max(1, segment.repeat || 1);
            return (
              <Paper key={segment.id} variant="outlined" sx={{ p: 1.5, mb: 1 }}>
                <Stack
                  direction="row"
                  sx={{
                    mb: 1,
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    Блок {index + 1}
                  </Typography>
                  <IconButton
                    size="small"
                    aria-label="Убрать блок"
                    onClick={() =>
                      patchCardio({
                        segments: segments.filter((s) => s.id !== segment.id),
                      })
                    }
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>

                <Stack direction="row" spacing={1}>
                  <NumberField
                    label="Повторов"
                    integer
                    value={segment.repeat}
                    sx={{ width: 100 }}
                    onChange={(value) => patchSegment(segment.id, { repeat: value ?? 1 })}
                  />
                  <NumberField
                    label={`Отрезок, ${unit}`}
                    fullWidth
                    value={
                      segment.distanceM == null
                        ? null
                        : unit === "км"
                          ? segment.distanceM / 1000
                          : segment.distanceM
                    }
                    onChange={(value) =>
                      patchSegment(segment.id, {
                        distanceM:
                          value == null
                            ? null
                            : Math.round(unit === "км" ? value * 1000 : value),
                      })
                    }
                  />
                </Stack>

                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                  <NumberField
                    label="Время, мин"
                    fullWidth
                    value={
                      segment.durationSec == null
                        ? null
                        : Math.round((segment.durationSec / 60) * 100) / 100
                    }
                    onChange={(value) =>
                      patchSegment(segment.id, {
                        durationSec: value == null ? null : Math.round(value * 60),
                      })
                    }
                  />
                  <NumberField
                    label="Отдых, с"
                    fullWidth
                    integer
                    value={segment.restSec}
                    onChange={(value) => patchSegment(segment.id, { restSec: value })}
                  />
                </Stack>

                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 1 }}
                >
                  {repeat} × {formatDistance(segment.distanceM, session.cardioKind)}
                  {segment.durationSec ? ` за ${formatClock(segment.durationSec)}` : ""}
                  {" · темп "}
                  {formatPace(segment.distanceM, segment.durationSec, session.cardioKind)}
                </Typography>
              </Paper>
            );
          })}

          <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: "center" }}>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => patchCardio({ segments: [...segments, newSegment()] })}
            >
              Блок
            </Button>
            {segments.length > 0 && (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                  Итого {formatDistance(totals.distanceM, session.cardioKind)} ·{" "}
                  {formatDuration(totals.durationSec)}
                </Typography>
                <Button
                  size="small"
                  onClick={() =>
                    patchCardio({
                      distanceM: totals.distanceM || null,
                      durationSec: totals.durationSec || null,
                    })
                  }
                >
                  В итог
                </Button>
              </>
            )}
          </Stack>
        </>
      )}

      {session.kind === "strength" && (
        <>
          {session.exercises.map((item) => {
            const exercise = exercises.find((e) => e.id === item.exerciseId);
            return (
              <Paper key={item.id} variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
                <Stack
                  direction="row"
                  sx={{
                    mb: 1,
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
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
                    <Stack
                      key={set.id}
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: "center" }}
                    >
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
      {/* Поле даты тянется, кнопка занимает ровно своё — иначе инпут
          оказывался уже кнопки и выглядел сломанным. */}
      <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: "center" }}>
        <TextField
          type="date"
          value={copyDate}
          onChange={(event) => setCopyDate(event.target.value)}
          sx={{ flex: 1 }}
        />
        <Button
          variant="outlined"
          disabled={!copyDate}
          onClick={() => {
            onCopyTo(copyDate);
            setCopyDate("");
          }}
          sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
        >
          Повторить
        </Button>
      </Stack>

      <Button
        fullWidth
        variant="outlined"
        startIcon={<ContentCopyIcon />}
        onClick={onCopyToClipboard}
        sx={{ mt: 2 }}
      >
        Скопировать тренировку
      </Button>

      <Button fullWidth color="error" onClick={onDelete} sx={{ mt: 1 }}>
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
