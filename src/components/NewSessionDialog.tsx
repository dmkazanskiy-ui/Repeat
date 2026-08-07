import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import RadioButtonUncheckedRoundedIcon from "@mui/icons-material/RadioButtonUncheckedRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { ActivityIcon, ICON_KEYS } from "../lib/icons";
import type { IconKey } from "../lib/icons";
import { TYPE_COLOR } from "../lib/activityColors";
import { L, useT } from "../lib/i18n";
import {
  CARDIO_ICONS,
  CARDIO_LABELS,
  MOBILITY_ICONS,
  MOBILITY_LABELS,
} from "../lib/types";
import {
  RECOVERY_CATEGORIES,
  proceduresOf,
} from "../lib/recovery/catalog";
import {
  GOALS,
  PLACES,
  TIME_OPTIONS,
  buildContext,
  buildSuggestion,
} from "../lib/workoutBuilder";
import type { FocusGoal, Goal, Place, TimeBudget, WorkoutSuggestion } from "../lib/workoutBuilder";
import type {
  CardioKind,
  CustomActivity,
  Exercise,
  MobilityKind,
  RecoveryCategory,
  RecoveryType,
  Session,
  SessionKind,
  TrainingProgram,
} from "../lib/types";

export interface CreateOptions {
  cardioKind?: CardioKind | null;
  mobilityKind?: MobilityKind | null;
  customKind?: string | null;
  icon?: IconKey | null;
  recoveryType?: RecoveryType | null;
}

interface Props {
  open: boolean;
  cardioKinds: CustomActivity[];
  mobilityKinds: CustomActivity[];
  programs: TrainingProgram[];
  hasClipboard: boolean;
  onClose: () => void;
  onCreate: (kind: SessionKind, options: CreateOptions) => void;
  onAddCustom: (kind: "cardio" | "mobility", activity: CustomActivity) => void;
  onStartProgram: (program: TrainingProgram, workoutIndex: number) => void;
  onPaste: () => void;
  /** Запуск подобранной тренировки (создать сессию из плана и открыть). */
  onSuggested: (suggestion: WorkoutSuggestion) => void;
  /** Для умного подбора: история + постоянная цель профиля. */
  sessions: Session[];
  exercises: Exercise[];
  focusGoal: FocusGoal | null;
  /** С какого шага открыть при появлении: обычный выбор или сразу мастер «Тренер». */
  initialStep?: "kind" | "goal";
}

/** Карточки типов активности — цвет по типу, как у карточек тренировок. */
const KIND_CARDS: Array<{
  id: string;
  color: string;
  icon: IconKey;
  label: string;
  hint: string;
}> = [
  // «Программа» — первой, если она есть (фильтр ниже уберёт её без активной).
  { id: "program", color: "#f59e0b", icon: "gym", get label() { return L("Программа", "Program"); }, get hint() { return L("Тренировка дня из твоего сплита", "Day's workout from your split"); } },
  { id: "strength", color: TYPE_COLOR.strength, icon: "gym", get label() { return L("Силовая в зале", "Strength (gym)"); }, get hint() { return L("Упражнения, подходы, веса", "Exercises, sets, weights"); } },
  { id: "cardio", color: TYPE_COLOR.cardio, icon: "run", get label() { return L("Кардио", "Cardio"); }, get hint() { return L("Бег, вел, плавание и другое", "Running, cycling, swimming and more"); } },
  { id: "mobility", color: TYPE_COLOR.mobility, icon: "yoga", get label() { return L("Мобилити", "Mobility"); }, get hint() { return L("Йога, ЛФК, стретчинг, медитация", "Yoga, rehab, stretching, meditation"); } },
  { id: "recovery", color: TYPE_COLOR.recovery, icon: "spa", get label() { return L("Восстановление", "Recovery"); }, get hint() { return L("Отдых, баня, холод, массаж, сон", "Rest, sauna, cold, massage, sleep"); } },
];

const CARDIO_KEYS = Object.keys(CARDIO_LABELS) as CardioKind[];
const MOBILITY_KEYS = Object.keys(MOBILITY_LABELS) as MobilityKind[];

