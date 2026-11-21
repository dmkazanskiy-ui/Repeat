import type { ReactNode } from "react";
import { radius } from "../ui";
import { CARD_IN } from "../theme";
import { useMemo, useState } from "react";
import { Box, Button, IconButton, Stack, Typography } from "@mui/material";
import { formatDate, formatVolume } from "../lib/format";
import { ChevronLeft as ChevronLeftIcon } from "../ui/icons";
import { ChevronRight as ChevronRightIcon } from "../ui/icons";
import { Add as AddIcon } from "../ui/icons";
import { ExpandMore as ExpandMoreIcon } from "../ui/icons";
import { ExpandLess as ExpandLessIcon } from "../ui/icons";
import SessionTimeline from "../components/SessionTimeline";
import TodayGuide from "../components/TodayGuide";
import {
    weekdaysShort,
  addDays,
  weekGrid,
  formatDateFull,
  monthGrid,
  monthTitle,
  parseDateKey,
  today,
  toDateKey,
} from "../lib/format";
import { datesWithSessions, sessionsOn } from "../lib/store";
import { daySummary } from "../lib/analytics";
import SummaryHero from "../components/analytics/SummaryHero";
import type { HeroData } from "../components/analytics/SummaryHero";
import { useT } from "../lib/i18n";
import { sessionDurationSec, sessionVolume } from "../lib/types";
import type { Exercise, RecoveryEntry, Session, TrainingProgram } from "../lib/types";

/** Итог дня в формате hero-карточки аналитики (переиспользуем «Итоги недели»). */
function buildDayHero(
  dayList: Session[],
  allSessions: Session[],
  selected: string,
  t: ReturnType<typeof useT>,
): HeroData {
  const sum = daySummary(dayList);

  // Бары — неделя Пн–Вс, где лежит выбранный день. Высота = «активность» дня
  // (тоннаж силовой / минуты кардио-мобилити / мелкий бар восстановления);
  // подсвечен столбец выбранного дня (Пн → 1-й столбец и т.д.).
  const week = weekGrid(selected);
  const bars: number[] = [];
  const rec: boolean[] = [];
  const tips: { value: string; label: string }[] = [];
  for (const key of week) {
    const day = sessionsOn(allSessions, key);
    let mag = 0;
    let vol = 0;
    let sec = 0;
    for (const s of day) {
      if (s.kind === "strength") {
        const v = sessionVolume(s);
        mag += v;
        vol += v;
      } else if (s.kind === "cardio" || s.kind === "mobility") {
        const d = sessionDurationSec(s) ?? 0;
        mag += d;
        sec += d;
      }
    }
    const parts: string[] = [];
    if (vol > 0) parts.push(formatVolume(vol));
    if (sec >= 60) parts.push(`${Math.round(sec / 60)} ${t("мин", "min")}`);
    if (!parts.length && day.some((s) => s.kind === "recovery")) parts.push(t("восстановление", "recovery"));
    tips.push({ value: parts.join(" · ") || t("отдых", "rest"), label: formatDate(key) });
    bars.push(mag);
    rec.push(mag <= 0 && day.some((s) => s.kind === "recovery"));
  }
  const highlightIndex = Math.max(0, week.indexOf(selected));

  let volumeText = "—";
  let volumeLabel = t("Тоннаж дня", "Day tonnage");
  let volumeTick: { value: number; format: (v: number) => string } | undefined;
  if (sum.tonnage > 0) {
    volumeText = formatVolume(sum.tonnage);
    volumeTick = { value: sum.tonnage, format: (v) => formatVolume(v) };
  } else if (sum.durationSec >= 60) {
    volumeText = `${Math.round(sum.durationSec / 60)} ${t("мин", "min")}`;
    volumeTick = { value: Math.round(sum.durationSec / 60), format: (v) => `${Math.round(v)} ${t("мин", "min")}` };
    volumeLabel = t("Активное время", "Active time");
  }

  const parts: string[] = [];
  if (sum.sets > 0) parts.push(`${sum.sets} ${t("подх.", "sets")}`);
  if (sum.tonnage > 0 && sum.durationSec >= 60) parts.push(`${Math.round(sum.durationSec / 60)} ${t("мин", "min")}`);
  if (sum.distanceM > 0) parts.push(`${(Math.round(sum.distanceM / 100) / 10).toLocaleString(t("ru-RU", "en-US"))} ${t("км", "km")}`);

  return {
    title: t("Итог дня", "Day summary"),
    changeLabel: "",
    changePercent: null,
    workoutsText: sum.shortHeadline,
    daysText: parts.join(" · "),
    volumeText,
    volumeTick,
    volumeLabel,
    dailyVolume: bars,
    barTips: tips,
    recoveryDays: rec,
    highlightIndex,
  };
}
import type { FocusGoal } from "../lib/workoutBuilder";

