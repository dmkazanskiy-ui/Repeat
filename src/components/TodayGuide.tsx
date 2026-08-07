import { useMemo, type ReactNode } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import LibraryBooksRoundedIcon from "@mui/icons-material/LibraryBooksRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import LocalFireDepartmentRoundedIcon from "@mui/icons-material/LocalFireDepartmentRounded";
import SpaRoundedIcon from "@mui/icons-material/SpaRounded";
import { ActivityIcon } from "../lib/icons";
import type { IconKey } from "../lib/icons";
import { TYPE_COLOR } from "../lib/activityColors";
import { FOCUS_GOALS } from "../lib/workoutBuilder";
import type { FocusGoal } from "../lib/workoutBuilder";
import { currentStreak } from "../lib/analytics/consistency";
import { readiness } from "../lib/analytics/recovery";
import { restBalance } from "../lib/analytics/rest";
import { useT } from "../lib/i18n";
import {
  SESSION_LABELS,
  activityLabel,
  isTrainingSession,
} from "../lib/types";
import type { RecoveryEntry, Session, TrainingProgram } from "../lib/types";
import { addDays, today } from "../lib/format";

interface Props {
  sessions: Session[];
  programs: TrainingProgram[];
  recovery: RecoveryEntry[];
  focusGoal: FocusGoal | null;
  /** Запуск тренировки дня активной программы. */
  onStartProgramDay: (program: TrainingProgram, workoutIndex: number) => void;
  /** Открыть мастер «Тренер» сразу на шаге цели. */
  onSuggest: () => void;
  /** Открыть библиотеку готовых программ. */
  onOpenLibrary: () => void;
  /** Повторить конкретную прошлую тренировку (скопировать на сегодня). */
  onRepeatLast: (session: Session) => void;
  /** Добавить тренировку вручную (обычный лист выбора). */
  onCreate: () => void;
}

const GREEN = TYPE_COLOR.mobility;
const PROGRAM_COLOR = "#f59e0b";

/**
 * Проактивный пустой «Сегодня»: вместо строки-заглушки ведём пользователя к
 * действию в один тап. Приоритет — самый сильный ответ на «что делать сейчас»:
 * тренировка дня активной программы, иначе — подбор под цель. ICP приложения —
 * тот, кто не знает, что делать, поэтому экран должен САМ подсказать.
 */
