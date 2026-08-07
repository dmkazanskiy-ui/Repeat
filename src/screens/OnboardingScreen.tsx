import { useState } from "react";
import { Box, Button, Stack, Typography, useTheme } from "@mui/material";
import { L } from "../lib/i18n";
import { alpha } from "@mui/material/styles";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import MonitorWeightOutlinedIcon from "@mui/icons-material/MonitorWeightOutlined";
import RepeatRoundedIcon from "@mui/icons-material/RepeatRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import RadioButtonUncheckedRoundedIcon from "@mui/icons-material/RadioButtonUncheckedRounded";
import { ActivityIcon } from "../lib/icons";
import { areaPath, smoothPath } from "../lib/chart";
import type { Pt } from "../lib/chart";
import { FOCUS_GOALS } from "../lib/workoutBuilder";
import type { FocusGoal } from "../lib/workoutBuilder";

interface Props {
  focusGoal: FocusGoal | null;
  onPickGoal: (goal: FocusGoal) => void;
  onDone: () => void;
}

/** Пример карточки тренировки — наш реальный визуал (силовая, фиолетовая). */
function SampleCard() {
  const color = "#a78bfa";
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        p: 1.75,
        borderRadius: 2,
        border: "1px solid",
        borderColor: alpha(color, 0.5),
        backgroundColor: "background.paper",
        backgroundImage: `linear-gradient(100deg, ${alpha(color, 0.11)}, transparent 78%)`,
        width: "100%",
        maxWidth: 320,
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
        <ActivityIcon icon="gym" fontSize="medium" />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box
          component="span"
          sx={{
            display: "inline-flex",
            height: 20,
            px: 0.9,
            mb: 0.5,
            borderRadius: 1,
            border: "1px solid",
            borderColor: alpha(color, 0.5),
            color,
            fontSize: 11,
            fontWeight: 600,
            alignItems: "center",
          }}
        >
          {L("Силовая", "Strength")}
        </Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>
          {L("День A · грудь / спина", "Day A · chest / back")}
        </Typography>
        <Stack direction="row" spacing={1.5} sx={{ mt: 0.75, color: "text.secondary" }}>
          <Stack direction="row" spacing={0.4} sx={{ alignItems: "center" }}>
            <AccessTimeRoundedIcon sx={{ fontSize: 14, opacity: 0.75 }} />
            <Typography variant="caption">{L("48 мин", "48 min")}</Typography>
          </Stack>
          <Stack direction="row" spacing={0.4} sx={{ alignItems: "center" }}>
            <MonitorWeightOutlinedIcon sx={{ fontSize: 14, opacity: 0.75 }} />
            <Typography variant="caption">{L("8 200 кг", "8,200 kg")}</Typography>
          </Stack>
          <Stack direction="row" spacing={0.4} sx={{ alignItems: "center" }}>
            <RepeatRoundedIcon sx={{ fontSize: 14, opacity: 0.75 }} />
            <Typography variant="caption">{L("18 подх.", "18 sets")}</Typography>
          </Stack>
        </Stack>
      </Box>
      <Box
        sx={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          bgcolor: alpha(color, 0.16),
          border: "1px solid",
          borderColor: alpha(color, 0.45),
          display: "grid",
          placeItems: "center",
        }}
      >
        <CheckRoundedIcon sx={{ color, fontSize: 15 }} />
      </Box>
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
    get title() { return L("Всё готово!", "You're all set!"); },
    get sub() { return L("Погнали — добавь первую тренировку через «+».", "Let's go — add your first workout with the “+”."); },
  },
];

export default function OnboardingScreen({ focusGoal, onPickGoal, onDone }: Props) {
  const [slide, setSlide] = useState(0);
  const last = slide === SLIDES.length - 1;
  const info = SLIDES[slide];

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
          <Button size="small" color="inherit" sx={{ color: "text.secondary" }} onClick={onDone}>
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
                    onClick={() => onPickGoal(g.goal)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      p: 1.5,
                      borderRadius: 2,
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
                        borderRadius: 2,
                        flexShrink: 0,
                        display: "grid",
                        placeItems: "center",
                        color: active ? "primary.main" : g.color,
                        backgroundImage: `linear-gradient(135deg, ${alpha(g.color, 0.28)}, ${alpha(g.color, 0.08)})`,
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
          {slide === 3 && (
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

      {/* Точки */}
      <Stack direction="row" spacing={1} sx={{ justifyContent: "center", mb: 2 }}>
        {SLIDES.map((_, i) => (
          <Box
            key={i}
            sx={{
              width: i === slide ? 20 : 8,
              height: 8,
              borderRadius: 999,
              bgcolor: i === slide ? "primary.main" : "divider",
              transition: "width .2s",
            }}
          />
        ))}
      </Stack>

      <Button
        fullWidth
        variant="contained"
        size="large"
        onClick={() => (last ? onDone() : setSlide((s) => s + 1))}
      >
        {last ? L("Начать", "Start") : L("Продолжить", "Continue")}
      </Button>
    </Box>
  );
}
