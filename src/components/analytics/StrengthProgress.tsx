import { tr } from "../../ui";
import { IconBadge, Tile, radius } from "../../ui";
import { CARD_IN } from "../../theme";
import { massToUnit, toUnit, unitLabel } from "../../lib/units";
import { useMemo, useState } from "react";
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
import { ExpandMore as ExpandMoreIcon } from "../../ui/icons";
import FitnessCenterOutlinedIcon from "@mui/icons-material/FitnessCenterOutlined";
import StatCard from "../StatCard";
import WeightRepsChart from "./WeightRepsChart";
import { addDays, formatDate, formatVolume, formatWeight, today } from "../../lib/format";
import { exercisePlateau, metricDelta, metricSeries, metricTrend, metricValue } from "../../lib/analytics";
import { L, useT } from "../../lib/i18n";
import type { CompareMode, ExerciseInsight, StrengthMetric, StrengthTrend } from "../../lib/analytics";
import type { Session } from "../../lib/types";
import { ink } from "../../lib/themeMode";

const RANGES: Array<{ key: string; label: string; days: number | null }> = [
  { key: "1m", get label() { return L("Месяц", "Month"); }, days: 30 },
  { key: "3m", get label() { return L("3 мес", "3 mo"); }, days: 90 },
  { key: "6m", get label() { return L("6 мес", "6 mo"); }, days: 180 },
  { key: "1y", get label() { return L("Год", "Year"); }, days: 365 },
  { key: "all", get label() { return L("Всё", "All"); }, days: null },
];

const METRICS: Array<{ key: StrengthMetric; label: string }> = [
  { key: "volume", get label() { return L("Тоннаж", "Tonnage"); } },
  { key: "weight", get label() { return L("Макс. вес", "Top weight"); } },
  { key: "e1rm", get label() { return L("Прогноз макс", "Est. max"); } },
];

const COMPARES: Array<{ key: CompareMode; label: string }> = [
  { key: "session", get label() { return L("К прошлой", "vs last"); } },
  { key: "period", get label() { return L("За период", "Over period"); } },
];

const TREND_LABEL: Record<StrengthTrend, string> = {
  get up() { return L("растёт", "rising"); },
  get flat() { return L("держится", "steady"); },
  get down() { return L("откат", "dropped"); },
  get insufficient() { return L("мало данных", "not enough data"); },
};

const PURPLE = ink("#a78bfa");

/** Цвет тренда: рост зелёный, откат — янтарь (не тревожно-красный), иначе серый. */
function trendColor(trend: StrengthTrend): string {
  if (trend === "up") return ink("#4ade80");
  if (trend === "down") return ink("#f59e0b");
  return ink("#94a3b3");
}

function fmtMetric(metric: StrengthMetric, value: number, kg: string): string {
  return metric === "volume" ? formatVolume(value) : `${Math.round(massToUnit(value))} ${kg}`;
}