type Step =
  | "kind"
  | "program"
  | "cardio"
  | "mobility"
  | "custom"
  | "recovery"
  | "goal"
  | "place"
  | "time"
  | "result";

/** Карточка типа активности / программы. */
function TypeCard({
  color,
  icon,
  label,
  hint,
  onClick,
}: {
  color: string;
  icon: IconKey;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        p: 1.5,
        borderRadius: 2,
        cursor: "pointer",
        border: "1px solid",
        borderColor: alpha(color, 0.25),
        borderLeft: `3px solid ${alpha(color, 0.7)}`,
        backgroundColor: "background.paper",
        backgroundImage: `linear-gradient(100deg, ${alpha(color, 0.1)}, transparent 70%)`,
      }}
    >
      <Box
        sx={{
          width: 46,
          height: 46,
          borderRadius: 2,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          color,
          backgroundImage: `linear-gradient(135deg, ${alpha(color, 0.28)}, ${alpha(color, 0.08)})`,
        }}
      >
        <ActivityIcon icon={icon} fontSize="medium" />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
          {hint}
        </Typography>
      </Box>
      <ChevronRightIcon sx={{ color: "text.disabled" }} />
    </Box>
  );
}

/** Выбираемая карточка (цель / время) с состоянием выбора. */
function SelectCard({
  icon,
  color,
  label,
  sub,
  selected,
  onClick,
}: {
  icon: ReactNode;
  color: string;
  label: string;
  sub: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        p: 1.5,
        borderRadius: 2,
        cursor: "pointer",
        border: "1px solid",
        borderColor: selected ? "primary.main" : "divider",
        bgcolor: selected ? "rgba(74,222,128,0.06)" : "transparent",
      }}
    >
      <Box
        sx={{
          width: 42,
          height: 42,
          borderRadius: 2,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          color,
          backgroundImage: `linear-gradient(135deg, ${alpha(color, 0.28)}, ${alpha(color, 0.08)})`,
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
      {selected ? (
        <CheckCircleRoundedIcon sx={{ color: "primary.main" }} />
      ) : (
        <RadioButtonUncheckedRoundedIcon sx={{ color: "text.disabled" }} />
      )}
    </Box>
  );
}

