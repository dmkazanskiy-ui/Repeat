import { useId } from "react";
import { useTheme } from "@mui/material/styles";
import { Box, Typography } from "@mui/material";
import { areaPath, smoothPath } from "../../lib/chart";
import { useT } from "../../lib/i18n";
import type { Pt } from "../../lib/chart";

export interface WeightRepsPoint {
  label: string;
  weight: number;
  reps: number;
}

/**
 * График «макс. вес + размер точки = повторы»: по Y вес лучшего подхода, а размер
 * точки — число повторов. Так виден прогресс, которого линия макс-веса не
 * показывает: тот же вес, но больше повторов = крупнее точка (по рефу силовых
 * графиков). Один зелёный акцент, рецессивная сетка — как остальные наши графики.
 */
export default function WeightRepsChart({ points, height = 150 }: { points: WeightRepsPoint[]; height?: number }) {
  const theme = useTheme();
  const t = useT();
  const gid = useId().replace(/:/g, "");

  if (points.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {t("Пока нет данных для графика.", "No chart data yet.")}
      </Typography>
    );
  }

  const W = 320;
  const H = height;
  const padX = 12;
  const padY = 22;

  const weights = points.map((p) => p.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const span = max - min || Math.abs(max) || 1;
  const lo = min - span * 0.15;
  const hi = max + span * 0.15;

  const reps = points.map((p) => p.reps);
  const rMin = Math.min(...reps);
  const rMax = Math.max(...reps);
  const rSpan = rMax - rMin || 1;
  const radius = (r: number) => (rMax === rMin ? 5 : 3.5 + ((r - rMin) / rSpan) * 5);

  const x = (i: number) =>
    points.length === 1 ? W / 2 : padX + (i * (W - padX * 2)) / (points.length - 1);
  const y = (v: number) => H - padY - ((v - lo) / (hi - lo)) * (H - padY * 2);

  const pts: Pt[] = points.map((p, i) => [x(i), y(p.weight)]);
  const line = smoothPath(pts);
  const area = areaPath(pts, H - padY, x(0), x(points.length - 1));
  const green = theme.palette.primary.main;
  const maxIdx = weights.indexOf(max);

  return (
    <Box sx={{ width: "100%" }}>
      <Box component="svg" viewBox={`0 0 ${W} ${H}`} sx={{ width: "100%", display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id={`wr-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={green} stopOpacity={0.22} />
            <stop offset="100%" stopColor={green} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#wr-${gid})`} />
        <path d={line} fill="none" stroke={green} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.65} />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(p.weight)}
            r={radius(p.reps)}
            fill={green}
            stroke={theme.palette.background.paper}
            strokeWidth={1.5}
          />
        ))}
        {/* Подпись максимума: вес × повторы этого подхода. */}
        <text x={x(maxIdx)} y={y(max) - radius(points[maxIdx].reps) - 4} fill={theme.palette.text.primary} fontSize={11} textAnchor="middle">
          {Math.round(max)}×{points[maxIdx].reps}
        </text>
      </Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          {points[0].label}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
          {t("размер точки = повторы", "dot size = reps")}
        </Typography>
        {points.length > 1 && (
          <Typography variant="caption" color="text.secondary">
            {points[points.length - 1].label}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