function ExerciseRow({
  ex,
  sessions,
  metric,
  compare,
}: {
  ex: ExerciseInsight;
  sessions: Session[];
  metric: StrengthMetric;
  compare: CompareMode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState("3m");
  const plateau = exercisePlateau(sessions, ex.id);
  const kg = unitLabel();
  const metricLabel = METRICS.find((m) => m.key === metric)!.label;

  const days = RANGES.find((r) => r.key === range)?.days ?? null;
  const cutoff = days ? addDays(today(), -days) : "0000-00-00";
  const inRange = ex.points.filter((p) => p.date >= cutoff);
  // Макс. вес — график «вес + размер точки = повторы»; тоннаж/прогноз — линия
  // (тоннаж уже агрегирован по неделям в metricSeries).
  const weightPoints = inRange
    .filter((p) => p.weight != null)
    .map((p) => ({ label: formatDate(p.date), weight: toUnit(p.weight as number), reps: p.reps ?? 0 }));

  // Для карточки: значения диапазона (вес — в кг, перевод в формате).
  const rangeSeries =
    metric === "weight"
      ? inRange.filter((p) => p.weight != null).map((p) => ({ date: p.date, v: p.weight as number }))
      : metricSeries(inRange, metric).map((x) => ({ date: x.date, v: x.v }));
  const rangeValues = rangeSeries.map((x) => x.v);
  const rangeLabels = rangeSeries.map((x) => formatDate(x.date));
  const rangeLast = rangeValues.length ? rangeValues[rangeValues.length - 1] : null;
  const rangeDelta =
    rangeValues.length >= 2 && rangeValues[0] > 0
      ? ((rangeValues[rangeValues.length - 1] - rangeValues[0]) / rangeValues[0]) * 100
      : null;

  // Текущее значение метрики — последняя точка с данными.
  const latest = [...ex.points].reverse().map((p) => metricValue(p, metric)).find((v) => v != null) ?? null;

  const delta = metricDelta(ex.points, metric, compare);
  const trend: StrengthTrend =
    compare === "period"
      ? metricTrend(ex.points, metric)
      : delta == null
        ? "insufficient"
        : delta > 2
          ? "up"
          : delta < -2
            ? "down"
            : "flat";
  const tc = trendColor(trend);
  const deltaText =
    delta != null && trend !== "insufficient"
      ? ` ${delta > 0 ? "+" : ""}${Math.round(delta)}%`
      : "";

  return (
    <Box sx={{ borderRadius: radius.card, animation: CARD_IN, overflow: "hidden", border: "1px solid", borderColor: alpha(PURPLE, 0.22) }}>
      <Box
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1.25, cursor: "pointer" }}
      >
        <IconBadge color={PURPLE}>
          <FitnessCenterOutlinedIcon fontSize="small" />
        </IconBadge>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
            {ex.name}
          </Typography>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5, mt: 0.25 }}>
            <Typography variant="caption" color="text.secondary">
              {metricLabel} {latest != null ? fmtMetric(metric, latest, kg) : "—"}
            </Typography>
            <Chip
              size="small"
              variant="outlined"
              label={`${TREND_LABEL[trend]}${deltaText}`}
              sx={{ height: 20, fontSize: 11.5, color: tc, borderColor: alpha(tc, 0.4) }}
            />
            {plateau.currentWeeks >= 3 && (
              <Chip
                size="small"
                variant="outlined"
                label={`${t("плато", "plateau")} ${plateau.currentWeeks} ${t("нед", "wk")}`}
                sx={{ height: 20, fontSize: 11.5, color: ink("#f59e0b"), borderColor: alpha(ink("#f59e0b"), 0.4) }}
              />
            )}
          </Stack>
        </Box>
        <ExpandMoreIcon
          sx={{
            color: "text.secondary",
            transition: tr("transform"),
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </Box>

      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: 1.5, pb: 1.5 }}>
          <StatCard
            label={metric === "volume" ? t("Тоннаж за неделю", "Weekly tonnage") : metricLabel}
            value={rangeLast}
            format={(v) => fmtMetric(metric, v, kg)}
            delta={rangeDelta}
            values={rangeValues}
            labels={rangeLabels}
            firstLabel={rangeLabels[0]}
            lastLabel={rangeLabels[rangeLabels.length - 1]}
            ranges={RANGES}
            range={range}
            onRange={setRange}
            custom={
              metric === "weight" ? (
                weightPoints.length > 0 ? (
                  <WeightRepsChart points={weightPoints} />
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                    {t("В этом диапазоне нет данных.", "No data in this range.")}
                  </Typography>
                )
              ) : undefined
            }
          />

          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1, mt: 1.5 }}>
            <Metric label={t("Лучший вес", "Best weight")} value={`${formatWeight(ex.bestWeight)} ${kg}`} />
            <Metric label={t("Лучшие повторы", "Best reps")} value={`${ex.bestReps}`} />
            <Metric label={t("Лучший тоннаж", "Best tonnage")} value={formatVolume(ex.bestVolume)} />
            <Metric label={t("Прогноз макс", "Est. max")} value={`${Math.round(massToUnit(ex.bestE1rm))} ${kg}`} />
            <Metric label={t("Тренировок", "Workouts")} value={`${ex.sessions}`} />
            <Metric label={t("Последний рекорд", "Last record")} value={formatDate(ex.lastPrDate)} />
            {plateau.currentWeeks > 0 && (
              <Metric label={t("Плато сейчас", "Current plateau")} value={`${plateau.currentWeeks} ${t("нед", "wk")}`} />
            )}
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Tile>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Tile>
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
  const [metric, setMetric] = useState<StrengthMetric>("volume");
  const [compare, setCompare] = useState<CompareMode>("session");

  // Растущие сверху, откаты ниже, «мало данных» — в конце.
  const sorted = useMemo(() => {
    return [...exercises].sort((a, b) => {
      const da = metricDelta(a.points, metric, compare);
      const db = metricDelta(b.points, metric, compare);
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return db - da;
    });
  }, [exercises, metric, compare]);

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
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
        <ToggleButtonGroup value={metric} exclusive size="small" onChange={(_, v) => v && setMetric(v)}>
          {METRICS.map((m) => (
            <ToggleButton key={m.key} value={m.key} sx={{ fontSize: 12, py: 0.5, px: 1.5, minHeight: 36, textTransform: "none" }}>
              {m.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <ToggleButtonGroup value={compare} exclusive size="small" onChange={(_, v) => v && setCompare(v)}>
          {COMPARES.map((c) => (
            <ToggleButton key={c.key} value={c.key} sx={{ fontSize: 12, py: 0.5, px: 1.5, minHeight: 36, textTransform: "none" }}>
              {c.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      {sorted.map((ex) => (
        <ExerciseRow key={ex.id} ex={ex} sessions={sessions} metric={metric} compare={compare} />
      ))}
    </Stack>
  );
}
