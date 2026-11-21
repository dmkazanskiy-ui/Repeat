import { IconBadge, radius } from "../ui";
import { CARD_IN } from "../theme";
import { useState } from "react";
import { Box, Button, Checkbox, Stack, Typography, useTheme } from "@mui/material";
import { L } from "../lib/i18n";
import { alpha } from "@mui/material/styles";
import { CheckRounded as CheckRoundedIcon } from "../ui/icons";
import { CheckCircleRounded as CheckCircleRoundedIcon } from "../ui/icons";
import { RadioButtonUncheckedRounded as RadioButtonUncheckedRoundedIcon } from "../ui/icons";
import { ActivityIcon } from "../lib/icons";
import { areaPath, smoothPath } from "../lib/chart";
import type { Pt } from "../lib/chart";
import { FOCUS_GOALS } from "../lib/workoutBuilder";
import type { FocusGoal } from "../lib/workoutBuilder";
import { CONSENT_URL, PRIVACY_URL } from "../lib/consent";
import StepProgress from "../ui/StepProgress";
import DocLink from "../components/DocLink";
import { ink } from "../lib/themeMode";

interface Props {
  focusGoal: FocusGoal | null;
  onPickGoal: (goal: FocusGoal) => void;
  /** Вызывается только после согласия на обработку данных. */
  onDone: () => void;
  /** Обучение уже пройдено раньше — показать только экран согласия. */
  consentOnly?: boolean;
}

/**
 * Согласие на обработку данных. Галочка не стоит заранее; ссылка ведёт на
 * отдельный документ согласия (так требует 152-ФЗ с 01.09.2025), политика —
 * отдельной ссылкой.
 */
function ConsentCheck({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const doc = (path: string, label: string) => <DocLink href={path}>{label}</DocLink>;
  return (
    <Box
      component="label"
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: 0.5,
        width: "100%",
        maxWidth: 420,
        p: 1.5,
        pr: 1.5,
        borderRadius: radius.tile,
        border: "1px solid",
        borderColor: checked ? "primary.main" : "divider",
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <Checkbox
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        sx={{ mt: -0.5 }}
        slotProps={{ input: { "aria-describedby": "consent-text" } }}
      />
      <Typography id="consent-text" variant="body2" color="text.secondary" sx={{ pt: 0.25 }}>
        {L("Я даю ", "I give my ")}
        {doc(CONSENT_URL, L("согласие на обработку персональных данных", "consent to the processing of personal data"))}
        {L(
          ", включая сведения о здоровье (вес, замеры, пульс, самочувствие), и ознакомлен с ",
          ", including health data (weight, measurements, heart rate, wellbeing), and have read the ",
        )}
        {doc(PRIVACY_URL, L("политикой обработки данных", "privacy policy"))}
      </Typography>
    </Box>
  );
}

/**
 * Пример — кусочек настоящего редактора: упражнение и подходы с плитками
 * «сделано». Третий подход отмечается сам — так видно, как это работает.
 */
function SampleCard() {
  const color = ink("#a78bfa");
  const theme = useTheme();
  const onColor = theme.palette.getContrastText(color);
  const field = {
    flex: 1,
    height: 40,
    px: 1.25,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: "12px",
    bgcolor: "action.hover",
    fontSize: 15,
    fontVariantNumeric: "tabular-nums",
  } as const;
  const sets = [
    { w: 80, r: 8, done: true },
    { w: 85, r: 6, done: true },
    { w: 85, r: 6, done: false },
  ];
  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: 340,
        p: 2,
        textAlign: "left",
        borderRadius: radius.card,
        animation: CARD_IN,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: 1.5 }}>
        <IconBadge color={color} size={32}>
          <ActivityIcon icon="gym" fontSize="small" />
        </IconBadge>
        <Typography sx={{ fontSize: 15, fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>
          {L("Жим штанги лёжа", "Barbell bench press")}
        </Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{L("1 660 кг", "1,660 kg")}</Typography>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mb: 0.5 }}>
        <Box sx={{ width: 20 }} />
        <Typography sx={{ flex: 1, fontSize: 11, color: "text.secondary" }}>{L("Вес", "Weight")}</Typography>
        <Typography sx={{ flex: 1, fontSize: 11, color: "text.secondary" }}>{L("Повторы", "Reps")}</Typography>
        <Box sx={{ width: 40 }} />
      </Stack>
      <Stack spacing={0.75}>
        {sets.map((set, i) => {
          const auto = !set.done; // этот подход «отмечается» сам
          return (
            <Stack key={i} direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography sx={{ width: 20, textAlign: "center", fontSize: 13, color: "text.secondary" }}>{i + 1}</Typography>
              <Box sx={field}>
                {set.w}
                <Box component="span" sx={{ fontSize: 12, color: "text.secondary" }}>
                  {L("кг", "kg")}
                </Box>
              </Box>
              <Box sx={field}>{set.r}</Box>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  flex: "none",
                  borderRadius: "12px",
                  display: "grid",
                  placeItems: "center",
                  bgcolor: set.done ? color : "action.hover",
                  color: set.done ? onColor : "text.disabled",
                  ...(auto && {
                    "@keyframes onb-tick": {
                      "0%, 40%": { backgroundColor: theme.palette.action.hover, color: theme.palette.text.disabled, transform: "scale(1)" },
                      "48%": { transform: "scale(0.9)" },
                      "60%, 100%": { backgroundColor: color, color: onColor, transform: "scale(1)" },
                    },
                    animation: "onb-tick 2.6s cubic-bezier(.34,1.56,.64,1) 0.6s forwards",
                  }),
                }}
              >
                <CheckRoundedIcon sx={{ fontSize: 22 }} />
              </Box>
            </Stack>
          );
        })}
      </Stack>
    </Box>
  );
}