export default function NewSessionDialog({
  open,
  cardioKinds,
  mobilityKinds,
  programs,
  hasClipboard,
  onClose,
  onCreate,
  onAddCustom,
  onStartProgram,
  onPaste,
  onSuggested,
  sessions,
  exercises,
  focusGoal,
  initialStep = "kind",
}: Props) {
  const t = useT();
  const [step, setStep] = useState<Step>("kind");
  const activeProgram = programs.find((p) => !p.archivedAt) ?? null;
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<IconKey>("bolt");
  const [branch, setBranch] = useState<"cardio" | "mobility">("cardio");
  const [recCategory, setRecCategory] = useState<RecoveryCategory>("rest");
  // Мастер «Тренер». Цель по умолчанию — постоянная цель профиля.
  const [goal, setGoal] = useState<Goal | null>(focusGoal ?? null);
  const [place, setPlace] = useState<Place | null>(null);
  const [time, setTime] = useState<TimeBudget | null>(null);

  // При открытии прыгаем на нужный шаг: обычный выбор или сразу мастер «Тренер»
  // (из проактивного «Сегодня»). Цель уже предвыбрана постоянной целью профиля.
  useEffect(() => {
    if (open) setStep(initialStep);
  }, [open, initialStep]);

  // Контекст истории для умного подбора (не повторять недавнее, вес из прошлого).
  const ctx = useMemo(() => buildContext(sessions, exercises), [sessions, exercises]);
  const suggestion =
    goal && place && time ? buildSuggestion(goal, time, place, ctx) : null;

  function close() {
    setStep("kind");
    setName("");
    setIcon("bolt");
    setRecCategory("rest");
    setGoal(focusGoal ?? null);
    setPlace(null);
    setTime(null);
    onClose();
  }

  function submitCustom() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAddCustom(branch, { name: trimmed, icon });
    onCreate(branch === "cardio" ? "cardio" : "mobility", { customKind: trimmed, icon });
    close();
  }

  function pickKind(key: string) {
    if (key === "strength") {
      onCreate("strength", {});
      close();
    } else if (key === "program") setStep("program");
    else setStep(key as Step);
  }

  const title =
    step === "custom"
      ? branch === "cardio"
        ? t("Свой вид кардио", "Custom cardio")
        : t("Своё мобилити", "Custom mobility")
      : step === "cardio"
        ? t("Какое кардио?", "Which cardio?")
        : step === "mobility"
          ? t("Какое мобилити?", "Which mobility?")
          : step === "recovery"
            ? t("Восстановление", "Recovery")
            : step === "program"
              ? t("Тренировка дня", "Workout of the day")
              : step === "goal" || step === "place" || step === "time"
                ? t("Подсказка тренера", "Coach suggestion")
                : step === "result"
                  ? t("Готово", "Done")
                  : t("Новая тренировка", "New workout");

  return (
    <Dialog open={open} onClose={close} fullWidth>
      <DialogTitle sx={{ pb: 1 }}>{title}</DialogTitle>
      <DialogContent sx={{ pb: 3 }}>
        {step === "kind" && (
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              {t("Что планируем сегодня?", "What are we doing today?")}
            </Typography>
            {KIND_CARDS.filter((c) => c.id !== "program" || activeProgram).map((c) => (
              <TypeCard
                key={c.id}
                color={c.color}
                icon={c.icon}
                label={c.label}
                hint={c.hint}
                onClick={() => pickKind(c.id)}
              />
            ))}

            {hasClipboard && (
              <Button
                variant="outlined"
                startIcon={<ContentPasteIcon />}
                onClick={() => {
                  onPaste();
                  close();
                }}
                sx={{ justifyContent: "flex-start", px: 2, py: 1.25, mt: 0.5 }}
              >
                {t("Вставить скопированную тренировку", "Paste copied workout")}
              </Button>
            )}

            {/* Блок «Подсказка тренера» — умный подбор тренировки */}
            <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 2, mt: 1 }}>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", color: "primary.main", mb: 0.5 }}>
                <AutoAwesomeIcon sx={{ fontSize: 18 }} />
                <Typography variant="subtitle2">{t("Подсказка тренера", "Coach suggestion")}</Typography>
              </Stack>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {t("Не знаешь, что потренировать?", "Not sure what to train?")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("Подберём под твою цель, время и с учётом прошлых тренировок", "Tailored to your goal, time and past workouts")}
              </Typography>
              <Button
                fullWidth
                variant="contained"
                onClick={() => setStep("goal")}
                sx={{ mt: 1.5 }}
              >
                {t("Подобрать", "Suggest")}
              </Button>
            </Paper>
          </Stack>
        )}

        {/* Мастер: шаг 1 — цель */}
        {step === "goal" && (
          <Stack spacing={1.25}>
            <WizardHeader step={1} total={3} onBack={() => setStep("kind")} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {t("Какая у тебя цель на сегодня?", "What is your goal today?")}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5, mb: 0.5 }}>
              {t("Это поможет подобрать тренировку", "This helps tailor the workout")}
            </Typography>
            {GOALS.map((g) => (
              <SelectCard
                key={g.goal}
                icon={<ActivityIcon icon={g.icon} />}
                color={g.color}
                label={g.label}
                sub={g.sub}
                selected={goal === g.goal}
                onClick={() => setGoal(g.goal)}
              />
            ))}
            <Button fullWidth variant="contained" disabled={!goal} onClick={() => setStep("place")} sx={{ mt: 1 }}>
              {t("Продолжить", "Continue")}
            </Button>
          </Stack>
        )}

        {/* Мастер: шаг 2 — где */}
        {step === "place" && (
          <Stack spacing={1.25}>
            <WizardHeader step={2} total={3} onBack={() => setStep("goal")} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {t("Где тренируешься?", "Where are you training?")}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5, mb: 0.5 }}>
              {t("От этого зависит набор упражнений", "It affects the exercise pool")}
            </Typography>
            {PLACES.map((p) => (
              <SelectCard
                key={p.place}
                icon={<ActivityIcon icon={p.icon} />}
                color="#94a3b8"
                label={p.label}
                sub={p.sub}
                selected={place === p.place}
                onClick={() => setPlace(p.place)}
              />
            ))}
            <Button fullWidth variant="contained" disabled={!place} onClick={() => setStep("time")} sx={{ mt: 1 }}>
              {t("Продолжить", "Continue")}
            </Button>
          </Stack>
        )}

        {/* Мастер: шаг 3 — время */}
        {step === "time" && (
          <Stack spacing={1.25}>
            <WizardHeader step={3} total={3} onBack={() => setStep("place")} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {t("Сколько времени у тебя есть?", "How much time do you have?")}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5, mb: 0.5 }}>
              {t("Выбери примерное время на тренировку", "Pick roughly how long you have")}
            </Typography>
            {TIME_OPTIONS.map((t) => (
              <SelectCard
                key={t.time}
                icon={<ScheduleRoundedIcon />}
                color="#94a3b8"
                label={t.label}
                sub={t.sub}
                selected={time === t.time}
                onClick={() => setTime(t.time)}
              />
            ))}
            <Button fullWidth variant="contained" disabled={!time} onClick={() => setStep("result")} sx={{ mt: 1 }}>
              {t("Подобрать тренировку", "Suggest a workout")}
            </Button>
          </Stack>
        )}

        {/* Мастер: результат */}
        {step === "result" && suggestion && (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", color: "primary.main" }}>
              <AutoAwesomeIcon sx={{ fontSize: 20 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {t("Твоя тренировка готова", "Your workout is ready")}
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: -0.75 }}>
              {t("Подобрана под твою цель и доступное время", "Tailored to your goal and available time")}
            </Typography>

            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary">
                {t("Фокус тренировки", "Workout focus")}
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
                {suggestion.focus}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                <Chip size="small" variant="outlined" label={suggestion.durationLabel} />
                {suggestion.exercises.length > 0 && (
                  <Chip size="small" variant="outlined" label={`${suggestion.exercises.length} ${t("упр.", "ex.")}`} />
                )}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
                {t("Что улучшим", "What you'll improve")}
              </Typography>
              <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
                {suggestion.effects.map((ef) => (
                  <Chip
                    key={ef.label}
                    size="small"
                    icon={<ActivityIcon icon={ef.icon} />}
                    label={ef.label}
                    sx={{ "& .MuiChip-icon": { color: ef.color } }}
                  />
                ))}
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary">
                {t("Почему эта тренировка", "Why this workout")}
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {suggestion.reason}
              </Typography>
            </Paper>

            {suggestion.exercises.length > 0 ? (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  {t("План тренировки", "Workout plan")}
                </Typography>
                <Stack spacing={0.75}>
                  {suggestion.exercises.map((ex, i) => (
                    <Paper key={i} variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {ex.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {ex.sets} × {ex.repMin}–{ex.repMax} · {t("отдых", "rest")} {ex.restSec} {t("с", "s")}
                      </Typography>
                    </Paper>
                  ))}
                </Stack>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {t("Лёгкая мобилити и растяжка на всё тело — 15–20 минут в спокойном темпе.", "Light full-body mobility and stretching — 15–20 min easy.")}
              </Typography>
            )}

            <Button
              fullWidth
              variant="contained"
              onClick={() => {
                onSuggested(suggestion);
                close();
              }}
              sx={{ mt: 0.5 }}
            >
              {t("Начать тренировку", "Start workout")}
            </Button>
            <Button fullWidth onClick={() => setStep("time")}>
              {t("Назад", "Back")}
            </Button>
          </Stack>
        )}

        {step === "custom" && (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label={t("Название", "Name")}
              placeholder={branch === "cardio" ? t("Гребля, сайкл, лыжи…", "Rowing, spin, skiing…") : t("Цигун, пилатес…", "Qigong, pilates…")}
              value={name}
              autoFocus
              fullWidth
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitCustom();
              }}
            />
            <Box>
              <Typography variant="caption" color="text.secondary">
                {t("Иконка", "Icon")}
              </Typography>
              <Box sx={{ mt: 1, display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 0.5 }}>
                {ICON_KEYS.map((key) => (
                  <Box
                    key={key}
                    component="button"
                    onClick={() => setIcon(key)}
                    aria-label={key}
                    sx={{
                      aspectRatio: "1",
                      display: "grid",
                      placeItems: "center",
                      border: "1px solid",
                      borderColor: icon === key ? "primary.main" : "divider",
                      borderRadius: 1,
                      bgcolor: icon === key ? "primary.main" : "transparent",
                      color: icon === key ? "primary.contrastText" : "text.primary",
                      cursor: "pointer",
                    }}
                  >
                    <ActivityIcon icon={key} />
                  </Box>
                ))}
              </Box>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button fullWidth onClick={() => setStep(branch === "cardio" ? "cardio" : "mobility")}>
                {t("Назад", "Back")}
              </Button>
              <Button fullWidth variant="contained" onClick={submitCustom}>
                {t("Создать", "Create")}
              </Button>
            </Stack>
          </Stack>
        )}

        {step === "cardio" &&
          renderGrid(
            [
              ...CARDIO_KEYS.map((kind) => ({
                label: CARDIO_LABELS[kind],
                icon: CARDIO_ICONS[kind],
                onPick: () => onCreate("cardio", { cardioKind: kind }),
              })),
              ...cardioKinds.map((custom) => ({
                label: custom.name,
                icon: custom.icon,
                onPick: () => onCreate("cardio", { customKind: custom.name, icon: custom.icon }),
              })),
            ],
            close,
            TYPE_COLOR.cardio,
            {
              label: t("Свой вид", "Custom"),
              onClick: () => {
                setBranch("cardio");
                setStep("custom");
              },
            },
          )}

        {step === "mobility" &&
          renderGrid(
            [
              ...MOBILITY_KEYS.map((kind) => ({
                label: MOBILITY_LABELS[kind],
                icon: MOBILITY_ICONS[kind],
                onPick: () => onCreate("mobility", { mobilityKind: kind }),
              })),
              ...mobilityKinds.map((custom) => ({
                label: custom.name,
                icon: custom.icon,
                onPick: () => onCreate("mobility", { customKind: custom.name, icon: custom.icon }),
              })),
            ],
            close,
            TYPE_COLOR.mobility,
            {
              label: t("Свой вид", "Custom"),
              onClick: () => {
                setBranch("mobility");
                setStep("custom");
              },
            },
          )}

        {step === "recovery" && (
          <Stack spacing={1.5}>
            <Box sx={{ display: "flex", gap: 0.75, overflowX: "auto", pb: 0.5, mx: -0.5, px: 0.5 }}>
              {RECOVERY_CATEGORIES.map((cat) => (
                <Chip
                  key={cat.category}
                  label={cat.label}
                  onClick={() => setRecCategory(cat.category)}
                  color={recCategory === cat.category ? "primary" : "default"}
                  variant={recCategory === cat.category ? "filled" : "outlined"}
                  sx={{ flexShrink: 0 }}
                />
              ))}
            </Box>
            {renderGrid(
              proceduresOf(recCategory).map((proc) => ({
                label: proc.label,
                icon: proc.icon,
                onPick: () => onCreate("recovery", { recoveryType: proc.type }),
              })),
              close,
              TYPE_COLOR.recovery,
            )}
            <Button onClick={() => setStep("kind")}>{t("Назад", "Back")}</Button>
          </Stack>
        )}

        {step === "program" && activeProgram && (
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              {activeProgram.name} · {t("круг", "cycle")} {activeProgram.cycleNumber} · {t("веса подтянутся с прошлого раза", "weights carried over")}
            </Typography>
            {[...activeProgram.workouts]
              .sort((a, b) => a.order - b.order)
              .map((workout, index) => {
                const isNext = index === activeProgram.currentWorkoutIndex;
                return (
                  <Box
                    key={workout.id}
                    onClick={() => {
                      onStartProgram(activeProgram, index);
                      close();
                    }}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.25,
                      p: 1.25,
                      borderRadius: 2,
                      cursor: "pointer",
                      border: "1px solid",
                      borderColor: isNext ? "primary.main" : "divider",
                    }}
                  >
                    <Box
                      sx={{
                        width: 42,
                        height: 42,
                        borderRadius: 2,
                        flexShrink: 0,
                        display: "grid",
                        placeItems: "center",
                        color: "#f59e0b",
                        backgroundImage: `linear-gradient(135deg, ${alpha("#f59e0b", 0.28)}, ${alpha("#f59e0b", 0.08)})`,
                      }}
                    >
                      <FitnessCenterIcon fontSize="small" />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>
                          {workout.name}
                        </Typography>
                        {isNext && (
                          <Chip label={t("следующая", "next")} size="small" color="primary" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
                        )}
                      </Stack>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                        {workout.exercises.length === 0
                          ? t("Пусто — добавь упражнения", "Empty — add exercises")
                          : `${workout.exercises.length} ${t("упр.", "ex.")}`}
                      </Typography>
                    </Box>
                    <PlayArrowRoundedIcon sx={{ color: "primary.main" }} />
                  </Box>
                );
              })}
            <Button onClick={() => setStep("kind")} sx={{ mt: 0.5 }}>
              {t("Назад", "Back")}
            </Button>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Шапка мастера: назад + прогресс «N из total». */
