import { useState } from "react";
import {
  Box,
  Chip,
  Collapse,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FitnessCenterOutlinedIcon from "@mui/icons-material/FitnessCenterOutlined";
import MiniChart from "../MiniChart";
import { addDays, formatDate, formatVolume, today } from "../../lib/format";
import { exercisePlateau } from "../../lib/analytics";
import { L, useT } from "../../lib/i18n";
import type { ExerciseInsight, StrengthTrend } from "../../lib/analytics";
import type { Session } from "../../lib/types";

const RANGES: Array<{ key: string; label: string; days: number | null }> = [
  { key: "1m", get label() { return L("Месяц", "Month"); }, days: 30 },
  { key: "3m", get label() { return L("3 мес", "3 mo"); }, days: 90 },
  { key: "6m", get label() { return L("6 мес", "6 mo"); }, days: 180 },
  { key: "1y", get label() { return L("Год", "Year"); }, days: 365 },
  { key: "all", get label() { return L("Всё", "All"); }, days: null },
];

const TREND_LABEL: Record<StrengthTrend, string> = {
  get up() { return L("растёт", "rising"); },
  get flat() { return L("стабилен", "steady"); },
  get down() { return L("снижается", "falling"); },
  get insufficient() { return L("мало данных", "not enough data"); },
};

const PURPLE = "#a78bfa";

function ExerciseRow({ ex, sessions }: { ex: ExerciseInsight; sessions: Session[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState("3m");
  const plateau = exercisePlateau(sessions, ex.id);

  const days = RANGES.find((r) => r.key === range)?.days ?? null;
  const cutoff = days ? addDays(today(), -days) : "0000-00-00";
  const chartPoints = ex.points
    .filter((p) => p.e1rm != null && p.date >= cutoff)
    .map((p) => ({ label: formatDate(p.date), value: p.e1rm as number }));
  const trendColor = ex.trend === "up" ? "#4ade80" : "#94a3b3";

  return (
    <Box sx={{ borderRadius: 2, overflow: "hidden", border: "1px solid", borderColor: alpha(PURPLE, 0.22) }}>
      <Box
        onClick={() => setOpen((v) => !v)}
        sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1.25, cursor: "pointer" }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            color: PURPLE,
            backgroundImage: `linear-gradient(135deg, ${alpha(PURPLE, 0.28)}, ${alpha(PURPLE, 0.08)})`,
          }}
        >
          <FitnessCenterOutlinedIcon fontSize="small" />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
            {ex.name}
          </Typography>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5, mt: 0.25 }}>
            <Typography variant="caption" color="text.secondary">
              {t("Лучший e1RM", "Best e1RM")} {Math.round(ex.bestE1rm)} {t("кг", "kg")}
            </Typography>
            <Chip
              size="small"
              variant="outlined"
              label={`e1RM ${TREND_LABEL[ex.trend]}`}
              sx={{ height: 20, fontSize: 10.5, color: trendColor, borderColor: alpha(trendColor, 0.4) }}
            />
            {plateau.currentWeeks >= 3 && (
              <Chip
                size="small"
                variant="outlined"
                label={`${t("плато", "plateau")} ${plateau.currentWeeks} ${t("нед", "wk")}`}
                sx={{ height: 20, fontSize: 10.5, color: "#f59e0b", borderColor: alpha("#f59e0b", 0.4) }}
              />
            )}
          </Stack>
        </Box>
        <ExpandMoreIcon
          sx={{
            color: "text.secondary",
            transition: "transform .2s",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </Box>

      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: 1.5, pb: 1.5 }}>
          <ToggleButtonGroup
            value={range}
            exclusive
            size="small"
            fullWidth
            onChange={(_, v) => v && setRange(v)}
            sx={{ mb: 1.5 }}
          >
            {RANGES.map((r) => (
              <ToggleButton key={r.key} value={r.key} sx={{ fontSize: 12, py: 0.5 }}>
                {r.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {chartPoints.length > 0 ? (
            <MiniChart points={chartPoints} format={(v) => `${Math.round(v)}`} />
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
              {t("В этом диапазоне нет данных с e1RM.", "No e1RM data in this range.")}
            </Typography>
          )}

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 1,
              mt: 1.5,
            }}
          >
            <Metric label={t("Лучший вес", "Best weight")} value={`${ex.bestWeight} ${t("кг", "kg")}`} />
            <Metric label={t("Лучшие повторы", "Best reps")} value={`${ex.bestReps}`} />
            <Metric label={t("Лучший объём", "Best volume")} value={formatVolume(ex.bestVolume)} />
            <Metric label={t("Тренировок", "Workouts")} value={`${ex.sessions}`} />
            <Metric label={t("Последний рекорд", "Last record")} value={formatDate(ex.lastPrDate)} />
            {plateau.currentWeeks > 0 && (
              <Metric label={t("Плато сейчас", "Current plateau")} value={`${plateau.currentWeeks} ${t("нед", "wk")}`} />
            )}
            {plateau.longestWeeks > 0 && plateau.longestFrom && (
              <Metric
                label={t("Самое долгое плато", "Longest plateau")}
                value={`${plateau.longestWeeks} ${t("нед", "wk")} · ${formatDate(plateau.longestFrom)}`}
              />
            )}
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: "action.hover" }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  );
}

export default function StrengthProgress({
  exercises,
  sessions,
}: {
  exercises: ExerciseInsight[];
  sessions: Session[];
}) {
  const t = useT();
  if (exercises.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {t(
          "Занеси несколько силовых с весом и повторами — здесь появится прогресс по каждому упражнению.",
          "Log a few strength workouts with weight and reps — per-exercise progress will show here.",
        )}
      </Typography>
    );
  }
  return (
    <Stack spacing={1.25}>
      {exercises.map((ex) => (
        <ExerciseRow key={ex.id} ex={ex} sessions={sessions} />
      ))}
    </Stack>
  );
}