/** Пример графика прогресса — растущая линия e1RM. */
function SampleChart() {
  const theme = useTheme();
  const green = theme.palette.primary.main;
  const vals = [30, 33, 31, 38, 36, 42, 41, 47, 52];
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const span = max - min || 1;
  const pts: Pt[] = vals.map((v, i) => [
    (i / (vals.length - 1)) * 100,
    46 - ((v - min) / span) * 38,
  ]);
  return (
    <Box sx={{ width: "100%", maxWidth: 320 }}>
      <Typography variant="caption" color="text.secondary">
        {L("e1RM · жим лёжа", "e1RM · bench press")}
      </Typography>
      <Typography sx={{ fontSize: 22, fontWeight: 800, mb: 1 }}>
        {L("52 кг", "52 kg")} <Box component="span" sx={{ color: "primary.main", fontSize: 14, fontWeight: 700 }}>{L("↗ растёт", "↗ rising")}</Box>
      </Typography>
      <Box component="svg" viewBox="0 0 100 50" preserveAspectRatio="none" sx={{ width: "100%", height: 100, display: "block" }}>
        <defs>
          <linearGradient id="onb-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={green} stopOpacity={0.28} />
            <stop offset="100%" stopColor={green} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath(pts, 50, 0, 100)} fill="url(#onb-area)" />
        <path d={smoothPath(pts)} fill="none" stroke={green} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </Box>
    </Box>
  );
}

const SLIDES = [
  {
    get title() { return L("Записывай тренировки", "Log your workouts"); },
    get sub() { return L("Силовые, кардио, мобилити и восстановление — каждый подход под контролем.", "Strength, cardio, mobility and recovery — every set tracked."); },
  },
  {
    get title() { return L("Следи за прогрессом", "Track your progress"); },
    get sub() { return L("Аналитика: сила, объём, мышцы и баланс восстановления.", "Analytics: strength, volume, muscles and recovery balance."); },
  },
  {
    get title() { return L("Выбери свою цель", "Pick your goal"); },
    get sub() { return L("Под неё «Тренер» будет подбирать тренировки. Позже можно поменять в профиле.", "The coach tailors workouts to it. You can change it later in your profile."); },
  },
  {
    get title() { return L("Всё готово", "You're all set"); },
    get sub() { return L("Погнали — добавь первую тренировку через «+».", "Let's go — add your first workout with the “+”."); },
  },
];

