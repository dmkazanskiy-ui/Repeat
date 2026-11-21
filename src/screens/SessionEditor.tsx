import { motion, tr } from "../ui";
import { Card, IconBadge, Tile, radius, text } from "../ui";
import WorkoutActions from "../components/WorkoutActions";
import WorkoutPhotos from "../components/social/WorkoutPhotos";
import { CheckRounded as CheckRoundedIcon, Close as CloseIcon } from "../ui/icons";
import { MODE } from "../lib/themeMode";
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, createTheme, ThemeProvider, useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { ArrowBack as ArrowBackIcon } from "../ui/icons";
import { DeleteOutlined as DeleteOutlineIcon } from "../ui/icons";
import { Add as AddIcon } from "../ui/icons";
import RestTimer from "../components/RestTimer";
import { celebrateFinish, celebrateRecord } from "../lib/confetti";
import { sessionSetsRecord } from "../lib/analytics/records";
import { haptic } from "../lib/telegram";
import { PlayArrowRounded as PlayArrowRoundedIcon } from "../ui/icons";
import { PauseRounded as PauseRoundedIcon } from "../ui/icons";
import { LinkOff as LinkOffIcon } from "../ui/icons";
import { Link as LinkIcon } from "../ui/icons";
import { SwapHoriz as SwapHorizIcon } from "../ui/icons";
import { MoreVert as MoreVertIcon } from "../ui/icons";
import { ArrowUpward as ArrowUpwardIcon } from "../ui/icons";
import { ArrowDownward as ArrowDownwardIcon } from "../ui/icons";
import { ActivityIcon } from "../lib/icons";
import { typeColor } from "../lib/activityColors";
import ExercisePickerDialog from "../components/ExercisePickerDialog";
import type { PickerSection } from "../components/ExercisePickerDialog";
import NumberField from "../components/NumberField";
import WeightField from "../components/WeightField";
import { unitFor } from "../lib/units";
import type { ExerciseUnits, WeightUnit } from "../lib/units";
import { clampRestSec, loadRestEnabled, loadRestSec, saveRestSec } from "../lib/restTimer";
import { lastWorkingWeight, recentExercises, similarExercises } from "../lib/exerciseSuggest";
import { useT } from "../lib/i18n";
import {
  CARDIO_FIELD_LABELS,
  cardioProfile,
  formatRate,
  rateLabel,
} from "../lib/cardioProfiles";
import type { CardioFieldKey } from "../lib/cardioProfiles";
import { isCaloriesEstimate, sessionCalories } from "../lib/calories";
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
  today,
} from "../lib/format";
import {
  CARDIO_LABELS,
  INTENSITY_OPTIONS,
  MOBILITY_LABELS,
  activityIcon,
  activityLabel,
  exerciseName,
  distanceUnit,
  exerciseVolume,
  groupExercises,
  liveElapsedSec,
  segmentTotals,
  sessionDoneSetCount,
  sessionAvgHr,
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
  /** Вся история — для подбора замены и переноса веса нового упражнения. */
  sessions: Session[];
  exercises: Exercise[];
  cardioKinds: CustomActivity[];
  mobilityKinds: CustomActivity[];
  onChange: (session: Session) => void;
  onDelete: () => void;
  onBack: () => void;
  onCreateExercise: (name: string, group: MuscleGroup) => Exercise;
  onCopyTo: (date: string) => void;
  /** Выйти из режима правки завершённой тренировки — обратно в read-only. */
  onExitEditing?: () => void;
  /** Свои единицы веса упражнений и смена единицы для упражнения. */
  exerciseUnits?: ExerciseUnits;
  onExerciseUnit?: (exerciseId: string, unit: WeightUnit) => void;
  /** Упражнение заменили: App предложит заменить его и в программе. */
  onReplaced?: (info: {
    plannedExerciseId: string | null;
    exerciseId: string;
    fromName: string;
    toName: string;
  }) => void;
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

/**
 * При завершении отмечаем выполненными все заполненные подходы (где есть вес
 * или повторы) — чтобы не кликать каждую галочку вручную. Пустые не трогаем.
 */
function markFilledSetsDone(exercises: SessionExercise[]): SessionExercise[] {
  return exercises.map((ex) => ({
    ...ex,
    sets: ex.sets.map((s) =>
      s.weight != null || s.reps != null ? { ...s, done: true } : s,
    ),
  }));
}

/** Убрать неотмеченные подходы; упражнение, где не осталось ни одного, — тоже. */
function dropUncheckedSets(exercises: SessionExercise[]): SessionExercise[] {
  return exercises
    .map((ex) => ({ ...ex, sets: ex.sets.filter((s) => s.done) }))
    .filter((ex) => ex.sets.length > 0);
}

/** Круговой таймер: кольцо — прогресс подходов, центр — прошедшее время. */
/**
 * Отметка «подход сделан»: плитка 40×40 вместо мелкого чекбокса. Пусто —
 * серая, сделано — заливка цветом типа и галочка с пружинкой.
 */
function DoneToggle({
  checked,
  color,
  onColor,
  label,
  onToggle,
}: {
  checked: boolean;
  color: string;
  onColor: string;
  label: string;
  onToggle: (checked: boolean, trusted: boolean) => void;
}) {
  return (
    <Box
      component="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e: MouseEvent<HTMLElement>) => onToggle(!checked, e.nativeEvent.isTrusted)}
      sx={{
        width: 40,
        height: 40,
        flex: "none",
        p: 0,
        border: "none",
        borderRadius: radius.control,
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        bgcolor: checked ? color : "action.hover",
        color: checked ? onColor : "text.disabled",
        transition: `${tr("background-color", motion.fast, "ease")}, ${tr("transform", motion.press)}`,
        "&:active": { transform: "scale(0.92)" },
        "& svg": { transition: tr("transform", motion.base, "cubic-bezier(.34,1.56,.64,1)"), transform: checked ? "scale(1)" : "scale(0.7)" },
      }}
    >
      <CheckRoundedIcon sx={{ fontSize: 22 }} />
    </Box>
  );
}

function CircularTimer({
  elapsedSec,
  progress,
  label,
  color,
  theme,
}: {
  elapsedSec: number;
  progress: number;
  label: string;
  color: string;
  theme: Theme;
}) {
  const size = 148;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * Math.min(1, Math.max(0, progress));
  return (
    <Box sx={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <Box component="svg" width={size} height={size} sx={{ display: "block", transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={theme.palette.divider} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </Box>
      <Stack sx={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography sx={{ fontSize: 25, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
          {formatTimer(elapsedSec)}
        </Typography>
      </Stack>
    </Box>
  );
}

export default function SessionEditor({
  session,
  sessions,
  exercises,
  cardioKinds,
  mobilityKinds,
  onChange,
  onDelete,
  onBack,
  onCreateExercise,
  onCopyTo,
  onExitEditing,
  onReplaced,
  exerciseUnits,
  onExerciseUnit,
}: Props) {
  // Пикер упражнений: добавление нового или замена конкретного в слоте.
  const [picker, setPicker] = useState<
    { mode: "add" } | { mode: "replace"; itemId: string } | null
  >(null);
  // Меню действий упражнения — открывается кнопкой «⋮» на карточке.
  const [menuFor, setMenuFor] = useState<{
    id: string;
    anchor: HTMLElement;
    group: number;
  } | null>(null);
  // Последний удалённый подход — для «Вернуть»: корзина стоит рядом с
  // галочкой «выполнено», промах пальцем не должен стоить данных.
  // Меню подхода (тап по номеру): разминка, дроп, удалить.
  const [setMenu, setSetMenu] = useState<{ exId: string; set: WorkoutSet; index: number; anchor: HTMLElement } | null>(null);
  const [removedSet, setRemovedSet] = useState<{ exId: string; set: WorkoutSet; index: number } | null>(null);
  // Диалог завершения: длительность и средний пульс вводятся вручную —
  // «Начать» жать необязательно.
  const [finishing, setFinishing] = useState(false);
  const [finishMin, setFinishMin] = useState<number | null>(null);
  const [finishHr, setFinishHr] = useState<number | null>(null);
  const [finishKcal, setFinishKcal] = useState<number | null>(null);
  // Как поступить с подходами при завершении (выбор из диалога неотмеченных).
  const [finishSettle, setFinishSettle] = useState<(exs: SessionExercise[]) => SessionExercise[]>(
    () => markFilledSetsDone,
  );
  // Сколько заполненных подходов не отмечено — открывает вопрос при завершении.
  const [uncheckedPrompt, setUncheckedPrompt] = useState<number | null>(null);
  // Источник объединения в супер-сет: включается из меню упражнения.
  const [linkingId, setLinkingId] = useState<string | null>(null);

  // Таймер отдыха между подходами. Цель запоминается (localStorage), −15/+15 её
  // подстраивают; отсчёт стартует ТОЛЬКО по живому тапу по чекбоксу подхода.
  const [restTarget, setRestTarget] = useState(loadRestSec);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  function startRest() {
    if (!loadRestEnabled()) return;
    setRestEndsAt(Date.now() + restTarget * 1000);
  }
  function adjustRest(deltaSec: number) {
    setRestTarget((prev) => {
      const next = clampRestSec(prev + deltaSec);
      saveRestSec(next);
      return next;
    });
    setRestEndsAt((prev) => (prev == null ? prev : prev + deltaSec * 1000));
  }

  // Тикаем раз в секунду, только пока тренировка идёт (запущена, не завершена).
  const [nowMs, setNowMs] = useState(() => Date.now());
  const running = Boolean(session.startedAt && !session.endedAt);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const theme = useTheme();
  const t = useT();
  // Подборки для замены: сначала закрывающие ту же работу, затем недавние.
  const pickerSections: PickerSection[] | undefined = useMemo(() => {
    if (picker?.mode !== "replace") return undefined;
    const item = session.exercises.find((e) => e.id === picker.itemId);
    const target = exercises.find((e) => e.id === item?.exerciseId);
    const used = session.exercises.map((e) => e.exerciseId);
    const sections: PickerSection[] = [];
    if (target) {
      const similar = similarExercises(target, exercises).filter(
        (e) => !used.includes(e.id),
      );
      if (similar.length > 0) sections.push({ label: t("Похожие", "Similar"), exercises: similar });
    }
    const recent = recentExercises(sessions, exercises, { exclude: used, limit: 6 });
    if (recent.length > 0) {
      sections.push({ label: t("Ты уже делал", "You've done these"), exercises: recent });
    }
    return sections;
  }, [picker, session.exercises, exercises, sessions, t]);

  const paused = Boolean(session.pausedAt);
  const color = typeColor(session.kind);
  // Акцент внутри редактора — цвет типа активности (силовая фиолет, кардио
  // розовый и т.д.), а не глобальный зелёный. Подменяем primary в теме на цвет
  // типа для всего поддерева: так разом красятся кнопки, инпуты (фокус),
  // чекбоксы и чипы — единый визуал без ручной правки каждого элемента.
  const onColor = theme.palette.getContrastText(color);
  const editorTheme = useMemo(
    () =>
      createTheme(theme, {
        // augmentColor выводит main/light/dark/contrastText ИЗ цвета типа —
        // иначе мёрж поверх зелёной палитры оставляет .dark/.light зелёными
        // (и, например, hover/dark contained-кнопки уходит в зелень).
        palette: { primary: theme.palette.augmentColor({ color: { main: color } }) },
      }),
    [theme, color],
  );
  const totalSets = sessionSetCount(session);
  const doneSets = sessionDoneSetCount(session);
  const setsProgress = totalSets > 0 ? doneSets / totalSets : 0;
  const volume = sessionVolume(session);
  const elapsedSec = liveElapsedSec(session, nowMs);
  const statusLabel = session.endedAt
    ? t("Завершена", "Completed")
    : running
      ? paused
        ? t("На паузе", "Paused")
        : t("В процессе", "In progress")
      : session.date > today()
        ? t("Запланирована", "Planned")
        : t("Не начата", "Not started");

  /** Порядок групп: супер-сет двигается целиком, иначе он перестанет быть подряд. */
  function moveGroup(from: number, to: number) {
    const groups = groupExercises(session.exercises);
    if (from === to || from < 0 || from >= groups.length) return;
    const next = [...groups];
    const [moving] = next.splice(from, 1);
    next.splice(Math.max(0, Math.min(next.length, to)), 0, moving);
    onChange({ ...session, exercises: next.flat() });
  }

  /** Сдвиг группы на шаг вверх/вниз — из меню, без перетаскивания. */
  function nudgeGroup(from: number, delta: number) {
    moveGroup(from, from + delta);
  }

  // Меню открыто ровно на одно действие, поэтому позицию группы берём ту,
  // что запомнили при открытии.
  const menuGroup = menuFor?.group ?? -1;
  const groupCount = groupExercises(session.exercises).length;

  function headerClick(id: string) {
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
  // Набор полей задаёт вид активности, а не общий шаблон «дистанция+время».
  const profile = cardioProfile(session.cardioKind);
  // Оценку по MET и весу проставляет App при сохранении — здесь только читаем.
  const caloriesEst = session.caloriesEst ?? null;
  const kcal = sessionCalories(session);

  function patchExercise(
    id: string,
    patch: (exercise: SessionExercise) => SessionExercise,
  ) {
    onChange({
      ...session,
      exercises: session.exercises.map((e) => (e.id === id ? patch(e) : e)),
    });
  }

  /**
   * Замена упражнения в слоте: порядок, число подходов, повторы, заметка и
   * связь с планом остаются — меняется только чем слот занят. Вес берём из
   * истории НОВОГО упражнения (между разными движениями он не переносится),
   * отметки выполнения сбрасываем: та работа делалась другим движением.
   */
  function replaceExercise(itemId: string, exerciseId: string) {
    const item = session.exercises.find((e) => e.id === itemId);
    if (!item) return;
    const fromName = exerciseName(exercises.find((e) => e.id === item.exerciseId));
    const toName = exerciseName(exercises.find((e) => e.id === exerciseId));
    const weight = lastWorkingWeight(sessions, exerciseId);
    patchExercise(itemId, (ex) => ({
      ...ex,
      exerciseId,
      sets: ex.sets.map((set) => ({ ...set, weight, done: false })),
    }));
    onReplaced?.({
      plannedExerciseId: item.plannedExerciseId ?? null,
      exerciseId,
      fromName,
      toName,
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

  /** Поле кардио по ключу из профиля вида. */
  function cardioField(key: CardioFieldKey) {
    const label = CARDIO_FIELD_LABELS[key];
    switch (key) {
      case "distance": {
        const inKm = profile.distance !== "m";
        const meters = session.cardio?.distanceM ?? null;
        return (
          <NumberField
            key={key}
            size="small"
            label={`${label}, ${inKm ? t("км", "km") : t("м", "m")}`}
            value={meters == null ? null : inKm ? meters / 1000 : meters}
            onChange={(value) =>
              patchCardio({
                // Округляем до метра: 6,08 км это 6080 м, а не 6080.0000001.
                distanceM: value == null ? null : Math.round(inKm ? value * 1000 : value),
              })
            }
          />
        );
      }
      case "duration":
        return (
          <NumberField
            key={key}
            size="small"
            label={label}
            value={
              session.cardio?.durationSec == null
                ? null
                : Math.round((session.cardio.durationSec / 60) * 100) / 100
            }
            onChange={(value) =>
              patchCardio({ durationSec: value == null ? null : Math.round(value * 60) })
            }
          />
        );
      case "incline":
        return (
          <NumberField
            key={key}
            size="small"
            label={label}
            value={session.cardio?.inclineDeg ?? null}
            onChange={(value) => patchCardio({ inclineDeg: value })}
          />
        );
      case "avgHr":
        return (
          <NumberField
            key={key}
            size="small"
            integer
            label={label}
            value={session.cardio?.avgHr ?? null}
            onChange={(value) =>
              onChange({ ...session, avgHr: value, cardio: { ...session.cardio!, avgHr: value } })
            }
          />
        );
      case "resistance":
        return (
          <NumberField
            key={key}
            size="small"
            integer
            label={label}
            value={session.cardio?.resistance ?? null}
            onChange={(value) => patchCardio({ resistance: value })}
          />
        );
      case "powerW":
        return (
          <NumberField
            key={key}
            size="small"
            integer
            label={label}
            value={session.cardio?.powerW ?? null}
            onChange={(value) => patchCardio({ powerW: value })}
          />
        );
      case "floors":
        return (
          <NumberField
            key={key}
            size="small"
            integer
            label={label}
            value={session.cardio?.floors ?? null}
            onChange={(value) => patchCardio({ floors: value })}
          />
        );
      case "calories":
        return (
          <NumberField
            key={key}
            size="small"
            integer
            label={label}
            // Пустое поле — это не «ноль», а «считаем сами»: расчёт стоит
            // в placeholder, число с табло его перебивает.
            // Расчёт должен быть виден без фокуса, поэтому он в подписи:
            // placeholder MUI показывает только у поднятого лейбла.
            placeholder={caloriesEst ? `≈ ${caloriesEst}` : undefined}
            helperText={
              session.calories == null && caloriesEst
                ? `≈ ${caloriesEst} · ${t("оценка", "estimate")}`
                : undefined
            }
            value={session.calories ?? null}
            onChange={(value) => onChange({ ...session, calories: value })}
          />
        );
    }
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

  // Кардио: длительность живёт в двух местах — таймер (startedAt/endedAt) и
  // поле «Время, мин» (cardio.durationSec), из которого считаются темп на
  // карточке и аналитика выносливости/скорости. Если завершили таймером, а
  // время руками не вводили — подтягиваем его из таймера, иначе внутри просят
  // «указать время», а темп/аналитика молча пропадают.
  function fillCardioDuration(next: Session): Session {
    if (next.kind !== "cardio" || !next.cardio || next.cardio.durationSec != null) {
      return next;
    }
    const dur = sessionDurationSec(next);
    return dur && dur > 0
      ? { ...next, cardio: { ...next.cardio, durationSec: dur } }
      : next;
  }

  function commitFinish(
    min: number | null,
    hr: number | null,
    kcal: number | null,
    settle: (exs: SessionExercise[]) => SessionExercise[] = markFilledSetsDone,
  ) {
    const now = new Date();
    // При правке уже завершённой сохраняем исходное время финиша (не сдвигаем
    // тренировку на «сейчас»); при первом завершении финиш = сейчас.
    const endedAt = session.endedAt ?? now.toISOString();
    // Явная длительность = единственный источник: задаёт старт (end − N минут)
    // и обнуляет накопленные паузы, иначе `sessionDurationSec` вычтет их ещё раз
    // и покажет меньше введённого. Работает и с таймером, и без «Начать».
    const override = min != null && min > 0;
    const startedAt = override
      ? new Date(Date.parse(endedAt) - min * 60_000).toISOString()
      : (session.startedAt ?? endedAt);
    const base: Session = {
      ...session,
      startedAt,
      endedAt,
      pausedMs: override ? 0 : (session.pausedMs ?? null),
      pausedAt: null,
      // Время подтверждено руками — пометка «оценено» больше не нужна.
      autoEnded: false,
      avgHr: hr,
      cardio: session.cardio ? { ...session.cardio, avgHr: hr } : session.cardio,
      calories: kcal,
      time: session.time ?? nowTime(),
      exercises: settle(session.exercises),
    };
    // Кардио: держим «Время, мин» в синхроне с заданной длительностью, иначе
    // темп/дистанция считались бы от старого значения.
    const next =
      override && base.kind === "cardio" && base.cardio
        ? { ...base, cardio: { ...base.cardio, durationSec: min * 60 } }
        : fillCardioDuration(base);
    onChange(next);
    setFinishing(false);
    // Первое завершение — короткий залп; побит рекорд — залпы с двух сторон.
    if (!session.endedAt) {
      if (next.kind === "strength" && sessionSetsRecord(next, sessions)) celebrateRecord();
      else celebrateFinish();
    }
    onExitEditing?.();
  }

  /** Открыть диалог длительности для уже завершённой — с текущими значениями. */
  function editDuration() {
    const sec = sessionDurationSec(session);
    setFinishMin(sec != null ? Math.round(sec / 60) : null);
    setFinishHr(sessionAvgHr(session));
    setFinishKcal(session.calories ?? null);
    setFinishing(true);
  }

  /**
   * Завершить. Если длительность уже известна — идёт таймер или введено время
   * кардио — не спрашиваем ничего, сразу закрываем. Иначе просим ввести.
   */
  // Пауза / продолжить: копим время на паузе в pausedMs.
  function togglePause() {
    if (session.pausedAt) {
      const extra = Date.now() - Date.parse(session.pausedAt);
      onChange({ ...session, pausedMs: (session.pausedMs ?? 0) + extra, pausedAt: null });
    } else {
      onChange({ ...session, pausedAt: new Date().toISOString() });
    }
  }

  /**
   * Перед первым завершением: если часть подходов отмечена, а заполненные
   * неотмеченные остались (обычно — плановые из программы), спрашиваем, что с
   * ними. Молча отмечать их нельзя: они раздували тоннаж, e1RM и плато.
   * Кто галочки не ставит вовсе — старое поведение, всё заполненное засчитано.
   */
  function handleFinish() {
    if (!session.endedAt && session.kind === "strength") {
      const anyDone = session.exercises.some((ex) => ex.sets.some((s) => s.done));
      const pending = session.exercises.reduce(
        (n, ex) => n + ex.sets.filter((s) => !s.done && (s.weight != null || s.reps != null)).length,
        0,
      );
      if (anyDone && pending > 0) {
        setUncheckedPrompt(pending);
        return;
      }
    }
    finishWith(markFilledSetsDone);
  }

  function finishWith(settle: (exs: SessionExercise[]) => SessionExercise[]) {
    setUncheckedPrompt(null);
    if (running && session.startedAt) {
      // Реальный старт и паузы сохраняем — длительность посчитается корректно.
      const extraPause = session.pausedAt ? Date.now() - Date.parse(session.pausedAt) : 0;
      onChange(
        fillCardioDuration({
          ...session,
          endedAt: new Date().toISOString(),
          pausedMs: (session.pausedMs ?? 0) + extraPause,
          pausedAt: null,
          // Завершили руками — это реальное время, не оценка.
          autoEnded: false,
          avgHr: sessionAvgHr(session),
          time: session.time ?? nowTime(),
          exercises: settle(session.exercises),
        }),
      );
      onExitEditing?.();
      return;
    }
    const cardioDur =
      session.kind === "cardio" ? (session.cardio?.durationSec ?? null) : null;
    if (cardioDur) {
      commitFinish(Math.round(cardioDur / 60), sessionAvgHr(session), session.calories ?? null, settle);
      return;
    }
    setFinishSettle(() => settle);
    setFinishMin(null);
    setFinishHr(sessionAvgHr(session));
    setFinishKcal(session.calories ?? null);
    setFinishing(true);
  }

  return (
    <ThemeProvider theme={editorTheme}>
    <Box sx={{ pb: session.endedAt ? 6 : restEndsAt != null ? 22 : 13 }}>
      {/* Шапка: назад · дата/время · Готово · «⋯» (редкие действия) */}
      <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: "center" }}>
        <IconButton onClick={onBack} edge="start" aria-label={t("Назад", "Back")}>
          <ArrowBackIcon />
        </IconButton>
        <Stack direction="row" spacing={0.5} sx={{ flex: 1, alignItems: "center", minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary" noWrap>
            {formatDateFull(session.date)} ·
          </Typography>
          {/* Время старта — редактируется тапом (нативный пикер). */}
          <Box
            component="input"
            type="time"
            value={session.time ?? ""}
            aria-label={t("Время тренировки", "Workout time")}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onChange({ ...session, time: e.target.value || null })
            }
            sx={{
              background: "transparent",
              border: "none",
              color: "text.primary",
              font: "inherit",
              fontWeight: 600,
              cursor: "pointer",
              p: 0,
              colorScheme: MODE,
              "&:focus": { outline: "none" },
            }}
          />
        </Stack>
        {session.endedAt && onExitEditing && (
          <Button size="small" onClick={onExitEditing}>
            {t("Готово", "Done")}
          </Button>
        )}
        <WorkoutActions onCopyTo={onCopyTo} onDelete={onDelete} feedHidden={session.feedHidden} onToggleFeed={() => onChange({ ...session, feedHidden: !session.feedHidden })} />
      </Stack>

      {/* Hero: что за тренировка и где ты в ней. Кнопки действий — в нижней панели. */}
      <Card sx={{ mb: 1.5 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <IconBadge color={color} size={48}>
            <ActivityIcon icon={activityIcon(session)} fontSize="medium" />
          </IconBadge>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <TextField
              fullWidth
              variant="standard"
              placeholder={activityLabel(session) ?? t("Название тренировки", "Workout name")}
              value={session.title ?? ""}
              onChange={(event) => onChange({ ...session, title: event.target.value || null })}
              slotProps={{ input: { disableUnderline: true, style: { fontSize: 19, fontWeight: 700 } } }}
            />
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mt: 0.25, minWidth: 0 }}>
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  flex: "none",
                  bgcolor: paused ? "warning.main" : running || session.endedAt ? color : "text.disabled",
                }}
              />
              <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
                {[
                  statusLabel,
                  session.endedAt
                    ? `${formatDuration(sessionDurationSec(session))}${session.autoEnded ? ` ${t("(оценено)", "(estimated)")}` : ""}`
                    : null,
                  session.kind === "strength" && session.exercises.length > 0 && !running
                    ? `${session.exercises.length} ${t("упр.", "ex.")} · ${totalSets} ${t("подх.", "sets")}`
                    : null,
                  session.weekType ? `${session.weekType.name} ${t("неделя", "week")}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Typography>
              {session.endedAt && (
                <Button size="small" onClick={editDuration} sx={{ minWidth: 0, py: 0, px: 0.5, fontSize: 12, flex: "none" }}>
                  {t("Изменить", "Edit")}
                </Button>
              )}
            </Stack>
          </Box>
        </Stack>

        {/* Идёт: таймер-кольцо (прогресс = доля отмеченных подходов) и плитки. */}
        {running && (
          <Stack direction="row" spacing={2} sx={{ mt: 2, alignItems: "center", justifyContent: session.kind === "strength" ? "flex-start" : "center" }}>
            <CircularTimer
              elapsedSec={elapsedSec}
              progress={setsProgress}
              label={paused ? t("На паузе", "Paused") : t("Идёт", "In progress")}
              color={color}
              theme={theme}
            />
            {session.kind === "strength" && (
              <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
                <Tile label={t("Тоннаж", "Tonnage")} value={formatVolume(volume)} />
                <Tile label={t("Подходы", "Sets")} value={`${doneSets} ${t("из", "of")} ${totalSets}`}>
                  <Box sx={{ mt: 0.75, height: 4, borderRadius: 999, bgcolor: "action.hover", overflow: "hidden" }}>
                    <Box sx={{ height: "100%", width: `${Math.round(setsProgress * 100)}%`, bgcolor: color, transition: tr("width", motion.base) }} />
                  </Box>
                </Tile>
              </Stack>
            )}
          </Stack>
        )}

        {/* Завершена — итог плитками. */}
        {session.endedAt && session.kind === "strength" && (
          <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1 }}>
            <Tile label={t("Тоннаж", "Tonnage")} value={formatVolume(volume)} />
            <Tile label={t("Подходы", "Sets")} value={totalSets} />
            {sessionAvgHr(session) != null && <Tile label={t("Пульс", "HR")} value={sessionAvgHr(session)} />}
            {kcal != null && <Tile label={t("Калории", "Calories")} value={`${isCaloriesEstimate(session) ? "≈ " : ""}${kcal}`} />}
          </Box>
        )}
      </Card>

      {session.endedAt && <WorkoutPhotos photos={session.photos ?? []} onChange={(photos) => onChange({ ...session, photos })} />}

      {/* Тяжесть — оценка после/во время, до старта не спрашиваем. */}
      {(running || session.endedAt) && (
        <Box sx={{ mb: 3 }}>
          <Typography sx={{ ...text.label, mb: 0.75 }}>
            {session.endedAt ? t("Как прошла", "How it went") : t("Как идёт", "How it’s going")}
          </Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1 }}>
            {INTENSITY_OPTIONS.map((opt) => {
              const active = session.intensity === opt.value;
              return (
                <Tile
                  key={opt.value}
                  selected={active}
                  onClick={() => onChange({ ...session, intensity: active ? null : opt.value })}
                  sx={{ py: 1.25, textAlign: "center" }}
                >
                  <Typography sx={{ fontSize: 14, fontWeight: 600, color: active ? color : "text.primary" }}>{opt.label}</Typography>
                </Tile>
              );
            })}
          </Box>
        </Box>
      )}
      {!running && !session.endedAt && <Box sx={{ mb: 1.5 }} />}

      {session.kind !== "strength" && (
        <TextField
          select
          label={t("Вид", "Type")}
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
          {/* Поля под вид: у степпера нет дистанции, у велотренажёра есть
              мощность, у ходьбы скорость вместо темпа. Список даёт профиль. */}
          <Card sx={{ mb: 2 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1 }}>
              {profile.fields.map(cardioField)}
            </Box>
            {profile.rate && (
              <Stack direction="row" spacing={0.75} sx={{ mt: 1.25, alignItems: "baseline" }}>
                <Typography variant="caption" color="text.secondary">
                  {rateLabel(profile.rate)}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {formatRate(
                    profile.rate,
                    session.cardio?.distanceM ?? null,
                    session.cardio?.durationSec ?? null,
                  )}
                </Typography>
              </Stack>
            )}
          </Card>

          {/* Интервалы. Одна строка — это блок, повторённый N раз, поэтому
              «10 × 400 м через 90 с» вводится один раз, а не десять.
              У эллипса и степпера дробить нечего — там их не показываем. */}
          {profile.intervals && (
            <>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t("Интервалы", "Intervals")}
          </Typography>

          {segments.map((segment, index) => {
            const repeat = Math.max(1, segment.repeat || 1);
            return (
              <Card key={segment.id} sx={{ p: 1.5, mb: 1 }}>
                <Stack
                  direction="row"
                  sx={{
                    mb: 1,
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {t("Блок", "Block")} {index + 1}
                  </Typography>
                  <IconButton
                    size="small"
                    aria-label={t("Убрать блок", "Remove block")}
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
                    label={t("Повторов", "Reps")}
                    integer
                    value={segment.repeat}
                    sx={{ width: 100 }}
                    onChange={(value) => patchSegment(segment.id, { repeat: value ?? 1 })}
                  />
                  <NumberField
                    label={`${t("Отрезок", "Segment")}, ${unit}`}
                    fullWidth
                    value={
                      segment.distanceM == null
                        ? null
                        : session.cardioKind !== "swim"
                          ? segment.distanceM / 1000
                          : segment.distanceM
                    }
                    onChange={(value) =>
                      patchSegment(segment.id, {
                        distanceM:
                          value == null
                            ? null
                            : Math.round(session.cardioKind !== "swim" ? value * 1000 : value),
                      })
                    }
                  />
                </Stack>

                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                  <NumberField
                    label={t("Время, мин", "Time, min")}
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
                    label={t("Отдых, с", "Rest, s")}
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
                  {segment.durationSec ? ` ${t("за", "in")} ${formatClock(segment.durationSec)}` : ""}
                  {` · ${t("темп", "pace")} `}
                  {formatPace(segment.distanceM, segment.durationSec, session.cardioKind)}
                </Typography>
              </Card>
            );
          })}

          <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: "center" }}>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => patchCardio({ segments: [...segments, newSegment()] })}
            >
              {t("Блок", "Block")}
            </Button>
            {segments.length > 0 && (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                  {t("Итого", "Total")} {formatDistance(totals.distanceM, session.cardioKind)} ·{" "}
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
                  {t("В итог", "To total")}
                </Button>
              </>
            )}
          </Stack>
            </>
          )}
        </>
      )}

      {session.kind === "strength" && (
        <>
          {linkingId && (
            <Stack
              direction="row"
              spacing={1}
              sx={{ mb: 1.5, alignItems: "center" }}
            >
              <Typography variant="caption" sx={{ color, flex: 1 }}>
                {t("Выберите упражнение, чтобы объединить в супер-сет", "Pick an exercise to group into a superset")}
              </Typography>
              <Button size="small" onClick={() => setLinkingId(null)}>
                {t("Отмена", "Cancel")}
              </Button>
            </Stack>
          )}

          {(() => {
            let superIndex = -1;
            return groupExercises(session.exercises).map((group, groupIndex) => {
              const isSuper = group.length > 1;
              if (isSuper) superIndex += 1;
              const letter = String.fromCharCode(65 + Math.max(0, superIndex));
              const groupKey = group[0].id;
              return (
                <Box
                  key={groupKey}
                  sx={
                    isSuper
                      ? { mb: 1.5, p: 0.75, borderRadius: radius.card, bgcolor: alpha(color, 0.08) }
                      : { mb: 1.5 }
                  }
                >
                  {isSuper && (
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ mb: 0.5, px: 0.75, alignItems: "center" }}
                    >
                      <Typography sx={{ fontSize: 12, fontWeight: 700, color }}>
                        {t("Супер-сет", "Superset")} {letter}
                      </Typography>
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
                        {t("Разъединить", "Ungroup")}
                      </Button>
                    </Stack>
                  )}

                  {group.map((item, gi) => {
                    const exercise = exercises.find((e) => e.id === item.exerciseId);
                    const volume = exerciseVolume(item, !session.endedAt);
                    const isSource = linkingId === item.id;
                    return (
                      <Card
                        key={item.id}
                       
                        sx={{
                          p: 1.5,
                          mb: isSuper ? 1 : 1.5,
                          transition: `${tr("box-shadow", motion.press, "ease")}, ${tr("background-color", motion.press, "ease")}`,
                          ...(isSource && { boxShadow: `inset 0 0 0 2px ${color}` }) }}
                      >
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ mb: 1, alignItems: "center" }}
                        >
                          <Box
                            role="button"
                            tabIndex={0}
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
                                sx={{ color, fontWeight: 700 }}
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
                              {exerciseName(exercise)}
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
                            edge="end"
                            aria-label={t("Действия с упражнением", "Exercise actions")}
                            onClick={(event) =>
                              setMenuFor({
                                id: item.id,
                                anchor: event.currentTarget,
                                group: groupIndex,
                              })
                            }
                            sx={{ ml: "auto", flexShrink: 0, color: "text.secondary" }}
                          >
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        </Stack>

                {/* Подписи колонок — один раз на упражнение: после ввода плейсхолдеры исчезают. */}
                {item.sets.length > 0 && (
                  <Stack direction="row" spacing={1} sx={{ px: 0.25, mb: 0.5 }}>
                    <Box sx={{ width: 28, flex: "none" }} />
                    <Typography sx={{ ...text.caption, fontSize: 11, flex: 1 }}>{t("Вес", "Weight")}</Typography>
                    <Typography sx={{ ...text.caption, fontSize: 11, flex: 1 }}>{t("Повторы", "Reps")}</Typography>
                    <Box sx={{ width: 40, flex: "none" }} />
                  </Stack>
                )}
                <Stack spacing={0.75}>
                  {item.sets.map((set, index) => {
                    const drops = set.drops ?? [];
                    return (
                      <Box key={set.id}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                          {/* Номер подхода — вход в меню подхода: разминка, дроп, удалить.
                              Так в строке остаются только вес, повторы и отметка. */}
                          <Box
                            component="button"
                            onClick={(e: MouseEvent<HTMLElement>) => setSetMenu({ exId: item.id, set, index, anchor: e.currentTarget })}
                            aria-label={t(`Подход ${index + 1}: действия`, `Set ${index + 1}: actions`)}
                            sx={{
                              width: 28,
                              height: 40,
                              flex: "none",
                              p: 0,
                              border: "none",
                              borderRadius: radius.control,
                              bgcolor: "transparent",
                              cursor: "pointer",
                              fontFamily: "inherit",
                              fontSize: 13,
                              fontWeight: set.warmup ? 700 : 500,
                              color: set.warmup ? "warning.main" : "text.secondary",
                              fontVariantNumeric: "tabular-nums",
                              "&:active": { bgcolor: "action.hover" },
                            }}
                          >
                            {set.warmup ? t("Р", "W") : index + 1}
                          </Box>
                          <WeightField
                            valueKg={set.weight}
                            onChangeKg={(value) => patchSet(item.id, set.id, { weight: value })}
                            unit={unitFor(item.exerciseId, exerciseUnits)}
                            onUnitChange={(u) => onExerciseUnit?.(item.exerciseId, u)}
                            sx={{ flex: 1, opacity: set.warmup ? 0.5 : 1 }}
                          />
                          <NumberField
                            placeholder={t("повт", "reps")}
                            integer
                            value={set.reps}
                            onChange={(value) => patchSet(item.id, set.id, { reps: value })}
                            sx={{ flex: 1, opacity: set.warmup ? 0.5 : 1 }}
                          />
                          <DoneToggle
                            checked={set.done}
                            color={color}
                            onColor={onColor}
                            label={t("Подход выполнен", "Set done")}
                            onToggle={(checked, trusted) => {
                              patchSet(item.id, set.id, { done: checked });
                              if (checked) haptic("light");
                              // Отдых стартует только по живому тапу и только на
                              // переходе «не отмечен → отмечен».
                              if (checked && !set.done && !set.warmup && !session.endedAt && trusted) startRest();
                            }}
                          />
                        </Stack>

                        {/* Ступени дропа — с отступом под подходом. */}
                        {drops.map((drop) => (
                          <Stack key={drop.id} direction="row" spacing={1} sx={{ alignItems: "center", mt: 0.75 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ width: 28, flex: "none", textAlign: "center" }}>
                              ↳
                            </Typography>
                            <WeightField
                              valueKg={drop.weight}
                              onChangeKg={(value) => patchDrop(item.id, set.id, drop.id, { weight: value })}
                              unit={unitFor(item.exerciseId, exerciseUnits)}
                              onUnitChange={(u) => onExerciseUnit?.(item.exerciseId, u)}
                              sx={{ flex: 1 }}
                            />
                            <NumberField
                              placeholder={t("повт", "reps")}
                              integer
                              value={drop.reps}
                              onChange={(value) => patchDrop(item.id, set.id, drop.id, { reps: value })}
                              sx={{ flex: 1 }}
                            />
                            <IconButton
                              aria-label={t("Убрать дроп", "Remove drop")}
                              onClick={() => patchSet(item.id, set.id, { drops: drops.filter((d) => d.id !== drop.id) })}
                              sx={{ width: 40, height: 40, flex: "none", color: "text.secondary" }}
                            >
                              <CloseIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Stack>
                        ))}
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
                  {t("Подход", "Set")}
                </Button>
                      </Card>
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
            onClick={() => setPicker({ mode: "add" })}
          >
            {t("Добавить упражнение", "Add exercise")}
          </Button>
        </>
      )}

      <TextField
        fullWidth
        multiline
        minRows={2}
        label={t("Заметки", "Notes")}
        value={session.notes ?? ""}
        onChange={(event) =>
          onChange({ ...session, notes: event.target.value || null })
        }
        sx={{ mt: 3 }}
      />

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
          if (picker?.mode === "replace") replaceExercise(picker.itemId, exerciseId);
          else
            onChange({
              ...session,
              exercises: [...session.exercises, newSessionExercise(exerciseId)],
            });
        }}
        onCreate={onCreateExercise}
      />

      {/* Действия над упражнением — по кнопке «⋮» на карточке. */}
      <Menu
        open={menuFor != null}
        anchorEl={menuFor?.anchor ?? null}
        onClose={() => setMenuFor(null)}
      >
        <MenuItem
          disabled={session.exercises.length < 2}
          onClick={() => {
            if (menuFor) setLinkingId(menuFor.id);
            setMenuFor(null);
          }}
        >
          <ListItemIcon>
            <LinkIcon fontSize="small" />
          </ListItemIcon>
          {t("Объединить в супер-сет", "Group into a superset")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuFor) setPicker({ mode: "replace", itemId: menuFor.id });
            setMenuFor(null);
          }}
        >
          <ListItemIcon>
            <SwapHorizIcon fontSize="small" />
          </ListItemIcon>
          {t("Заменить", "Replace")}
        </MenuItem>
        {/* Порядок меняем шагами: перетаскивание на телефоне спорит со
            скроллом, а «выше/ниже» попадает с первого раза. */}
        <MenuItem
          disabled={groupCount < 2 || menuGroup <= 0}
          onClick={() => {
            nudgeGroup(menuGroup, -1);
            setMenuFor(null);
          }}
        >
          <ListItemIcon>
            <ArrowUpwardIcon fontSize="small" />
          </ListItemIcon>
          {t("Выше", "Move up")}
        </MenuItem>
        <MenuItem
          disabled={groupCount < 2 || menuGroup < 0 || menuGroup >= groupCount - 1}
          onClick={() => {
            nudgeGroup(menuGroup, 1);
            setMenuFor(null);
          }}
        >
          <ListItemIcon>
            <ArrowDownwardIcon fontSize="small" />
          </ListItemIcon>
          {t("Ниже", "Move down")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuFor) {
              const id = menuFor.id;
              onChange({
                ...session,
                exercises: session.exercises.filter((e) => e.id !== id),
              });
            }
            setMenuFor(null);
          }}
        >
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" color="error" />
          </ListItemIcon>
          <Typography color="error">{t("Удалить", "Delete")}</Typography>
        </MenuItem>
      </Menu>

      <Dialog open={uncheckedPrompt != null} onClose={() => setUncheckedPrompt(null)} fullWidth>
        <DialogTitle>{t("Не все подходы отмечены", "Some sets aren’t checked")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t(
              `Заполнено, но не отмечено: ${uncheckedPrompt ?? 0}. Их сделали? В тоннаж и прогресс идут только выполненные подходы.`,
              `Filled in but not checked: ${uncheckedPrompt ?? 0}. Did you do them? Only completed sets count toward tonnage and progress.`,
            )}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, flexWrap: "wrap", gap: 1 }}>
          <Button onClick={() => setUncheckedPrompt(null)}>{t("Отмена", "Cancel")}</Button>
          <Button color="error" onClick={() => finishWith(dropUncheckedSets)}>
            {t("Удалить невыполненные", "Remove unchecked")}
          </Button>
          <Button variant="contained" onClick={() => finishWith(markFilledSetsDone)}>
            {t("Все сделаны", "All done")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={finishing} onClose={() => setFinishing(false)} fullWidth>
        <DialogTitle>
          {session.endedAt
            ? t("Длительность и пульс", "Duration & heart rate")
            : t("Завершить тренировку", "Finish workout")}
        </DialogTitle>
        <DialogContent>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <NumberField
              label={t("Длительность, мин", "Duration, min")}
              integer
              value={finishMin}
              onChange={setFinishMin}
              fullWidth
            />
            <NumberField
              label={t("Средний пульс", "Avg heart rate")}
              integer
              value={finishHr}
              onChange={setFinishHr}
              fullWidth
            />
            <NumberField
              label={t("Калории", "Calories")}
              integer
              placeholder={caloriesEst ? `≈ ${caloriesEst}` : undefined}
              helperText={
                finishKcal == null && caloriesEst
                  ? `≈ ${caloriesEst} · ${t("оценка", "estimate")}`
                  : undefined
              }
              value={finishKcal}
              onChange={setFinishKcal}
              fullWidth
            />
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
            {caloriesEst
              ? t(
                  "Пустые поля не страшны: калории посчитаем сами по весу и длительности.",
                  "Blank is fine: calories are estimated from your weight and duration.",
                )
              : t("Можно оставить пустым — заполни, если знаешь.", "Leave blank — fill in if you know it.")}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setFinishing(false)}>{t("Отмена", "Cancel")}</Button>
          <Button variant="contained" onClick={() => commitFinish(finishMin, finishHr, finishKcal, session.endedAt ? undefined : finishSettle)}>
            {session.endedAt ? t("Сохранить", "Save") : t("Завершить", "Finish")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Меню подхода — по тапу на номер. */}
      <Menu open={setMenu != null} anchorEl={setMenu?.anchor ?? null} onClose={() => setSetMenu(null)}>
        <MenuItem
          onClick={() => {
            if (setMenu) patchSet(setMenu.exId, setMenu.set.id, { warmup: !setMenu.set.warmup });
            setSetMenu(null);
          }}
        >
          <ListItemIcon>{setMenu?.set.warmup ? <CheckRoundedIcon fontSize="small" /> : <Box sx={{ width: 20 }} />}</ListItemIcon>
          {t("Разминочный — не в тоннаж", "Warm-up — not in tonnage")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (setMenu) {
              const { exId, set } = setMenu;
              const drops = set.drops ?? [];
              // Ступень стартует от веса предыдущей ступени или самого подхода.
              patchSet(exId, set.id, { drops: [...drops, newDrop(drops[drops.length - 1]?.weight ?? set.weight)] });
            }
            setSetMenu(null);
          }}
        >
          <ListItemIcon>
            <AddIcon fontSize="small" />
          </ListItemIcon>
          {t("Добавить дроп", "Add a drop")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (setMenu) {
              const { exId, set, index } = setMenu;
              setRemovedSet({ exId, set, index });
              patchExercise(exId, (ex) => ({ ...ex, sets: ex.sets.filter((x) => x.id !== set.id) }));
            }
            setSetMenu(null);
          }}
        >
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" color="error" />
          </ListItemIcon>
          <Typography color="error">{t("Удалить подход", "Delete set")}</Typography>
        </MenuItem>
      </Menu>

      {/* Нижняя панель — главное действие под большим пальцем. */}
      {!session.endedAt && (
        <Box
          sx={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1200,
            pt: 3,
            pb: "calc(12px + env(safe-area-inset-bottom, 0px))",
            background: (th) => `linear-gradient(to top, ${th.palette.background.default} 62%, ${alpha(th.palette.background.default, 0)})`,
            pointerEvents: "none",
          }}
        >
          <Stack direction="row" spacing={1} sx={{ maxWidth: 600, mx: "auto", px: 2, pointerEvents: "auto", alignItems: "center" }}>
            {running ? (
              <>
                <IconButton
                  onClick={togglePause}
                  aria-label={paused ? t("Продолжить", "Resume") : t("Пауза", "Pause")}
                  sx={{ width: 52, height: 52, flex: "none", borderRadius: radius.tile, bgcolor: "action.hover", color: paused ? color : "text.primary" }}
                >
                  {paused ? <PlayArrowRoundedIcon /> : <PauseRoundedIcon />}
                </IconButton>
                <Button fullWidth variant="contained" onClick={handleFinish} sx={{ height: 52, borderRadius: radius.tile, fontSize: 16 }}>
                  {t("Завершить", "Finish")}
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={handleFinish}
                  sx={{ height: 52, flex: "none", px: 2, borderRadius: radius.tile, bgcolor: "action.hover", color: "text.primary", whiteSpace: "nowrap" }}
                >
                  {t("Уже сделал", "Log as done")}
                </Button>
                <Button
                  fullWidth
                  variant="contained"
                  startIcon={<PlayArrowRoundedIcon />}
                  onClick={() => onChange({ ...session, startedAt: new Date().toISOString(), time: session.time ?? nowTime() })}
                  sx={{ height: 52, borderRadius: radius.tile, fontSize: 16 }}
                >
                  {t("Начать", "Start")}
                </Button>
              </>
            )}
          </Stack>
        </Box>
      )}

      {restEndsAt != null && (
        <RestTimer
          bottomOffset={session.endedAt ? 0 : 76}
          endsAt={restEndsAt}
          target={restTarget}
          color={color}
          onAdjust={adjustRest}
          onSkip={() => setRestEndsAt(null)}
        />
      )}
      <Snackbar
        open={removedSet != null}
        autoHideDuration={10000}
        onClose={(_, reason) => reason !== "clickaway" && setRemovedSet(null)}
        message={t("Подход удалён", "Set removed")}
        action={
          <Button
            size="small"
            onClick={() => {
              const r = removedSet;
              if (r) {
                patchExercise(r.exId, (ex) => {
                  const sets = [...ex.sets];
                  sets.splice(Math.min(r.index, sets.length), 0, r.set);
                  return { ...ex, sets };
                });
              }
              setRemovedSet(null);
            }}
          >
            {t("Вернуть", "Undo")}
          </Button>
        }
        sx={{ bottom: { xs: session.endedAt ? 96 : 150 } }}
      />
    </Box>
    </ThemeProvider>
  );
}
