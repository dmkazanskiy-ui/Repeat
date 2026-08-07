import { useMemo, useState } from "react";
import { Box, Button, IconButton, Stack, Typography } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import AddIcon from "@mui/icons-material/Add";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import SessionTimeline from "../components/SessionTimeline";
import TodayGuide from "../components/TodayGuide";
import {
    weekdaysShort,
  addDays,
  weekGrid,
  formatDateFull,
  monthGrid,
  monthTitle,
  nowTime,
  parseDateKey,
  today,
  toDateKey,
} from "../lib/format";
import { datesWithSessions, sessionsOn } from "../lib/store";
import { daySummary } from "../lib/analytics";
import DaySummaryCard from "../components/DaySummaryCard";
import { useT } from "../lib/i18n";
import type { Exercise, RecoveryEntry, Session, TrainingProgram } from "../lib/types";
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
  const summary = useMemo(() => daySummary(dayList), [dayList]);
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

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", mb: 0.5 }}>
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

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.5 }}>
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
                borderRadius: 2,
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

      {/* Итог дня — карточка со цветовой идентичностью по составу дня
          (серый/фиолет/красный/бирюза/зелёный, градиент на смешанном). */}
      {dayList.length > 0 && <DaySummaryCard summary={summary} />}

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
          // Прошлый/будущий пустой день — серая карточка итога дня.
          <DaySummaryCard
            summary={summary}
            emptyLabel={
              selected > todayKey
                ? t("Ничего не запланировано", "Nothing planned")
                : t("Не было тренировок", "No workouts")
            }
          />
        )
      ) : (
        <SessionTimeline
          sessions={dayList}
          exercises={exercises}
          onOpen={onOpen}
          onDelete={onDelete}
          onChangeTime={onChangeTime}
          now={selected === todayKey ? nowTime() : undefined}
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
    </Box>
  );
}

export { toDateKey };