export default function TodayGuide({
  sessions,
  programs,
  recovery,
  focusGoal,
  onStartProgramDay,
  onSuggest,
  onOpenLibrary,
  onRepeatLast,
  onCreate,
}: Props) {
  const t = useT();
  const activeProgram = useMemo(
    () => programs.find((p) => !p.archivedAt) ?? null,
    [programs],
  );

  // Следующая тренировка цикла активной программы.
  const nextWorkout = useMemo(() => {
    if (!activeProgram || activeProgram.workouts.length === 0) return null;
    const sorted = [...activeProgram.workouts].sort((a, b) => a.order - b.order);
    const index = Math.min(
      Math.max(activeProgram.currentWorkoutIndex, 0),
      sorted.length - 1,
    );
    return { workout: sorted[index], index };
  }, [activeProgram]);

  // Последняя выполненная тренировка (не восстановление) — для «повторить».
  const lastTraining = useMemo(() => {
    const done = sessions
      .filter((s) => isTrainingSession(s) && s.date <= today())
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return done[0] ?? null;
  }, [sessions]);

  const streak = useMemo(() => currentStreak(sessions), [sessions]);
  const nudge = useMemo(
    () => buildNudge(sessions, streak, t),
    [sessions, streak, t],
  );

  // Готовность: низкая → мягко предлагаем поберечься (день программы не прячем).
  const lowReadiness = useMemo(() => {
    const r = readiness(sessions, recovery);
    const bal = restBalance(sessions, recovery);
    const lowScore = r.hasSignal && r.score != null && r.score < 0.45;
    const highWarn = bal.warning?.severity === "high";
    if (!lowScore && !highWarn) return null;
    const reason =
      bal.warning?.reasons[0] ??
      (r.hasSubjective
        ? t("самочувствие отмечено как низкое", "your check-in was low")
        : t("по самочувствию после тренировок", "based on how you felt after workouts"));
    return { reason };
  }, [sessions, recovery]);

  const goalLabel = focusGoal
    ? FOCUS_GOALS.find((g) => g.goal === focusGoal)?.label.toLowerCase()
    : null;

  return (
    <Stack spacing={1.25} sx={{ mt: 0.5 }}>
      {lowReadiness && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            p: 1.5,
            borderRadius: 2,
            border: "1px solid",
            borderColor: alpha(PROGRAM_COLOR, 0.35),
            backgroundImage: `linear-gradient(100deg, ${alpha(PROGRAM_COLOR, 0.14)}, transparent 72%)`,
          }}
        >
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: 2,
              flexShrink: 0,
              display: "grid",
              placeItems: "center",
              color: PROGRAM_COLOR,
              backgroundImage: `linear-gradient(135deg, ${alpha(PROGRAM_COLOR, 0.28)}, ${alpha(PROGRAM_COLOR, 0.08)})`,
            }}
          >
            <SpaRoundedIcon sx={{ fontSize: 20 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
              {t("Сегодня стоит поберечься", "Take it easy today")}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              {t("Готовность снижена", "Readiness is down")}: {lowReadiness.reason}.{" "}
              {t("Лучше восстановление или лёгкое.", "Recovery or something light is better.")}
            </Typography>
          </Box>
        </Box>
      )}

      <Typography variant="body2" color="text.secondary">
        {t("С чего начнём сегодня?", "Where to start today?")}
      </Typography>

      {/* Герой-действие — самый сильный ответ на «что делать сейчас». */}
      {activeProgram && nextWorkout ? (
        <HeroAction
          color={PROGRAM_COLOR}
          icon="gym"
          eyebrow={t("Тренировка дня", "Workout of the day")}
          title={nextWorkout.workout.name}
          sub={`${activeProgram.name} · ${t("круг", "cycle")} ${activeProgram.cycleNumber} · ${t("веса подтянутся", "weights carried over")}`}
          onClick={() => onStartProgramDay(activeProgram, nextWorkout.index)}
        />
      ) : (
        <HeroAction
          color={GREEN}
          icon="bolt"
          eyebrow={t("Не знаешь, что потренировать?", "Not sure what to train?")}
          title={t("Подобрать тренировку", "Suggest a workout")}
          sub={
            goalLabel
              ? t(`Тренер соберёт план под цель «${goalLabel}»`, `A plan for your goal: “${goalLabel}”`)
              : t("Тренер соберёт план под твою цель и время", "A plan for your goal and time")
          }
          sparkle
          onClick={onSuggest}
        />
      )}

      {/* Вторичные варианты — тоже в один тап. */}
      <Stack spacing={1}>
        {activeProgram && (
          <ActionRow
            color={GREEN}
            icon={<AutoAwesomeIcon sx={{ fontSize: 20 }} />}
            label={t("Подобрать другую тренировку", "Suggest another workout")}
            sub={t("Если сегодня не по программе", "If today is off-program")}
            onClick={onSuggest}
          />
        )}
        {/* Доступ к программам держим в списке ВСЕГДА — и когда программа уже
            есть (добавить ещё одну), и когда её нет. Иначе он «выпадал». */}
        <ActionRow
          color={PROGRAM_COLOR}
          icon={<LibraryBooksRoundedIcon sx={{ fontSize: 20 }} />}
          label={t("Программы", "Programs")}
          sub={
            activeProgram
              ? t("Мои программы и библиотека готовых", "My programs and the library")
              : t("Взять готовый сплит или создать свой", "Grab a ready split or build your own")
          }
          onClick={onOpenLibrary}
        />
        {lastTraining && (
          <ActionRow
            color={TYPE_COLOR[lastTraining.kind]}
            icon={<ReplayRoundedIcon sx={{ fontSize: 20 }} />}
            label={`${t("Повторить", "Repeat")}: ${titleOf(lastTraining)}`}
            sub={t("Скопировать прошлую тренировку на сегодня", "Copy your last workout to today")}
            onClick={() => onRepeatLast(lastTraining)}
          />
        )}
        <ActionRow
          color="#94a3b8"
          icon={<AddRoundedIcon sx={{ fontSize: 20 }} />}
          label={t("Добавить вручную", "Add manually")}
          sub={t("Силовая, кардио, мобилити или восстановление", "Strength, cardio, mobility or recovery")}
          onClick={onCreate}
        />
      </Stack>

      {nudge && (
        <Stack
          direction="row"
          spacing={0.75}
          sx={{ alignItems: "center", mt: 0.5, color: "text.secondary" }}
        >
          <LocalFireDepartmentRoundedIcon
            sx={{ fontSize: 16, color: nudge.hot ? PROGRAM_COLOR : "text.disabled" }}
          />
          <Typography variant="caption">{nudge.text}</Typography>
        </Stack>
      )}
    </Stack>
  );
}

