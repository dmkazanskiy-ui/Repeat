import type { ReactNode } from "react";
import { radius } from "../ui";
import { CARD_IN } from "../theme";
import { useMemo, useState } from "react";
import { Box, Button, IconButton, Stack, Typography } from "@mui/material";
import { ChevronLeft as ChevronLeftIcon } from "../ui/icons";
import { ChevronRight as ChevronRightIcon } from "../ui/icons";
import { Add as AddIcon } from "../ui/icons";
import { ExpandMore as ExpandMoreIcon } from "../ui/icons";
import { ExpandLess as ExpandLessIcon } from "../ui/icons";
import SessionTimeline from "../components/SessionTimeline";
import TodayGuide from "../components/TodayGuide";
import { plannedOn } from "../lib/plan";
import type { BodySignals } from "../lib/bodySignals";
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
import DayHero from "../components/DayHero";
import { useT } from "../lib/i18n";
import type { Exercise, Plan, PlannedSession, RecoveryEntry, Session, TrainingProgram } from "../lib/types";

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
  /** План по датам: карточки дня и действия с ними. */
  plans?: Plan[];
  plannedSessions?: PlannedSession[];
  workoutNames?: Record<string, string>;
  onStartPlanned?: (card: PlannedSession) => void;
  onSkipPlanned?: (card: PlannedSession) => void;
  onOpenPlan?: () => void;
  /** HRV и пульс покоя с часов — подсказка облегчить день. */
  body?: BodySignals | null;
  onSwapToTreadmill?: (card: PlannedSession) => void;
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
  plans = [],
  plannedSessions = [],
  workoutNames = {},
  onStartPlanned,
  onSkipPlanned,
  onOpenPlan,
  body = null,
  onSwapToTreadmill,
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
  const marked = useMemo(() => {
    const set = datesWithSessions(sessions);
    const live = new Set(plans.filter((p) => !p.archivedAt).map((p) => p.id));
    for (const p of plannedSessions) if (live.has(p.planId)) set.add(p.date);
    return set;
  }, [sessions, plans, plannedSessions]);
  const dayPlan = useMemo(() => plannedOn(plannedSessions, plans, selected), [plannedSessions, plans, selected]);
  const dayList = sessionsOn(sessions, selected);
  const todayKey = today();
  const [hiddenTip, setHiddenTip] = useState(() => {
    try {
      return localStorage.getItem("repeat_overreach_tip") ?? "";
    } catch {
      return "";
    }
  });
  const strengthToday = selected === todayKey ? dayPlan.find((c) => c.kind === "strength" && c.status === "planned" && !c.linkedSessionId) : undefined;
  const showOverreach = Boolean(body?.overreach && strengthToday && hiddenTip !== todayKey && onSwapToTreadmill);
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
        <Stack direction="row" spacing={0.5}>
          {dayPlan.length > 0 && onOpenPlan && (
            <Button size="small" onClick={onOpenPlan}>
              {t("План", "Plan")}
            </Button>
          )}
          {selected !== todayKey && (
            <Button size="small" onClick={goToday}>
              {t("Сегодня", "Today")}
            </Button>
          )}
        </Stack>
      </Stack>

      {/* Итог дня — та же hero-карточка, что «Итоги недели» в аналитике. */}
      {dayList.length > 0 && <DayHero dayList={dayList} allSessions={sessions} selected={selected} exercises={exercises} planned={dayPlan} />}

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

      {showOverreach && body && strengthToday && (
        <Box sx={{ mb: 1.5, p: 2, borderRadius: radius.card, border: "1px solid", borderColor: "divider", bgcolor: "background.paper", animation: CARD_IN }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
            {t("Организм просит день полегче", "Your body asks for an easier day")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {[
              body.lowHrvDays >= 2 ? t(`HRV ниже нормы ${body.lowHrvDays} дн. подряд (${body.hrv} мс${body.hrvBase ? `, норма ${Math.round(body.hrvBase)}` : ""})`, `HRV below normal ${body.lowHrvDays} days in a row (${body.hrv} ms${body.hrvBase ? `, normal ${Math.round(body.hrvBase)}` : ""})`) : "",
              body.rhrHigh ? t(`пульс покоя ${body.rhr}${body.rhrBase ? ` при норме ${Math.round(body.rhrBase)}` : ""}`, `resting HR ${body.rhr}${body.rhrBase ? ` vs normal ${Math.round(body.rhrBase)}` : ""}`) : "",
            ]
              .filter(Boolean)
              .join(" · ")}
            . {t(`По правилу плана «${strengthToday.title}» лучше заменить дорожкой.`, `Per your plan's rule, swap "${strengthToday.title}" for the treadmill.`)}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            <Button size="small" variant="contained" onClick={() => onSwapToTreadmill?.(strengthToday)}>
              {t("Заменить на дорожку", "Swap to treadmill")}
            </Button>
            <Button
              size="small"
              color="inherit"
              sx={{ color: "text.secondary" }}
              onClick={() => {
                setHiddenTip(todayKey);
                try {
                  localStorage.setItem("repeat_overreach_tip", todayKey);
                } catch {
                  /* без хранилища — просто скроем до перезапуска */
                }
              }}
            >
              {t("Оставить зал", "Keep gym")}
            </Button>
          </Stack>
        </Box>
      )}

      {dayList.length === 0 && dayPlan.length === 0 ? (
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
          planned={dayPlan}
          workoutNames={workoutNames}
          onOpenPlanned={onStartPlanned}
          onSkipPlanned={onSkipPlanned}
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
