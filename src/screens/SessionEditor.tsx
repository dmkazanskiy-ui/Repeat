import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
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
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import ExercisePickerDialog from "../components/ExercisePickerDialog";
import NumberField from "../components/NumberField";
import {
  linkExercises,
  newDrop,
  newSegment,
  newSessionExercise,
  newSet,
  unlinkGroup,
} from "../lib/store";
import {
  formatDateFull,
  formatClock,
  formatDistance,
  formatDuration,
  formatPace,
  formatVolume,
  nowTime,
} from "../lib/format";
import {
  CARDIO_LABELS,
  MOBILITY_LABELS,
  activityLabel,
  distanceUnit,
  exerciseVolume,
  groupExercises,
  segmentTotals,
  sessionDurationSec,
  sessionSetCount,
  sessionVolume,
} from "../lib/types";
import type {
  CardioKind,
  CustomActivity,
  DropStage,
  Exercise,
  MobilityKind,
  MuscleGroup,
  Session,
  SessionExercise,
  WorkoutSet,
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
  /** Выйти из режима правки завершённой тренировки — обратно в read-only. */
  onExitEditing?: () => void;
}

/** Секунды в «1:23:45» или «12:07» — для тикающего таймера тренировки. */
function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = `${m}`.padStart(h ? 2 : 1, "0");
  const ss = `${s}`.padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
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
  onExitEditing,
}: Props) {
  const [picking, setPicking] = useState(false);
  const [copyDate, setCopyDate] = useState("");
  // Источник объединения в супер-сет: включается по long-press на упражнении.
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const pressTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);

  // Тикаем раз в секунду, только пока тренировка идёт (запущена, не завершена).
  const [nowMs, setNowMs] = useState(() => Date.now());
  const running = Boolean(session.startedAt && !session.endedAt);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  function startPress(id: string) {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      suppressClick.current = true;
      setLinkingId(id);
    }, 450);
  }
  function cancelPress() {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }
  function headerClick(id: string) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (linkingId == null) return;
    if (linkingId === id) {
      setLinkingId(null);
      return;
    }
    onChange({
      ...session,
      exercises: linkExercises(session.exercises, linkingId, id),
    });
    setLinkingId(null);
  }

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

  function patchSet(exId: string, setId: string, patch: Partial<WorkoutSet>) {
    patchExercise(exId, (ex) => ({
      ...ex,
      sets: ex.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
    }));
  }

  function patchDrop(
    exId: string,
    setId: string,
    dropId: string,
    patch: Partial<DropStage>,
  ) {
    patchExercise(exId, (ex) => ({
      ...ex,
      sets: ex.sets.map((s) =>
        s.id === setId
          ? {
              ...s,
              drops: (s.drops ?? []).map((d) =>
                d.id === dropId ? { ...d, ...patch } : d,
              ),
            }
          : s,
      ),
    }));
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
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {formatDateFull(session.date)}
        </Typography>
        {/* Время старта: раскладывает несколько тренировок в дне по порядку
            и подписывает карточку. По умолчанию — момент создания. */}
        <TextField
          type="time"
          variant="standard"
          value={session.time ?? ""}
          onChange={(event) =>
            onChange({ ...session, time: event.target.value || null })
          }
          slotProps={{ input: { disableUnderline: true } }}
          sx={{ width: 68, "& input": { textAlign: "right", fontSize: 14 } }}
        />
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

      {/* Таймер тренировки: «Начать» → тикает → «Завершить». Завершённую
          App показывает read-only; сюда попадаем уже в режиме правки. */}
      {session.endedAt ? (
        <Stack direction="row" spacing={1} sx={{ mb: 3, alignItems: "center" }}>
          <Chip label="Завершена" size="small" color="primary" variant="outlined" />
          <Typography variant="body2" color="text.secondary">
            {formatDuration(sessionDurationSec(session))}
          </Typography>
          {onExitEditing && (
            <Button size="small" sx={{ ml: "auto" }} onClick={onExitEditing}>
              Готово
            </Button>
          )}
        </Stack>
      ) : running ? (
        <Stack direction="row" spacing={1} sx={{ mb: 3, alignItems: "center" }}>
          <Typography
            variant="h1"
            sx={{ fontVariantNumeric: "tabular-nums" }}
          >
            {formatTimer(
              session.startedAt
                ? Math.max(0, Math.floor((nowMs - Date.parse(session.startedAt)) / 1000))
                : 0,
            )}
          </Typography>
          <Button
            variant="contained"
            color="error"
            startIcon={<StopIcon />}
            sx={{ ml: "auto" }}
            onClick={() => {
              onChange({ ...session, endedAt: new Date().toISOString() });
              onExitEditing?.();
            }}
          >
            Завершить
          </Button>
        </Stack>
      ) : (
        <Button
          fullWidth
          variant="outlined"
          startIcon={<PlayArrowIcon />}
          sx={{ mb: 3 }}
          onClick={() =>
            onChange({
              ...session,
              startedAt: new Date().toISOString(),
              time: session.time ?? nowTime(),
            })
          }
        >
          Начать тренировку
        </Button>
      )}

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
          {session.exercises.length > 0 && (
            <Stack
              direction="row"
              spacing={1}
              sx={{ mb: 1.5, alignItems: "baseline" }}
            >
              <Typography variant="subtitle2">
                Тоннаж {formatVolume(sessionVolume(session))}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                · {sessionSetCount(session)} подх.
              </Typography>
            </Stack>
          )}

          {linkingId && (
            <Stack
              direction="row"
              spacing={1}
              sx={{ mb: 1.5, alignItems: "center" }}
            >
              <Typography variant="caption" sx={{ color: "primary.main", flex: 1 }}>
                Выберите упражнение, чтобы объединить в супер-сет
              </Typography>
              <Button size="small" onClick={() => setLinkingId(null)}>
                Отмена
              </Button>
            </Stack>
          )}

          {(() => {
            let superIndex = -1;
            return groupExercises(session.exercises).map((group) => {
              const isSuper = group.length > 1;
              if (isSuper) superIndex += 1;
              const letter = String.fromCharCode(65 + Math.max(0, superIndex));
              return (
                <Box
                  key={group[0].id}
                  sx={
                    isSuper
                      ? {
                          mb: 1.5,
                          pl: 1,
                          borderLeft: "3px solid",
                          borderColor: "primary.main",
                        }
                      : { mb: 1.5 }
                  }
                >
                  {isSuper && (
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ mb: 0.5, alignItems: "center" }}
                    >
                      <Chip
                        label="Супер-сет"
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                      <Button
                        size="small"
                        startIcon={<LinkOffIcon />}
                        sx={{ ml: "auto" }}
                        onClick={() =>
                          onChange({
                            ...session,
                            exercises: unlinkGroup(
                              session.exercises,
                              group[0].groupId ?? "",
                            ),
                          })
                        }
                      >
                        Разъединить
                      </Button>
                    </Stack>
                  )}

                  {group.map((item, gi) => {
                    const exercise = exercises.find((e) => e.id === item.exerciseId);
                    const volume = exerciseVolume(item);
                    const isSource = linkingId === item.id;
                    return (
                      <Paper
                        key={item.id}
                        variant="outlined"
                        sx={{
                          p: 1.5,
                          mb: isSuper ? 1 : 1.5,
                          ...(isSource && {
                            borderColor: "primary.main",
                            borderWidth: 2,
                          }),
                        }}
                      >
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ mb: 1, alignItems: "center" }}
                        >
                          <Box
                            onPointerDown={() => startPress(item.id)}
                            onPointerUp={cancelPress}
                            onPointerLeave={cancelPress}
                            onClick={() => headerClick(item.id)}
                            sx={{
                              flex: 1,
                              minWidth: 0,
                              display: "flex",
                              alignItems: "center",
                              gap: 0.75,
                              cursor: linkingId ? "pointer" : "default",
                              userSelect: "none",
                            }}
                          >
                            {isSuper && (
                              <Typography
                                variant="caption"
                                sx={{ color: "primary.main", fontWeight: 700 }}
                              >
                                {letter}
                                {gi + 1}
                              </Typography>
                            )}
                            <Typography
                              variant="subtitle2"
                              noWrap
                              sx={{ minWidth: 0 }}
                            >
                              {exercise?.name ?? "Упражнение"}
                            </Typography>
                          </Box>
                  {volume > 0 && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ whiteSpace: "nowrap" }}
                    >
                      {formatVolume(volume)}
                    </Typography>
                  )}
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
                  {item.sets.map((set, index) => {
                    const drops = set.drops ?? [];
                    return (
                      <Box key={set.id}>
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ alignItems: "center" }}
                        >
                          {/* Тап по номеру переключает рабочий ⇄ разминочный.
                              Разминка помечается «Р» и не идёт в тоннаж. */}
                          <Box
                            component="button"
                            onClick={() =>
                              patchSet(item.id, set.id, { warmup: !set.warmup })
                            }
                            aria-label={
                              set.warmup ? "Разминочный подход" : "Рабочий подход"
                            }
                            sx={{
                              width: 16,
                              p: 0,
                              border: "none",
                              bgcolor: "transparent",
                              cursor: "pointer",
                              fontFamily: "inherit",
                              fontSize: 12,
                              fontWeight: set.warmup ? 700 : 400,
                              color: set.warmup ? "warning.main" : "text.secondary",
                            }}
                          >
                            {set.warmup ? "Р" : index + 1}
                          </Box>
                          <NumberField
                            placeholder="кг"
                            value={set.weight}
                            onChange={(value) =>
                              patchSet(item.id, set.id, { weight: value })
                            }
                            sx={{ flex: 1, opacity: set.warmup ? 0.5 : 1 }}
                          />
                          <NumberField
                            placeholder="повт"
                            integer
                            value={set.reps}
                            onChange={(value) =>
                              patchSet(item.id, set.id, { reps: value })
                            }
                            sx={{ flex: 1, opacity: set.warmup ? 0.5 : 1 }}
                          />
                          <Checkbox
                            checked={set.done}
                            onChange={(event) =>
                              patchSet(item.id, set.id, { done: event.target.checked })
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

                        {/* Ступени дропа — с отступом под подходом. Колонки
                            веса и повторов совпадают с основной строкой. */}
                        {drops.map((drop) => (
                          <Stack
                            key={drop.id}
                            direction="row"
                            spacing={1}
                            sx={{ alignItems: "center", mt: 1 }}
                          >
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ width: 14, textAlign: "center" }}
                            >
                              ↳
                            </Typography>
                            <NumberField
                              placeholder="кг"
                              value={drop.weight}
                              onChange={(value) =>
                                patchDrop(item.id, set.id, drop.id, { weight: value })
                              }
                              sx={{ flex: 1 }}
                            />
                            <NumberField
                              placeholder="повт"
                              integer
                              value={drop.reps}
                              onChange={(value) =>
                                patchDrop(item.id, set.id, drop.id, { reps: value })
                              }
                              sx={{ flex: 1 }}
                            />
                            {/* Пустая колонка под чекбоксом — чтобы поля совпали. */}
                            <Box sx={{ width: 42 }} />
                            <IconButton
                              size="small"
                              aria-label="Убрать дроп"
                              onClick={() =>
                                patchSet(item.id, set.id, {
                                  drops: drops.filter((d) => d.id !== drop.id),
                                })
                              }
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        ))}

                        <Button
                          size="small"
                          onClick={() =>
                            patchSet(item.id, set.id, {
                              drops: [
                                ...drops,
                                // Ступень стартует от веса предыдущей ступени
                                // или самого подхода — дальше его снижают.
                                newDrop(drops[drops.length - 1]?.weight ?? set.weight),
                              ],
                            })
                          }
                          sx={{ ml: 2.5, mt: 0.5, minWidth: 0, fontSize: 12 }}
                        >
                          + дроп
                        </Button>
                      </Box>
                    );
                  })}
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
                </Box>
              );
            });
          })()}

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