/** Крупная карточка-действие с плашкой-иконкой; вся кликабельна. */
function HeroAction({
  color,
  icon,
  eyebrow,
  title,
  sub,
  sparkle,
  onClick,
}: {
  color: string;
  icon: IconKey;
  eyebrow: string;
  title: string;
  sub: string;
  sparkle?: boolean;
  onClick: () => void;
}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        p: 2,
        borderRadius: 2,
        cursor: "pointer",
        border: "1px solid",
        borderColor: alpha(color, 0.35),
        borderLeft: `3px solid ${color}`,
        backgroundColor: "background.paper",
        backgroundImage: `linear-gradient(100deg, ${alpha(color, 0.16)}, transparent 72%)`,
      }}
    >
      <Box
        sx={{
          width: 52,
          height: 52,
          borderRadius: 2,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          color,
          backgroundImage: `linear-gradient(135deg, ${alpha(color, 0.3)}, ${alpha(color, 0.08)})`,
        }}
      >
        <ActivityIcon icon={icon} fontSize="medium" />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", color }}>
          {sparkle && <AutoAwesomeIcon sx={{ fontSize: 14 }} />}
          <Typography variant="caption" sx={{ fontWeight: 600, color }}>
            {eyebrow}
          </Typography>
        </Stack>
        <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }} noWrap>
          {title}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          sx={{ display: "block" }}
        >
          {sub}
        </Typography>
      </Box>
      <PlayArrowRoundedIcon sx={{ color, flexShrink: 0 }} />
    </Box>
  );
}

/** Компактная строка-действие. */
function ActionRow({
  color,
  icon,
  label,
  sub,
  onClick,
}: {
  color: string;
  icon: ReactNode;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        p: 1.25,
        borderRadius: 2,
        cursor: "pointer",
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box
        sx={{
          width: 38,
          height: 38,
          borderRadius: 2,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          color,
          backgroundImage: `linear-gradient(135deg, ${alpha(color, 0.26)}, ${alpha(color, 0.07)})`,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
          {sub}
        </Typography>
      </Box>
      <ChevronRightIcon sx={{ color: "text.disabled", flexShrink: 0 }} />
    </Box>
  );
}

function titleOf(session: Session): string {
  return session.title || activityLabel(session) || SESSION_LABELS[session.kind];
}

/**
 * Лёгкий мотивационный нудж — ТОЛЬКО по реальным данным, ничего не выдумываем.
 * Серия важнее «давно не тренировался»: тянем к «смотри, ты держишь ритм».
 */
function buildNudge(
  sessions: Session[],
  streak: number,
  t: (ru: string, en: string) => string,
): { text: string; hot: boolean } | null {
  const days = (n: number) => (t("ru", "en") === "ru" ? plural(n, "день", "дня", "дней") : n === 1 ? "day" : "days");
  if (sessions.length === 0) {
    return { text: t("Первая тренировка — и дальше приложение подскажет ритм", "Log your first workout — the app will guide your rhythm"), hot: false };
  }
  if (streak >= 2) {
    return { text: `${t("Серия", "Streak")} ${streak} ${days(streak)} ${t("подряд — не бросай", "in a row — keep it up")}`, hot: true };
  }
  const lastDate = sessions
    .map((s) => s.date)
    .filter((d) => d <= today())
    .sort()
    .at(-1);
  if (!lastDate) return null;
  const gap = daysBetween(lastDate, today());
  if (gap <= 0) return null;
  if (gap === 1) return { text: t("Последняя тренировка была вчера — хороший момент продолжить", "Last workout was yesterday — a good moment to continue"), hot: false };
  return {
    text: `${gap} ${days(gap)} ${t("без тренировки — самое время вернуться", "without a workout — time to get back")}`,
    hot: false,
  };
}

/** Разница в календарных днях между двумя ключами YYYY-MM-DD. */
function daysBetween(from: string, to: string): number {
  let days = 0;
  let cursor = from;
  while (cursor < to && days < 999) {
    cursor = addDays(cursor, 1);
    days += 1;
  }
  return days;
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
