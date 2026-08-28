import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, createTheme, ThemeProvider, useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import AddIcon from "@mui/icons-material/Add";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import EditIcon from "@mui/icons-material/Edit";
import RestTimer from "../components/RestTimer";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import StopIcon from "@mui/icons-material/Stop";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import LinkIcon from "@mui/icons-material/Link";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import { ActivityIcon } from "../lib/icons";
import { typeColor } from "../lib/activityColors";
import ExercisePickerDialog from "../components/ExercisePickerDialog";
import type { PickerSection } from "../components/ExercisePickerDialog";
import NumberField from "../components/NumberField";
import { clampRestSec, loadRestEnabled, loadRestSec, saveRestSec } from "../lib/restTimer";
import { lastWorkingWeight, recentExercises, similarExercises } from "../lib/exerciseSuggest";
import { useT } from "../lib/i18n";
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
  hasIncline,
  exerciseVolume,
  groupExercises,
  liveElapsedSec,
  segmentTotals,
  sessionDoneSetCount,
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
  onCopyToClipboard: () => void;
  /** Выйти из режима правки завершённой тренировки — обратно в read-only. */
  onExitEditing?: () => void;
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

/** Круговой таймер: кольцо — прогресс подходов, центр — прошедшее время. */
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
  onCopyToClipboard,
  onExitEditing,
  onReplaced,
}: Props) {
  // Пикер упражнений: добавление нового или замена конкретного в слоте.
  const [picker, setPicker] = useState<
    { mode: "add" } | { mode: "replace"; itemId: string } | null
  >(null);
  // Меню действий по долгому нажатию на упражнение.
  const [menuFor, setMenuFor] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [copyDate, setCopyDate] = useState("");
  // Диалог завершения: длительность и средний пульс вводятся вручную —
  // «Начать» жать необязательно.
  const [finishing, setFinishing] = useState(false);
  const [finishMin, setFinishMin] = useState<number | null>(null);
  const [finishHr, setFinishHr] = useState<number | null>(null);
  // Источник объединения в супер-сет: включается по long-press на упражнении.
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const pressTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);

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

  function startPress(id: string, anchor: HTMLElement) {
    // Пока выбираем пару для супер-сета, долгое нажатие не мешает: там тап
    // означает «объединить с этим».
    if (linkingId != null) return;
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      suppressClick.current = true;
      setMenuFor({ id, anchor });
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

  function commitFinish(min: number | null, hr: number | null) {
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
      avgHr: hr,
      time: session.time ?? nowTime(),
      exercises: markFilledSetsDone(session.exercises),
    };
    // Кардио: держим «Время, мин» в синхроне с заданной длительностью, иначе
    // темп/дистанция считались бы от старого значения.
    const next =
      override && base.kind === "cardio" && base.cardio
        ? { ...base, cardio: { ...base.cardio, durationSec: min * 60 } }
        : fillCardioDuration(base);
    onChange(next);
    setFinishing(false);
    onExitEditing?.();
  }

  /** Открыть диалог длительности для уже завершённой — с текущими значениями. */
  function editDuration() {
    const sec = sessionDurationSec(session);
    setFinishMin(sec != null ? Math.round(sec / 60) : null);
    setFinishHr(session.avgHr ?? session.cardio?.avgHr ?? null);
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

  function handleFinish() {
    if (running && session.startedAt) {
      // Реальный старт и паузы сохраняем — длительность посчитается корректно.
      const extraPause = session.pausedAt ? Date.now() - Date.parse(session.pausedAt) : 0;
      onChange(
        fillCardioDuration({
          ...session,
          endedAt: new Date().toISOString(),
          pausedMs: (session.pausedMs ?? 0) + extraPause,
          pausedAt: null,
          avgHr: session.avgHr ?? session.cardio?.avgHr ?? null,
          time: session.time ?? nowTime(),
          exercises: markFilledSetsDone(session.exercises),
        }),
      );
      onExitEditing?.();
      return;
    }
    const cardioDur =
      session.kind === "cardio" ? (session.cardio?.durationSec ?? null) : null;
    if (cardioDur) {
      commitFinish(Math.round(cardioDur / 60), session.cardio?.avgHr ?? session.avgHr ?? null);
      return;
    }
    setFinishMin(null);
    setFinishHr(session.cardio?.avgHr ?? session.avgHr ?? null);
    setFinishing(true);
  }

  return (
    <ThemeProvider theme={editorTheme}>
    <Box sx={{ pb: restEndsAt != null ? 14 : 6 }}>
      {/* Шапка: назад · статус-точка · дата/время · Завершить/Готово */}
      <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: "center" }}>
        <IconButton onClick={onBack} edge="start" aria-label={t("Назад", "Back")}>
          <ArrowBackIcon />
        </IconButton>
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            flexShrink: 0,
            bgcolor:
              running && !paused
                ? color
                : paused
                  ? "warning.main"
                  : session.endedAt
                    ? color
                    : "text.disabled",
          }}
        />
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
              color: alpha(color, 0.9),
              font: "inherit",
              fontWeight: 600,
              cursor: "pointer",
              p: 0,
              colorScheme: "dark",
              "&:focus": { outline: "none" },
            }}
          />
        </Stack>
        {session.endedAt
          ? onExitEditing && (
              <Button size="small" onClick={onExitEditing}>
                {t("Готово", "Done")}
              </Button>
            )
          : running && (
              <Button size="small" color="error" variant="outlined" onClick={handleFinish}>
                {t("Завершить", "Finish")}
              </Button>
            )}
      </Stack>

      {/* Hero-блок тренировки */}
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          mb: 2,
          borderRadius: 2,
          borderColor: alpha(color, 0.28),
          backgroundImage: `linear-gradient(150deg, ${alpha(color, 0.12)}, transparent 60%)`,
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: 2,
              flexShrink: 0,
              display: "grid",
              placeItems: "center",
              color,
              backgroundImage: `linear-gradient(135deg, ${alpha(color, 0.28)}, ${alpha(color, 0.08)})`,
            }}
          >
            <ActivityIcon icon={activityIcon(session)} fontSize="medium" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <TextField
              fullWidth
              variant="standard"
              placeholder={activityLabel(session) ?? t("Название тренировки", "Workout name")}
              value={session.title ?? ""}
              onChange={(event) => onChange({ ...session, title: event.target.value || null })}
              slotProps={{ input: { disableUnderline: true, style: { fontSize: 19, fontWeight: 700 } } }}
            />
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 0.25 }}>
              <Chip
                label={statusLabel}
                size="small"
                variant={running && !paused ? "filled" : "outlined"}
                sx={{
                  height: 22,
                  fontSize: 11,
                  ...(running && !paused
                    ? { bgcolor: color, color: onColor }
                    : { borderColor: alpha(color, 0.5), color }),
                }}
              />
              {(running || session.endedAt) && (
                <Typography variant="caption" color="text.secondary">
                  {formatDuration(session.endedAt ? sessionDurationSec(session) : elapsedSec)}
                </Typography>
              )}
              {session.endedAt && (
                <Button
                  size="small"
                  startIcon={<EditIcon sx={{ fontSize: 15 }} />}
                  onClick={editDuration}
                  sx={{ minWidth: 0, py: 0, px: 0.5, fontSize: 11 }}
                >
                  {t("Изменить", "Edit")}
                </Button>
              )}
            </Stack>
          </Box>
        </Stack>

        {/* Таймер + прогресс во время выполнения. Если справа есть контент
            (силовая: тоннаж/подходы) — 50/50; иначе таймер по центру. */}
        {running && (
          <Stack
            direction="row"
            spacing={2}
            sx={{
              mt: 2,
              alignItems: "center",
              justifyContent: session.kind === "strength" ? "flex-start" : "center",
            }}
          >
            <Stack
              spacing={1}
              sx={{ alignItems: "center", flex: session.kind === "strength" ? 1 : "0 1 auto" }}
            >
              <CircularTimer
                elapsedSec={elapsedSec}
                progress={setsProgress}
                label={paused ? t("На паузе", "Paused") : t("Тренировка идёт", "In progress")}
                color={color}
                theme={theme}
              />
              <Button
                size="small"
                variant="outlined"
                startIcon={paused ? <PlayArrowRoundedIcon /> : <PauseRoundedIcon />}
                onClick={togglePause}
              >
                {paused ? t("Продолжить", "Resume") : t("Пауза", "Pause")}
              </Button>
            </Stack>
            {session.kind === "strength" && (
              <Stack spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {t("Тоннаж", "Tonnage")}
                  </Typography>
                  <Typography sx={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>
                    {formatVolume(volume)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {t("Подходы", "Sets")}
                  </Typography>
                  <Typography sx={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>
                    {doneSets} {t("из", "of")} {totalSets}
                  </Typography>
                  <Box sx={{ mt: 0.5, height: 5, borderRadius: 999, bgcolor: "action.hover", overflow: "hidden" }}>
                    <Box sx={{ height: "100%", width: `${Math.round(setsProgress * 100)}%`, bgcolor: color }} />
                  </Box>
                </Box>
              </Stack>
            )}
          </Stack>
        )}

        {/* Завершённая — итог; не начатая — кнопка «Начать» */}
        {session.endedAt ? (
          session.kind === "strength" && (
            <Stack direction="row" spacing={3} sx={{ mt: 2 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">{t("Тоннаж", "Tonnage")}</Typography>
                <Typography sx={{ fontSize: 18, fontWeight: 800 }}>{formatVolume(volume)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">{t("Подходы", "Sets")}</Typography>
                <Typography sx={{ fontSize: 18, fontWeight: 800 }}>{totalSets}</Typography>
              </Box>
              {session.avgHr && (
                <Box>
                  <Typography variant="caption" color="text.secondary">{t("Пульс", "HR")}</Typography>
                  <Typography sx={{ fontSize: 18, fontWeight: 800 }}>{session.avgHr}</Typography>
                </Box>
              )}
            </Stack>
          )
        ) : !running ? (
          <Stack spacing={0.5} sx={{ mt: 2 }}>
            <Button
              fullWidth
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={() =>
                onChange({
                  ...session,
                  startedAt: new Date().toISOString(),
                  time: session.time ?? nowTime(),
                })
              }
            >
              {t("Начать тренировку", "Start workout")}
            </Button>
            <Button fullWidth size="small" startIcon={<StopIcon />} onClick={handleFinish}>
              {t("Завершить без таймера", "Finish without timer")}
            </Button>
          </Stack>
        ) : null}
      </Paper>

      {/* Тяжесть тренировки — субъективно, питает аналитику нагрузки. */}
      <Stack direction="row" spacing={1} sx={{ mb: 3, alignItems: "center" }}>
        <Typography variant="body2" color="text.secondary">
          {t("Тяжесть", "Effort")}
        </Typography>
        {INTENSITY_OPTIONS.map((opt) => {
          const active = session.intensity === opt.value;
          return (
            <Chip
              key={opt.value}
              label={opt.label}
              size="small"
              onClick={() => onChange({ ...session, intensity: active ? null : opt.value })}
              variant={active ? "filled" : "outlined"}
              sx={active ? { bgcolor: color, color: onColor } : undefined}
            />
          );
        })}
      </Stack>

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
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Stack direction="row" spacing={1}>
              <NumberField
                label={`${t("Дистанция", "Distance")}, ${unit}`}
                fullWidth
                value={
                  session.cardio?.distanceM == null
                    ? null
                    : session.cardioKind !== "swim"
                      ? session.cardio.distanceM / 1000
                      : session.cardio.distanceM
                }
                onChange={(value) =>
                  patchCardio({
                    // Округляем до метра: 6,08 км это 6080 м, а не 6080.0000001.
                    distanceM:
                      value == null
                        ? null
                        : Math.round(session.cardioKind !== "swim" ? value * 1000 : value),
                  })
                }
              />
              <NumberField
                label={t("Время, мин", "Time, min")}
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

            {hasIncline(session.cardioKind) && (
              <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                <NumberField
                  label={t("Наклон, °", "Incline, °")}
                  fullWidth
                  value={session.cardio?.inclineDeg ?? null}
                  onChange={(value) => patchCardio({ inclineDeg: value })}
                />
                <Box sx={{ flex: 1 }} />
              </Stack>
            )}

            <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: "center" }}>
              <NumberField
                label={t("Средний пульс", "Avg heart rate")}
                fullWidth
                integer
                value={session.cardio?.avgHr ?? null}
                onChange={(value) => patchCardio({ avgHr: value })}
              />
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {t("Темп", "Pace")}
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
            {t("Интервалы", "Intervals")}
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
              </Paper>
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

      {session.kind === "strength" && (
        <>
          {session.exercises.length > 0 && (
            <Stack
              direction="row"
              spacing={1}
              sx={{ mb: 1.5, alignItems: "baseline" }}
            >
              <Typography variant="subtitle2">
                {t("Тоннаж", "Tonnage")} {formatVolume(sessionVolume(session))}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                · {sessionSetCount(session)} {t("подх.", "sets")}
              </Typography>
            </Stack>
          )}

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
                          borderColor: color,
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
                        label={t("Супер-сет", "Superset")}
                        size="small"
                        variant="outlined"
                        sx={{ borderColor: alpha(color, 0.5), color }}
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
                        {t("Разъединить", "Ungroup")}
                      </Button>
                    </Stack>
                  )}

                  {group.map((item, gi) => {
                    const exercise = exercises.find((e) => e.id === item.exerciseId);
                    const volume = exerciseVolume(item, !session.endedAt);
                    const isSource = linkingId === item.id;
                    return (
                      <Paper
                        key={item.id}
                        variant="outlined"
                        sx={{
                          p: 1.5,
                          mb: isSuper ? 1 : 1.5,
                          ...(isSource && {
                            borderColor: color,
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
                            onPointerDown={(event) =>
                              startPress(item.id, event.currentTarget as HTMLElement)
                            }
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
                              set.warmup ? t("Разминочный подход", "Warm-up set") : t("Рабочий подход", "Working set")
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
                            {set.warmup ? t("Р", "W") : index + 1}
                          </Box>
                          <NumberField
                            placeholder={t("кг", "kg")}
                            value={set.weight}
                            onChange={(value) =>
                              patchSet(item.id, set.id, { weight: value })
                            }
                            sx={{ flex: 1, opacity: set.warmup ? 0.5 : 1 }}
                          />
                          <NumberField
                            placeholder={t("повт", "reps")}
                            integer
                            value={set.reps}
                            onChange={(value) =>
                              patchSet(item.id, set.id, { reps: value })
                            }
                            sx={{ flex: 1, opacity: set.warmup ? 0.5 : 1 }}
                          />
                          <Checkbox
                            checked={set.done}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              patchSet(item.id, set.id, { done: checked });
                              // Отдых стартует только по живому тапу по самому
                              // чекбоксу и только на переходе «не отмечен →
                              // отмечен»: правка веса/повторов или любой
                              // программный ререндер таймер не запускают.
                              if (
                                checked &&
                                !set.done &&
                                !set.warmup &&
                                !session.endedAt &&
                                event.nativeEvent.isTrusted
                              ) {
                                startRest();
                              }
                            }}
                            sx={{ "&.Mui-checked": { color } }}
                          />
                          <IconButton
                            size="small"
                            aria-label={t("Убрать подход", "Remove set")}
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
                              placeholder={t("кг", "kg")}
                              value={drop.weight}
                              onChange={(value) =>
                                patchDrop(item.id, set.id, drop.id, { weight: value })
                              }
                              sx={{ flex: 1 }}
                            />
                            <NumberField
                              placeholder={t("повт", "reps")}
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
                              aria-label={t("Убрать дроп", "Remove drop")}
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
                          {t("+ дроп", "+ drop")}
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
                  {t("Подход", "Set")}
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

      <Button fullWidth variant="contained" onClick={onBack} sx={{ mt: 2 }}>
        {t("Сохранить", "Save")}
      </Button>

      <Divider sx={{ my: 3 }} />

      <Typography variant="caption" color="text.secondary">
        {t("Повторить эту тренировку в другой день", "Repeat this workout on another day")}
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
          {t("Повторить", "Repeat")}
        </Button>
      </Stack>

      <Button
        fullWidth
        variant="outlined"
        startIcon={<ContentCopyIcon />}
        onClick={onCopyToClipboard}
        sx={{ mt: 2 }}
      >
        {t("Скопировать тренировку", "Copy workout")}
      </Button>

      <Button fullWidth color="error" onClick={onDelete} sx={{ mt: 1 }}>
        {t("Удалить тренировку", "Delete workout")}
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
          if (picker?.mode === "replace") replaceExercise(picker.itemId, exerciseId);
          else
            onChange({
              ...session,
              exercises: [...session.exercises, newSessionExercise(exerciseId)],
            });
        }}
        onCreate={onCreateExercise}
      />

      {/* Долгое нажатие на упражнение — объединить / заменить / удалить */}
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
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
            {t("Можно оставить пустым — заполни, если знаешь.", "Leave blank — fill in if you know it.")}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setFinishing(false)}>{t("Отмена", "Cancel")}</Button>
          <Button variant="contained" onClick={() => commitFinish(finishMin, finishHr)}>
            {session.endedAt ? t("Сохранить", "Save") : t("Завершить", "Finish")}
          </Button>
        </DialogActions>
      </Dialog>

      {restEndsAt != null && (
        <RestTimer
          endsAt={restEndsAt}
          target={restTarget}
          color={color}
          onAdjust={adjustRest}
          onSkip={() => setRestEndsAt(null)}
        />
      )}
    </Box>
    </ThemeProvider>
  );
}
