// План по датам: сетка неделя/месяц (7 дней × слоты) с цветом по статусу,
// итог «выполнено N из M», минуты бега/вела/дорожки план и факт, правила плана.
import { useEffect, useMemo, useState } from "react";
import { Box, Button, IconButton, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { Card, Section, Tile } from "../ui";
import Segmented from "../ui/Segmented";
import { ArrowBack, ChevronLeft, ChevronRight } from "../ui/icons";
import { ActivityIcon } from "../lib/icons";
import { activePlan, periodSummary, plannedIcon, SLOT_LABELS, SLOT_ORDER, slotState, type SlotCell } from "../lib/plan";
import { addDays, formatDate, parseDateKey, today, weekGrid, weekdaysShort } from "../lib/format";
import type { Plan, PlannedSession, PlanSlot, Session, TrainingProgram } from "../lib/types";
import { useT } from "../lib/i18n";

interface Props {
  plans: Plan[];
  plannedSessions: PlannedSession[];
  sessions: Session[];
  programs: TrainingProgram[];
  selected: string;
  onBack: () => void;
  onOpenDay: (date: string) => void;
  onArchive: (planId: string) => void;
}

const RULE_LABELS: Record<string, [string, string]> = {
  overreach: ["Перегруз", "Overreach"],
  running: ["Бег", "Running"],
  coldAfterStrength: ["Холод после силовой", "Cold after strength"],
  treadmillLogging: ["Дорожка", "Treadmill"],
};

export default function PlanScreen({ plans, plannedSessions, sessions, programs, selected, onBack, onOpenDay, onArchive }: Props) {
  const t = useT();
  const plan = activePlan(plans, selected) ?? activePlan(plans, today());
  const [view, setView] = useState<"week" | "month">("week");
  const [weekStart, setWeekStart] = useState(() => weekGrid(plan && (selected < plan.start || selected > plan.end) ? plan.start : selected)[0]);
  const cards = useMemo(() => (plan ? plannedSessions.filter((p) => p.planId === plan.id) : []), [plan, plannedSessions]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const slots = useMemo(() => SLOT_ORDER.filter((s) => cards.some((c) => c.slot === s)), [cards]);

  if (!plan) {
    return (
      <Box sx={{ pb: 10 }}>
        <Header title={t("План", "Plan")} onBack={onBack} />
        <Typography color="text.secondary">
          {t("Активного плана нет. Попроси ИИ составить план и вставь его в «Профиль → ИИ-помощник».", "No active plan. Ask an AI for a plan and paste it in Profile → AI assistant.")}
        </Typography>
      </Box>
    );
  }

  const week = weekGrid(weekStart);
  const program = programs.find((p) => p.id === plan.programId);
  const weeks: string[][] = [];
  for (let d = weekGrid(plan.start)[0]; d <= plan.end; d = addDays(d, 7)) weeks.push(weekGrid(d));
  const periodDates = view === "week" ? week : weeks.flat();
  const sum = periodSummary(cards, sessions, periodDates);

  return (
    <Box sx={{ pb: 10 }}>
      <Header title={plan.name} onBack={onBack} />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {formatDate(plan.start)} – {formatDate(plan.end)}
        {plan.goal ? ` · ${plan.goal}` : ""}
      </Typography>

      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: "week", label: t("Неделя", "Week") },
          { value: "month", label: t("Месяц", "Month") },
        ]}
      />

      {view === "week" ? (
        <>
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mt: 2, mb: 1 }}>
            <IconButton aria-label={t("Предыдущая неделя", "Previous week")} onClick={() => setWeekStart(addDays(weekStart, -7))}>
              <ChevronLeft />
            </IconButton>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {formatDate(week[0])} – {formatDate(week[6])}
            </Typography>
            <IconButton aria-label={t("Следующая неделя", "Next week")} onClick={() => setWeekStart(addDays(weekStart, 7))}>
              <ChevronRight />
            </IconButton>
          </Stack>
          <Card>
            <Grid dates={week} slots={slots} cards={cards} big onOpenDay={onOpenDay} />
          </Card>
        </>
      ) : (
        <Card sx={{ mt: 2, display: "grid", gap: 1.5 }}>
          <DayHeader dates={weeks[0] ?? week} small />
          {weeks.map((w) => {
            const s = periodSummary(cards, sessions, w);
            return (
              <Box key={w[0]}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                  {formatDate(w[0])} · {s.slotsDone} {t("из", "of")} {s.slots}
                </Typography>
                <Grid dates={w} slots={slots} cards={cards} onOpenDay={onOpenDay} />
              </Box>
            );
          })}
        </Card>
      )}

      <Section title={view === "week" ? t("Итог недели", "Week total") : t("Итог плана", "Plan total")}>
        <Card sx={{ display: "grid", gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
            {t("Выполнено", "Done")} {sum.slotsDone} {t("из", "of")} {sum.slots}
          </Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1 }}>
            {(
              [
                ["run", t("Бег", "Run")],
                ["bike", t("Вело", "Bike")],
                ["treadmill", t("Дорожка", "Treadmill")],
              ] as const
            ).map(([k, label]) => (
              <Tile key={k} label={`${label}, ${t("мин", "min")}`} value={`${sum.minutes[k].fact}`} aside={`${t("из", "of")} ${sum.minutes[k].plan}`} />
            ))}
          </Box>
        </Card>
      </Section>

      {(program || (plan.rules && Object.keys(plan.rules).length > 0)) && (
        <Section title={t("Правила", "Rules")}>
          <Card sx={{ display: "grid", gap: 1.25 }}>
            {program && (
              <Rule
                title={program.name}
                text={[
                  program.progression ? t(`Двойная прогрессия: +${program.progression.stepKg} кг, гантели и изоляция +${program.progression.dumbbellStepKg ?? program.progression.stepKg} кг`, `Double progression: +${program.progression.stepKg} kg, dumbbells & isolation +${program.progression.dumbbellStepKg ?? program.progression.stepKg} kg`) : "",
                  program.wave ? "" : t("без волны", "no wave"),
                  program.deloadEveryWeeks ? t(`разгрузка раз в ${program.deloadEveryWeeks} нед.`, `deload every ${program.deloadEveryWeeks} wk`) : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            )}
            {Object.entries(plan.rules ?? {}).map(([k, v]) => (
              <Rule key={k} title={RULE_LABELS[k] ? t(...RULE_LABELS[k]) : k} text={v} />
            ))}
          </Card>
        </Section>
      )}

      <Button fullWidth variant="outlined" color="inherit" sx={{ mt: 3, color: "text.secondary" }} onClick={() => onArchive(plan.id)}>
        {t("Убрать план в архив", "Archive plan")}
      </Button>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, textAlign: "center" }}>
        {t("Тренировки и программа останутся.", "Workouts and the program stay.")}
      </Typography>
    </Box>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  const t = useT();
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
      <IconButton onClick={onBack} edge="start" aria-label={t("Назад", "Back")}>
        <ArrowBack />
      </IconButton>
      <Typography variant="h1" sx={{ flex: 1 }} noWrap>
        {title}
      </Typography>
    </Stack>
  );
}

