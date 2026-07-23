import { useState } from "react";
import {
  Box,
  Collapse,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import MiniChart from "../MiniChart";
import { addDays, formatDate, formatVolume, today } from "../../lib/format";
import type { ExerciseInsight, StrengthTrend } from "../../lib/analytics";

const RANGES: Array<{ key: string; label: string; days: number | null }> = [
  { key: "1m", label: "Месяц", days: 30 },
  { key: "3m", label: "3 мес", days: 90 },
  { key: "6m", label: "6 мес", days: 180 },
  { key: "1y", label: "Год", days: 365 },
  { key: "all", label: "Всё", days: null },
];

const TREND_LABEL: Record<StrengthTrend, string> = {
  up: "e1RM растёт",
  flat: "e1RM стабилен",
  down: "e1RM снижается",
  insufficient: "данных пока мало для тренда",
};

function ExerciseRow({ ex }: { ex: ExerciseInsight }) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState("3m");

  const days = RANGES.find((r) => r.key === range)?.days ?? null;
  const cutoff = days ? addDays(today(), -days) : "0000-00-00";
  const chartPoints = ex.points
    .filter((p) => p.e1rm != null && p.date >= cutoff)
    .map((p) => ({ label: formatDate(p.date), value: p.e1rm as number }));

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden" }}>
      <Box
        onClick={() => setOpen((v) => !v)}
        sx={{ p: 1.5, display: "flex", alignItems: "center", cursor: "pointer" }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap>
            {ex.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Лучший e1RM {Math.round(ex.bestE1rm)} кг · {TREND_LABEL[ex.trend]}
          </Typography>
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
              В этом диапазоне нет данных с e1RM.
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
            <Metric label="Лучший вес" value={`${ex.bestWeight} кг`} />
            <Metric label="Лучшие повторы" value={`${ex.bestReps}`} />
            <Metric label="Лучший объём" value={formatVolume(ex.bestVolume)} />
            <Metric label="Тренировок" value={`${ex.sessions}`} />
            <Metric label="Последний рекорд" value={formatDate(ex.lastPrDate)} />
          </Box>
        </Box>
      </Collapse>
    </Paper>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Box>
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
}: {
  exercises: ExerciseInsight[];
}) {
  if (exercises.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Занеси несколько силовых с весом и повторами — здесь появится прогресс по
        каждому упражнению.
      </Typography>
    );
  }
  return (
    <Stack spacing={1}>
      {exercises.map((ex) => (
        <ExerciseRow key={ex.id} ex={ex} />
      ))}
    </Stack>
  );
}
