import { Card, introActive, motion, radius, tr } from "../../ui";
import { useState } from "react";
import { Box, Typography } from "@mui/material";
import { alpha, keyframes, useTheme } from "@mui/material/styles";
import NumberTicker from "../NumberTicker";
import { Tile as UiTile } from "../../ui";
import { bucketKey, compareMetric, series } from "../../lib/analytics";
import type { AnalyticsPeriod, MetricKey } from "../../lib/analytics";
import { CHART_METRICS, KPI_METRICS, METRIC_META, formatPercent } from "../../lib/metricMeta";
import { today } from "../../lib/format";
import { useT } from "../../lib/i18n";
import type { Session } from "../../lib/types";

// Входная анимация — только при первом открытии приложения (introActive):
// плитки проявляются лесенкой, столбики вырастают. При смене метрики или
// периода ничего не пересоздаётся — столбики плавно меняют высоту.
const itemIn = keyframes`
  from { opacity: 0; transform: translateY(6px); }
`;
const barGrow = keyframes`
  from { transform: scaleY(0); }
  to   { transform: scaleY(1); }
`;
const appear = (i: number) =>
  introActive() ? { animation: `${itemIn} 300ms ${motion.easeOut} ${Math.min(i, 6) * 30}ms both` } : {};

interface Props {
  sessions: Session[];
  period: AnalyticsPeriod;
  metric: MetricKey;
  onMetric: (m: MetricKey) => void;
  labelOf: (dateKey: string) => string;
  avgPerDay: number;
}

/**
 * «Обзор» в аналитике: плитки с цифрами периода и столбчатый график выбранной
 * метрики. Столбики нейтральные, зелёный — один: текущий день/неделя или тот,
 * на который нажали. Метрику графика выбирают тапом по плитке.
 */
export default function OverviewCard({
  sessions,
  period,
  metric,
  onMetric,
  labelOf,
  avgPerDay,
}: Props) {
  const t = useT();
  return (
    <Card sx={{ mb: 1.5 }}>

      <Bars
        sessions={sessions}
        period={period}
        metric={metric}
        labelOf={labelOf}
        index={1}
      />
      {avgPerDay > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, px: 0.5 }}>
          {t("В среднем", "Avg")} {METRIC_META[metric].format(avgPerDay)} {t("за активный день", "per active day")}
        </Typography>
      )}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1, mt: 1.5 }}>
        {KPI_METRICS.map((m, i) => (
          <Tile
            key={m}
            metric={m}
            sessions={sessions}
            period={period}
            selected={m === metric}
            onSelect={CHART_METRICS.includes(m) ? () => onMetric(m) : undefined}
            index={i + 2}
          />
        ))}
      </Box>

    </Card>
  );
}

function Tile({
  metric,
  sessions,
  period,
  selected,
  onSelect,
  index,
}: {
  metric: MetricKey;
  sessions: Session[];
  period: AnalyticsPeriod;
  selected: boolean;
  onSelect?: () => void;
  index: number;
}) {
  const meta = METRIC_META[metric];
  const { current, percent, trend } = compareMetric(sessions, period, metric);
  const rounded = percent == null ? 0 : Math.round(percent);
  const showDelta = current > 0 && percent != null && rounded !== 0;
  return (
    <UiTile
      label={meta.label}
      selected={selected}
      onClick={onSelect}
      sx={appear(index)}
      value={
        <Box component="span" sx={{ color: current ? "text.primary" : "text.disabled" }}>
          <NumberTicker value={current} format={meta.format} />
        </Box>
      }
      aside={
        showDelta ? (
          <Typography component="span" sx={{ fontSize: 11, fontWeight: 600, color: trend === "up" ? "primary.main" : "text.secondary" }}>
            {formatPercent(percent).replace(" ", "")}
          </Typography>
        ) : undefined
      }
    />
  );
}

function Bars({
  sessions,
  period,
  metric,
  labelOf,
  index,
}: {
  sessions: Session[];
  period: AnalyticsPeriod;
  metric: MetricKey;
  labelOf: (dateKey: string) => string;
  index: number;
}) {
  const theme = useTheme();
  const points = series(sessions, period, metric);
  const nowKey = bucketKey(today(), period.aggregation);
  const nowIdx = points.findIndex((p) => p.date === nowKey);
  // Выбранный тапом столбик сбрасывается при смене метрики или периода.
  const sig = `${metric}|${period.startDate}|${period.endDate}`;
  const [pickedState, setPickedState] = useState<{ sig: string; i: number } | null>(null);
  const picked = pickedState?.sig === sig ? pickedState.i : null;
  const setPicked = (i: number) => setPickedState({ sig, i });
  const [intro] = useState(introActive);
  if (points.length === 0) return null;

  const max = Math.max(...points.map((p) => p.value), 1);
  // По умолчанию зелёный — текущий день/неделя; в прошлом периоде — лучший.
  const best = points.findIndex((p) => p.value === max);
  const hi = picked ?? (nowIdx >= 0 ? nowIdx : Math.max(best, 0));
  const n = points.length;
  const showLabels = n <= 8;
  const meta = METRIC_META[metric];
  const grey = alpha(theme.palette.text.primary, theme.palette.mode === "dark" ? 0.16 : 0.12);

  return (
    <Box sx={{ borderRadius: radius.tile, bgcolor: "action.hover", px: 1.75, pt: 1.5, pb: 1.25, ...appear(index) }}>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 1.5 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          <NumberTicker value={points[hi].value} format={meta.format} />
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {meta.label.toLowerCase()} · {labelOf(points[hi].date)}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", alignItems: "flex-end", gap: n > 16 ? "2px" : "6px", height: 112 }}>
        {points.map((p, i) => {
          const on = i === hi;
          const pct = p.value > 0 ? Math.max(6, (p.value / max) * 100) : 4;
          return (
            <Box
              key={i}
              role="button"
              aria-label={`${labelOf(p.date)}: ${meta.format(p.value)}`}
              onClick={() => setPicked(i)}
              sx={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", cursor: "pointer" }}
            >
              <Box
                sx={{
                  width: "100%",
                  height: `${pct}%`,
                  borderRadius: n > 16 ? "3px" : "7px",
                  bgcolor: on ? "primary.main" : grey,
                  opacity: p.value > 0 || on ? 1 : 0.6,
                  transformOrigin: "bottom",
                  transition: `${tr("height", motion.base)}, ${tr("background-color", motion.fast, "ease")}`,
                  animation: intro ? `${barGrow} 300ms ${motion.easeOut} ${120 + i * 25}ms both` : "none",
                }}
              />
            </Box>
          );
        })}
      </Box>
      {showLabels ? (
        <Box sx={{ display: "flex", gap: "6px", mt: 0.75 }}>
          {points.map((p, i) => (
            <Typography
              key={p.date}
              noWrap
              sx={{
                flex: 1,
                textAlign: "center",
                fontSize: 10,
                color: i === hi ? "text.primary" : "text.secondary",
                fontWeight: i === hi ? 600 : 400,
              }}
            >
              {labelOf(p.date)}
            </Typography>
          ))}
        </Box>
      ) : (
        <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.75 }}>
          <Typography sx={{ fontSize: 10 }} color="text.secondary">{labelOf(points[0].date)}</Typography>
          <Typography sx={{ fontSize: 10 }} color="text.secondary">{labelOf(points[n - 1].date)}</Typography>
        </Box>
      )}
    </Box>
  );
}
