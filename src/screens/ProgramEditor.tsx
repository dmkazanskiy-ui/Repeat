import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import WavesIcon from "@mui/icons-material/Waves";
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

function ruPlural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

import { useT, useLang } from "../lib/i18n";

/** Две колонки числовых полей: на телефоне это читается, а строка из четырёх — нет. */
function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        mt: 1,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 1,
      }}
    >
      {children}
    </Box>
  );
}

export default function ProgramEditor({
  program,
  exercises,
  onChange,
  onBack,
  onArchive,
  onCreateExercise,
}: Props) {
  const t = useT();
  const lang = useLang();
  // Пикер: добавить упражнение в тренировку или заменить конкретное в слоте.
  const [picker, setPicker] = useState<
    | { mode: "add"; workoutId: string }
    | { mode: "replace"; workoutId: string; plannedId: string; exerciseId: string }
    | null
  >(null);

  // Меню действий — по кнопке «⋮», как на карточке упражнения в тренировке.
  // Своё меню на каждый вид карточки: у них разные действия.
  const [weekMenu, setWeekMenu] = useState<{
    index: number;
    anchor: HTMLElement;
  } | null>(null);
  const [workoutMenu, setWorkoutMenu] = useState<{
    id: string;
    index: number;
    anchor: HTMLElement;
  } | null>(null);
  const [exMenu, setExMenu] = useState<{
    workoutId: string;
    plannedId: string;
    exerciseId: string;
    index: number;
    count: number;
    exempt: boolean;
    anchor: HTMLElement;
  } | null>(null);

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
  const wave = program.wave;

  function patchWeek(index: number, patch: Partial<WeekType>) {
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

  /**
   * `startIndex` указывает на тип недели, стоявший на `startWeek`. При любой
   * перетасовке списка держим его на той же неделе — иначе правка порядка
   * молча сдвигает фазу волны, и «сейчас тяжёлая» превращается в «лёгкая».
   */
  function reweave(weeks: WeekType[], anchorId: string | undefined) {
    if (!wave) return;
    const found = weeks.findIndex((w) => w.id === anchorId);
    onChange({
      ...program,
      wave: { ...wave, weeks, startIndex: found < 0 ? 0 : found },
    });
  }

  function moveWeek(index: number, dir: number) {
    if (!wave) return;
    reweave(move(wave.weeks, index, dir), wave.weeks[wave.startIndex]?.id);
  }

  function removeWeek(index: number) {
    if (!wave || wave.weeks.length < 2) return;
    reweave(
      wave.weeks.filter((_, i) => i !== index),
      wave.weeks[wave.startIndex]?.id,
    );
  }

  function exercisesOf(workout: ProgramWorkout): PlannedExercise[] {
    return [...workout.exercises].sort((a, b) => a.order - b.order);
  }

  function moveExercise(workoutId: string, index: number, dir: number) {
    updateWorkout(workoutId, (w) => ({
      ...w,
      exercises: reindex(move(exercisesOf(w), index, dir)),
    }));
  }

  const weekMenuType = weekMenu && wave ? wave.weeks[weekMenu.index] : null;

  // Волна перебивает повторы плана только там, где их задали все типы недели:
  // `wavePlan` берёт число из недели, а к плану падает лишь при пустом поле.
  const repMinFromWave = Boolean(wave) && wave!.weeks.every((w) => w.repMin != null);
  const repMaxFromWave = Boolean(wave) && wave!.weeks.every((w) => w.repMax != null);
  const repsFromWave = repMinFromWave || repMaxFromWave;
  // Правило одно на всю программу — пишем его раз на тренировку, а не на
  // каждой карточке. Исключения видно по чипу «фикс. подходы».
  const waveNote = !wave
    ? null
    : repsFromWave
      ? t("Подходы и повторы — по волне недель", "Sets and reps come from the wave")
      : t("Подходы — по волне недель", "Sets come from the wave");

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
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {t("Волна недель", "Week wave")}
            </Typography>
            {/* Когда волна выключена, объяснение живёт ниже — не дублируем его. */}
            {wave && (
              <Typography variant="caption" color="text.secondary">
                {`${wave.weeks.length} ${lang === "ru" ? ruPlural(wave.weeks.length, "тип недели", "типа недели", "типов недели") : wave.weeks.length === 1 ? "week type" : "week types"} ${t("по кругу", "in rotation")}`}
              </Typography>
            )}
          </Box>
          <Switch
            checked={Boolean(wave)}
            onChange={(e) =>
              onChange({
                ...program,
                wave: e.target.checked ? defaultWave(today()) : null,
              })
            }
            slotProps={{ input: { "aria-label": t("Волна недель", "Week wave") } }}
          />
        </Stack>

        {wave ? (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, mb: 1.5 }}>
              {t(
                "Недели идут по кругу и меняются по календарю. Вес считается от прошлой недели того же типа; процент — ориентир на первый раз.",
                "Weeks rotate and switch by calendar. Weight comes from the last week of the same type; the percentage is a first-time estimate.",
              )}
            </Typography>
            <Stack spacing={1}>
              {wave.weeks.map((type, index) => (
                <Box
                  key={type.id}
                  sx={{ p: 1.25, borderRadius: 2, bgcolor: "action.hover" }}
                >
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <TextField
                      variant="standard"
                      value={type.name}
                      onChange={(e) => patchWeek(index, { name: e.target.value })}
                      slotProps={{ input: { style: { fontSize: 15, fontWeight: 600 } } }}
                      sx={{ flex: 1, minWidth: 0 }}
                    />
                    {type.light && (
                      <Chip
                        size="small"
                        label={t("не в плато", "not in plateaus")}
                        color="warning"
                        variant="outlined"
                        sx={{ height: 22, fontSize: 11, flexShrink: 0 }}
                      />
                    )}
                    <IconButton
                      size="small"
                      aria-label={t("Действия с неделей", "Week actions")}
                      onClick={(event) =>
                        setWeekMenu({ index, anchor: event.currentTarget })
                      }
                      sx={{ flexShrink: 0, color: "text.secondary" }}
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                  <FieldGrid>
                    <NumberField
                      size="small"
                      label={t("Подходы", "Sets")}
                      integer
                      value={type.sets}
                      onChange={(v) => patchWeek(index, { sets: Math.max(1, v ?? 1) })}
                    />
                    <NumberField
                      size="small"
                      label={t("% веса", "% weight")}
                      integer
                      value={type.percent ?? null}
                      onChange={(v) => patchWeek(index, { percent: v })}
                    />
                    <NumberField
                      size="small"
                      label={t("Повт. от", "Reps from")}
                      integer
                      value={type.repMin ?? null}
                      onChange={(v) => patchWeek(index, { repMin: v })}
                    />
                    <NumberField
                      size="small"
                      label={t("Повт. до", "Reps to")}
                      integer
                      value={type.repMax ?? null}
                      onChange={(v) => patchWeek(index, { repMax: v })}
                    />
                  </FieldGrid>
                </Box>
              ))}
            </Stack>
            <Button size="small" startIcon={<AddIcon />} onClick={addWeek} sx={{ mt: 1 }}>
              {t("Тип недели", "Week type")}
            </Button>
          </>
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            {t(
              "Без волны все недели одинаковые: подходы берутся из плана.",
              "Without a wave every week is the same: sets come from the plan.",
            )}
          </Typography>
        )}
      </Paper>

      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        {t("Тренировки", "Workouts")}
      </Typography>

      {workouts.map((workout, wi) => {
        const planned = exercisesOf(workout);
        return (
          <Paper key={workout.id} variant="outlined" sx={{ p: 1.5, mb: 1.5, borderRadius: 2 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <TextField
                variant="standard"
                value={workout.name}
                onChange={(e) => updateWorkout(workout.id, (w) => ({ ...w, name: e.target.value }))}
                slotProps={{ input: { style: { fontSize: 18, fontWeight: 600 } } }}
                sx={{ flex: 1, minWidth: 0 }}
              />
              <IconButton
                size="small"
                aria-label={t("Действия с тренировкой", "Workout actions")}
                onClick={(event) =>
                  setWorkoutMenu({ id: workout.id, index: wi, anchor: event.currentTarget })
                }
                sx={{ flexShrink: 0, color: "text.secondary" }}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Stack>

            {waveNote && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                {waveNote}
              </Typography>
            )}

            {planned.length === 0 ? (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                {t("Пусто — добавь упражнения", "Empty — add exercises")}
              </Typography>
            ) : (
              <Stack spacing={1} sx={{ mt: 1.5 }}>
                {planned.map((pe, pi) => {
                  const name = exerciseName(exercises.find((e) => e.id === pe.exerciseId));
                  // Волна перебивает план — поля, которые она задаёт, не
                  // показываем вовсе: мёртвый ввод путает сильнее, чем его
                  // отсутствие. Что именно отдано волне, говорит подпись.
                  const setsFromWave = Boolean(wave) && !pe.waveExempt;
                  return (
                    <Box
                      key={pe.id}
                      sx={{ p: 1.25, borderRadius: 2, bgcolor: "action.hover" }}
                    >
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <Typography
                          variant="body2"
                          noWrap
                          sx={{ flex: 1, minWidth: 0, fontWeight: 500 }}
                        >
                          {name ?? t("Упражнение", "Exercise")}
                        </Typography>
                        {wave && pe.waveExempt && (
                          <Chip
                            size="small"
                            label={t("фикс. подходы", "fixed sets")}
                            color="warning"
                            variant="outlined"
                            sx={{ height: 22, fontSize: 11, flexShrink: 0 }}
                          />
                        )}
                        <IconButton
                          size="small"
                          aria-label={t("Действия с упражнением", "Exercise actions")}
                          onClick={(event) =>
                            setExMenu({
                              workoutId: workout.id,
                              plannedId: pe.id,
                              exerciseId: pe.exerciseId,
                              index: pi,
                              count: planned.length,
                              exempt: Boolean(pe.waveExempt),
                              anchor: event.currentTarget,
                            })
                          }
                          sx={{ flexShrink: 0, color: "text.secondary" }}
                        >
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                      <FieldGrid>
                        {!setsFromWave && (
                          <NumberField
                            size="small"
                            label={t("Подходы", "Sets")}
                            integer
                            value={pe.targetSets}
                            onChange={(v) => patchPlanned(workout.id, pe.id, { targetSets: v ?? 1 })}
                          />
                        )}
                        <NumberField
                          size="small"
                          label={t("Вес, кг", "Weight, kg")}
                          value={pe.targetWeight ?? null}
                          onChange={(v) => patchPlanned(workout.id, pe.id, { targetWeight: v })}
                        />
                        {!repMinFromWave && (
                          <NumberField
                            size="small"
                            label={t("Повт. от", "Reps from")}
                            integer
                            value={pe.targetRepMin ?? null}
                            onChange={(v) => patchPlanned(workout.id, pe.id, { targetRepMin: v })}
                          />
                        )}
                        {!repMaxFromWave && (
                          <NumberField
                            size="small"
                            label={t("Повт. до", "Reps to")}
                            integer
                            value={pe.targetRepMax ?? null}
                            onChange={(v) => patchPlanned(workout.id, pe.id, { targetRepMax: v })}
                          />
                        )}
                      </FieldGrid>
                    </Box>
                  );
                })}
              </Stack>
            )}

            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setPicker({ mode: "add", workoutId: workout.id })}
              sx={{ mt: 1 }}
            >
              {t("Упражнение", "Exercise")}
            </Button>
          </Paper>
        );
      })}

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

      {/* Действия с типом недели */}
      <Menu
        open={weekMenu != null}
        anchorEl={weekMenu?.anchor ?? null}
        onClose={() => setWeekMenu(null)}
      >
        <MenuItem
          onClick={() => {
            if (weekMenu) patchWeek(weekMenu.index, { light: !weekMenuType?.light });
            setWeekMenu(null);
          }}
        >
          <ListItemIcon>
            <WavesIcon fontSize="small" />
          </ListItemIcon>
          {weekMenuType?.light
            ? t("Считать в плато", "Count in plateaus")
            : t("Не считать в плато", "Skip in plateaus")}
        </MenuItem>
        <MenuItem
          disabled={weekMenu == null || weekMenu.index <= 0}
          onClick={() => {
            if (weekMenu) moveWeek(weekMenu.index, -1);
            setWeekMenu(null);
          }}
        >
          <ListItemIcon>
            <ArrowUpwardIcon fontSize="small" />
          </ListItemIcon>
          {t("Выше", "Move up")}
        </MenuItem>
        <MenuItem
          disabled={
            weekMenu == null || !wave || weekMenu.index >= wave.weeks.length - 1
          }
          onClick={() => {
            if (weekMenu) moveWeek(weekMenu.index, 1);
            setWeekMenu(null);
          }}
        >
          <ListItemIcon>
            <ArrowDownwardIcon fontSize="small" />
          </ListItemIcon>
          {t("Ниже", "Move down")}
        </MenuItem>
        <MenuItem
          disabled={!wave || wave.weeks.length < 2}
          onClick={() => {
            if (weekMenu) removeWeek(weekMenu.index);
            setWeekMenu(null);
          }}
        >
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" color="error" />
          </ListItemIcon>
          <Typography color="error">{t("Убрать", "Remove")}</Typography>
        </MenuItem>
      </Menu>

      {/* Действия с тренировкой программы */}
      <Menu
        open={workoutMenu != null}
        anchorEl={workoutMenu?.anchor ?? null}
        onClose={() => setWorkoutMenu(null)}
      >
        <MenuItem
          disabled={workoutMenu == null || workoutMenu.index <= 0}
          onClick={() => {
            if (workoutMenu)
              onChange({ ...program, workouts: reindex(move(workouts, workoutMenu.index, -1)) });
            setWorkoutMenu(null);
          }}
        >
          <ListItemIcon>
            <ArrowUpwardIcon fontSize="small" />
          </ListItemIcon>
          {t("Выше", "Move up")}
        </MenuItem>
        <MenuItem
          disabled={workoutMenu == null || workoutMenu.index >= workouts.length - 1}
          onClick={() => {
            if (workoutMenu)
              onChange({ ...program, workouts: reindex(move(workouts, workoutMenu.index, 1)) });
            setWorkoutMenu(null);
          }}
        >
          <ListItemIcon>
            <ArrowDownwardIcon fontSize="small" />
          </ListItemIcon>
          {t("Ниже", "Move down")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (workoutMenu) {
              const id = workoutMenu.id;
              onChange({
                ...program,
                workouts: reindex(workouts.filter((w) => w.id !== id)),
              });
            }
            setWorkoutMenu(null);
          }}
        >
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" color="error" />
          </ListItemIcon>
          <Typography color="error">{t("Удалить тренировку", "Delete workout")}</Typography>
        </MenuItem>
      </Menu>

      {/* Действия с упражнением в плане */}
      <Menu
        open={exMenu != null}
        anchorEl={exMenu?.anchor ?? null}
        onClose={() => setExMenu(null)}
      >
        <MenuItem
          onClick={() => {
            if (exMenu)
              setPicker({
                mode: "replace",
                workoutId: exMenu.workoutId,
                plannedId: exMenu.plannedId,
                exerciseId: exMenu.exerciseId,
              });
            setExMenu(null);
          }}
        >
          <ListItemIcon>
            <SwapHorizIcon fontSize="small" />
          </ListItemIcon>
          {t("Заменить", "Replace")}
        </MenuItem>
        <MenuItem
          disabled={exMenu == null || exMenu.index <= 0}
          onClick={() => {
            if (exMenu) moveExercise(exMenu.workoutId, exMenu.index, -1);
            setExMenu(null);
          }}
        >
          <ListItemIcon>
            <ArrowUpwardIcon fontSize="small" />
          </ListItemIcon>
          {t("Выше", "Move up")}
        </MenuItem>
        <MenuItem
          disabled={exMenu == null || exMenu.index >= exMenu.count - 1}
          onClick={() => {
            if (exMenu) moveExercise(exMenu.workoutId, exMenu.index, 1);
            setExMenu(null);
          }}
        >
          <ListItemIcon>
            <ArrowDownwardIcon fontSize="small" />
          </ListItemIcon>
          {t("Ниже", "Move down")}
        </MenuItem>
        {wave && (
          <MenuItem
            onClick={() => {
              if (exMenu)
                patchPlanned(exMenu.workoutId, exMenu.plannedId, {
                  waveExempt: !exMenu.exempt,
                });
              setExMenu(null);
            }}
          >
            <ListItemIcon>
              {exMenu?.exempt ? (
                <WavesIcon fontSize="small" />
              ) : (
                <PushPinOutlinedIcon fontSize="small" />
              )}
            </ListItemIcon>
            {exMenu?.exempt
              ? t("Подходы по волне", "Sets from the wave")
              : t("Зафиксировать подходы", "Fix the sets")}
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            if (exMenu) {
              const { workoutId, plannedId } = exMenu;
              updateWorkout(workoutId, (w) => ({
                ...w,
                exercises: reindex(w.exercises.filter((x) => x.id !== plannedId)),
              }));
            }
            setExMenu(null);
          }}
        >
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" color="error" />
          </ListItemIcon>
          <Typography color="error">{t("Убрать", "Remove")}</Typography>
        </MenuItem>
      </Menu>

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