interface Props {
  sessions: Session[];
  exercises: Exercise[];
  programs: TrainingProgram[];
  recovery: RecoveryEntry[];
  focusGoal: FocusGoal | null;
  selected: string;
  onSelect: (date: string) => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onChangeTime: (id: string, time: string | null) => void;
  /** Действия проактивного «Сегодня». */
  onStartProgramDay: (program: TrainingProgram, workoutIndex: number) => void;
  onSuggest: () => void;
  onOpenLibrary: () => void;
  onRepeatLast: (session: Session) => void;
  /** Сколько дней не обновлялся вес (null — свежий). Калории считаются по нему. */
  weightStaleDays?: number | null;
  onUpdateWeight?: () => void;
  /** Что-то под днём — на главной это лента. */
  footer?: ReactNode;
}

export default function CalendarScreen({
  sessions,
  exercises,
  programs,
  recovery,
  focusGoal,
  selected,
  onSelect,
  onOpen,
  onCreate,
  onDelete,
  onChangeTime,
  onStartProgramDay,
  onSuggest,
  onOpenLibrary,
  onRepeatLast,
  weightStaleDays = null,
  onUpdateWeight,
  footer,
}: Props) {
  const t = useT();
  const [cursor, setCursor] = useState(() => parseDateKey(selected));
  // По умолчанию календарь свёрнут в одну неделю: на экране телефона
  // это оставляет место списку тренировок, а месяц нужен реже.
  const [expanded, setExpanded] = useState(false);

  const grid = useMemo(
    () => (expanded ? monthGrid(cursor) : weekGrid(selected)),
    [expanded, cursor, selected],
  );
  const marked = useMemo(() => datesWithSessions(sessions), [sessions]);
  const dayList = sessionsOn(sessions, selected);
  const dayHero = useMemo(
    () => (dayList.length > 0 ? buildDayHero(dayList, sessions, selected, t) : null),
    [dayList, sessions, selected, t],
  );
  const todayKey = today();
  const cursorMonth = cursor.getMonth();

  /** Свёрнутый календарь листается неделями, развёрнутый — месяцами. */
  function shift(delta: number) {
    if (expanded) {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
      return;
    }
    const next = addDays(selected, delta * 7);
    setCursor(parseDateKey(next));
    onSelect(next);
  }

  function goToday() {
    setCursor(new Date());
    onSelect(todayKey);
  }

  return (
    <Box sx={{ pb: 10 }}>
      <Stack
        direction="row"
        sx={{ mb: 1, alignItems: "center", justifyContent: "space-between" }}
      >
        <IconButton
          onClick={() => shift(-1)}
          aria-label={expanded ? t("Предыдущий месяц", "Previous month") : t("Предыдущая неделя", "Previous week")}
        >
          <ChevronLeftIcon />
        </IconButton>

        <Button
          onClick={() => setExpanded((value) => !value)}
          endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          sx={{ color: "text.primary", fontSize: 18, fontWeight: 600, py: 0.5 }}
        >
          {monthTitle(expanded ? cursor : parseDateKey(selected))}
        </Button>

        <IconButton
          onClick={() => shift(1)}
          aria-label={expanded ? t("Следующий месяц", "Next month") : t("Следующая неделя", "Next week")}
        >
          <ChevronRightIcon />
        </IconButton>
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", mb: 0.5 }}>
        {weekdaysShort().map((day) => (
          <Typography
            key={day}
            variant="caption"
            align="center"
            color="text.secondary"
          >
            {day}
          </Typography>
        ))}
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 0.5 }}>
        {grid.map((key) => {
          const date = parseDateKey(key);
          const isSelected = key === selected;
          const isToday = key === todayKey;
          // В свёрнутом виде соседние месяцы приглушать не надо —
          // неделя на стыке месяцев это нормальная неделя.
          const outside = expanded && date.getMonth() !== cursorMonth;

          return (
            <Box
              key={key}
              component="button"
              onClick={() => onSelect(key)}
              sx={{
                position: "relative",
                aspectRatio: "1",
                border: isToday ? "1px solid" : "1px solid transparent",
                borderColor: isToday ? "primary.main" : "transparent",
                borderRadius: "50%",
                bgcolor: isSelected ? "primary.main" : "transparent",
                color: isSelected
                  ? "primary.contrastText"
                  : outside
                    ? "text.disabled"
                    : "text.primary",
                // Число центрируется по всей ячейке; точка вынесена из потока,
                // иначе она смещала цифру вверх.
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontFamily: "inherit",
                cursor: "pointer",
                opacity: outside ? 0.35 : 1,
              }}
            >
              {date.getDate()}
              <Box
                sx={{
                  position: "absolute",
                  bottom: 5,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  bgcolor: marked.has(key)
                    ? isSelected
                      ? "primary.contrastText"
                      : "primary.main"
                    : "transparent",
                }}
              />
            </Box>
          );
        })}
      </Box>

      <Stack
        direction="row"
        sx={{ mt: 3, mb: 1.5, alignItems: "center", justifyContent: "space-between" }}
      >
        <Typography variant="h2">{formatDateFull(selected)}</Typography>
        {selected !== todayKey && (
          <Button size="small" onClick={goToday}>
            {t("Сегодня", "Today")}
          </Button>
        )}
      </Stack>

      {/* Итог дня — та же hero-карточка, что «Итоги недели» в аналитике. */}
      {dayHero && <SummaryHero hero={dayHero} />}

      {selected === todayKey && weightStaleDays != null && onUpdateWeight && (
        <Box
          component="button"
          onClick={onUpdateWeight}
          sx={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 1,
            mb: 1.5,
            px: 1.5,
            py: 1,
            borderRadius: radius.card, animation: CARD_IN,
            border: "1px solid",
            borderColor: "divider",
            bgcolor: "transparent",
            color: "text.secondary",
            font: "inherit",
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          <Typography variant="body2" sx={{ flex: 1 }}>
            {weightStaleDays === Infinity
              ? t("Внеси вес — по нему считаются калории", "Add your weight — calories are based on it")
              : t(
                  `Вес не обновлялся ${weightStaleDays} дн. — калории считаются по старому`,
                  `Weight not updated for ${weightStaleDays} days — calories use the old value`,
                )}
          </Typography>
          <Typography variant="body2" color="primary" sx={{ fontWeight: 600, flexShrink: 0 }}>
            {t("Обновить", "Update")}
          </Typography>
        </Box>
      )}

      {dayList.length === 0 ? (
        selected === todayKey ? (
          // Проактивный «Сегодня»: пустой день не оставляем заглушкой, а ведём
          // пользователя к действию в один тап (что делать прямо сейчас).
          <TodayGuide
            sessions={sessions}
            programs={programs}
            recovery={recovery}
            focusGoal={focusGoal}
            onStartProgramDay={onStartProgramDay}
            onSuggest={onSuggest}
            onOpenLibrary={onOpenLibrary}
            onRepeatLast={onRepeatLast}
            onCreate={onCreate}
          />
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            {selected > todayKey
              ? t("На этот день ничего не запланировано.", "Nothing planned for this day.")
              : t("В этот день тренировок не было.", "No workouts on this day.")}
          </Typography>
        )
      ) : (
        <SessionTimeline
          sessions={dayList}
          exercises={exercises}
          onOpen={onOpen}
          onDelete={onDelete}
          onChangeTime={onChangeTime}
        />
      )}

      {/* В сегодняшнем дне кнопки нет — тренировка добавляется через центральный «+».
          В прошлом — «Добавить», в будущем — «Запланировать»; обе вторичным стилем. */}
      {selected !== todayKey && (
        <Button
          fullWidth
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={onCreate}
          sx={{ mt: 2 }}
        >
          {selected > todayKey ? t("Запланировать тренировку", "Schedule a workout") : t("Добавить тренировку", "Add a workout")}
        </Button>
      )}
      {footer}
    </Box>
  );
}

export { toDateKey };