export default function OnboardingScreen({ focusGoal, onPickGoal, onDone, consentOnly = false }: Props) {
  const [slide, setSlide] = useState(consentOnly ? SLIDES.length - 1 : 0);
  const [agreed, setAgreed] = useState(false);
  const last = slide === SLIDES.length - 1;
  const info = consentOnly
    ? {
        title: L("Согласие на обработку данных", "Consent to data processing"),
        sub: L(
          "История теперь синхронизируется между устройствами через сервер Repeat. Чтобы хранить её там, нужно твоё согласие. Удалить всё можно в любой момент в профиле.",
          "Your history now syncs between devices via the Repeat server. To store it there we need your consent. You can delete everything anytime in your profile.",
        ),
      }
    : SLIDES[slide];

  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        bgcolor: "background.default",
        display: "flex",
        flexDirection: "column",
        px: 3,
        py: 2,
        overflowY: "auto",
      }}
    >
      {/* Пропустить */}
      <Stack direction="row" sx={{ justifyContent: "flex-end", minHeight: 36 }}>
        {!last && (
          <Button size="small" color="inherit" sx={{ color: "text.secondary" }} onClick={() => setSlide(SLIDES.length - 1)}>
            {L("Пропустить", "Skip")}
          </Button>
        )}
      </Stack>

      {/* Контент слайда */}
      <Stack spacing={2} sx={{ flex: 1, justifyContent: "center", alignItems: "center", textAlign: "center", py: 2 }}>
        <Box sx={{ maxWidth: 420 }}>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
            {info.title}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {info.sub}
          </Typography>
        </Box>

        <Box sx={{ width: "100%", display: "flex", justifyContent: "center", mt: 2 }}>
          {slide === 0 && <SampleCard />}
          {slide === 1 && <SampleChart />}
          {slide === 2 && (
            <Stack spacing={1} sx={{ width: "100%", maxWidth: 380 }}>
              {FOCUS_GOALS.map((g) => {
                const active = focusGoal === g.goal;
                return (
                  <Box
                    key={g.goal}
                    role="button"
                    tabIndex={0}
                    onClick={() => onPickGoal(g.goal)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      p: 2,
                      borderRadius: radius.card, animation: CARD_IN,
                      cursor: "pointer",
                      textAlign: "left",
                      border: "1px solid",
                      borderColor: active ? "primary.main" : "divider",
                      bgcolor: active ? "rgba(74,222,128,0.06)" : "transparent",
                    }}
                  >
                    <Box
                      sx={{
                        width: 42,
                        height: 42,
                        borderRadius: radius.icon,
                        flexShrink: 0,
                        display: "grid",
                        placeItems: "center",
                        color: active ? "primary.main" : g.color,
                        bgcolor: alpha(g.color, 0.14),
                      }}
                    >
                      <ActivityIcon icon={g.icon} />
                    </Box>
                    <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 600 }}>
                      {g.label}
                    </Typography>
                    {active ? (
                      <CheckCircleRoundedIcon sx={{ color: "primary.main" }} />
                    ) : (
                      <RadioButtonUncheckedRoundedIcon sx={{ color: "text.disabled" }} />
                    )}
                  </Box>
                );
              })}
            </Stack>
          )}
          {slide === 3 && !consentOnly && (
            <Box
              sx={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                bgcolor: "primary.main",
                color: "primary.contrastText",
                display: "grid",
                placeItems: "center",
                boxShadow: "0 0 40px rgba(74,222,128,0.4)",
              }}
            >
              <CheckRoundedIcon sx={{ fontSize: 52 }} />
            </Box>
          )}
        </Box>
      </Stack>

      {last && (
        <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
          <ConsentCheck checked={agreed} onChange={setAgreed} />
        </Box>
      )}

      {/* Шаги — Step progress: линия доезжает, пройденные шаги с галочкой. */}
      {!consentOnly && (
        <Box sx={{ mb: 3 }}>
          <StepProgress steps={[L("Запись", "Log"), L("Прогресс", "Progress"), L("Цель", "Goal"), L("Старт", "Start")]} current={slide} />
        </Box>
      )}

      <Stack direction="row" spacing={1.25}>
        {slide > 0 && !consentOnly && (
          <Button
            size="large"
            onClick={() => setSlide((s) => s - 1)}
            sx={{ flex: 1, height: 48, borderRadius: radius.tile, bgcolor: "action.hover", color: "text.primary", "&:hover": { bgcolor: "action.selected" } }}
          >
            {L("Назад", "Back")}
          </Button>
        )}
        <Button
          variant="contained"
          size="large"
          disabled={last && !agreed}
          onClick={() => (last ? onDone() : setSlide((s) => s + 1))}
          sx={{ flex: slide > 0 && !consentOnly ? 1.4 : 1, height: 48, borderRadius: radius.tile }}
        >
          {last ? L("Запустить", "Launch") : L("Продолжить", "Continue")}
        </Button>
      </Stack>
    </Box>
  );
}