function WizardHeader({ step, total, onBack }: { step: number; total: number; onBack: () => void }) {
  const t = useT();
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
      <IconButton onClick={onBack} edge="start" size="small" aria-label={t("Назад", "Back")}>
        <ArrowBackIcon fontSize="small" />
      </IconButton>
      <LinearProgress
        variant="determinate"
        value={(step / total) * 100}
        sx={{ flex: 1, height: 6, borderRadius: 999 }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
        {step} {t("из", "of")} {total}
      </Typography>
    </Stack>
  );
}

/**
 * Сетка выбора вида (кардио/мобилити/восстановление). Современные карточки
 * с плашкой-иконкой в цвет типа активности — единый язык с карточками «+».
 * `addTile` — опциональная пунктирная плитка «+ Свой вид» в конце сетки.
 */
function renderGrid(
  items: Array<{ label: string; icon: IconKey; onPick: () => void }>,
  close: () => void,
  color: string,
  addTile?: { label: string; onClick: () => void },
) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1 }}>
      {items.map((item) => (
        <Box
          key={item.label}
          onClick={() => {
            item.onPick();
            close();
          }}
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            p: 1.5,
            minHeight: 96,
            borderRadius: 2,
            cursor: "pointer",
            border: "1px solid",
            borderColor: alpha(color, 0.25),
            backgroundColor: "background.paper",
            backgroundImage: `linear-gradient(135deg, ${alpha(color, 0.1)}, transparent 72%)`,
          }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              flexShrink: 0,
              display: "grid",
              placeItems: "center",
              color,
              backgroundImage: `linear-gradient(135deg, ${alpha(color, 0.28)}, ${alpha(color, 0.08)})`,
            }}
          >
            <ActivityIcon icon={item.icon} />
          </Box>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 600, lineHeight: 1.25, mt: "auto" }}
          >
            {item.label}
          </Typography>
        </Box>
      ))}

      {addTile && (
        <Box
          onClick={addTile.onClick}
          sx={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: 0.5,
            p: 1.5,
            minHeight: 96,
            borderRadius: 2,
            cursor: "pointer",
            border: "1px dashed",
            borderColor: "divider",
            color: "text.secondary",
          }}
        >
          <AddRoundedIcon />
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            {addTile.label}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