function Rule({ title, text }: { title: string; text: string }) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {text}
      </Typography>
    </Box>
  );
}

const COLS = "36px repeat(7, minmax(0, 1fr))";

function DayHeader({ dates, small }: { dates: string[]; small?: boolean }) {
  const names = weekdaysShort();
  const todayKey = today();
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: COLS, gap: 0.5, mb: small ? 0 : 0.75 }}>
      <span />
      {dates.map((d, i) => (
        <Box key={d} sx={{ textAlign: "center", lineHeight: 1.2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {names[i]}
          </Typography>
          {!small && (
            <Typography variant="body2" sx={{ fontWeight: d === todayKey ? 800 : 500, color: d === todayKey ? "primary.main" : "text.primary" }}>
              {parseDateKey(d).getDate()}
            </Typography>
          )}
        </Box>
      ))}
    </Box>
  );
}

function Grid({ dates, slots, cards, big, onOpenDay }: { dates: string[]; slots: PlanSlot[]; cards: PlannedSession[]; big?: boolean; onOpenDay: (d: string) => void }) {
  const theme = useTheme();
  const t = useT();
  const green = theme.palette.primary.main;
  const todayKey = today();
  const bg: Record<SlotCell["state"], string> = {
    empty: "transparent",
    planned: theme.palette.action.selected,
    partial: alpha(green, 0.35),
    done: green,
    skipped: "transparent",
  };
  return (
    <Box>
      {big && <DayHeader dates={dates} />}
      {slots.map((slot) => (
        <Box key={slot} sx={{ display: "grid", gridTemplateColumns: COLS, gap: 0.5, mb: 0.5, alignItems: "center" }}>
          <Typography variant="caption" color="text.secondary" noWrap>
            {SLOT_LABELS[slot].slice(0, big ? 5 : 3)}
          </Typography>
          {dates.map((d) => {
            const list = cards.filter((c) => c.date === d && c.slot === slot);
            const state = slotState(list);
            const first = list[0];
            return (
              <Box
                key={d}
                component="button"
                aria-label={`${d} ${SLOT_LABELS[slot]}: ${list.map((c) => c.title).join(", ") || t("пусто", "empty")}`}
                onClick={() => list.length && onOpenDay(d)}
                sx={{
                  height: big ? 40 : 22,
                  p: 0,
                  border: state === "skipped" ? `1px dashed ${theme.palette.divider}` : 0,
                  borderRadius: big ? "10px" : "6px",
                  bgcolor: bg[state],
                  color: state === "done" ? theme.palette.primary.contrastText : "text.secondary",
                  outline: d === todayKey ? `1.5px solid ${green}` : "none",
                  outlineOffset: 1,
                  display: "grid",
                  placeItems: "center",
                  cursor: list.length ? "pointer" : "default",
                  font: "inherit",
                }}
              >
                {big && first && <ActivityIcon icon={plannedIcon(first)} fontSize="small" />}
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}
