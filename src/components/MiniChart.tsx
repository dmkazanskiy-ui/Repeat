import { useId } from "react";
import { useTheme } from "@mui/material/styles";
import { Box, Typography } from "@mui/material";
import { areaPath, smoothPath } from "../lib/chart";
import type { Pt } from "../lib/chart";

export interface ChartPoint {
  label: string; // подпись по оси X (дата)
  value: number;
}

interface Props {
  points: ChartPoint[];
  height?: number;
  /** Форматирование значения для подписей вершин. */
  format?: (value: number) => string;
}

/**
 * Крошечный линейный график на инлайновом SVG — без сторонних либ, чтобы не
 * раздувать бандл и не упираться в CSP. Рисует линию, точки и подписи
 * минимума/максимума. Ось Y всегда с небольшим запасом, иначе плоский тренд
 * прижимается к краю.
 */
export default function MiniChart({ points, height = 140, format }: Props) {
  const theme = useTheme();
  const gid = useId().replace(/:/g, "");
  const fmt = format ?? ((v: number) => String(Math.round(v)));

  if (points.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Пока нет данных для графика.
      </Typography>
    );
  }

  const W = 320;
  const H = height;
  const padX = 8;
  const padY = 20;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(max) || 1;
  const lo = min - span * 0.15;
  const hi = max + span * 0.15;

  const x = (i: number) =>
    points.length === 1
      ? W / 2
      : padX + (i * (W - padX * 2)) / (points.length - 1);
  const y = (v: number) =>
    H - padY - ((v - lo) / (hi - lo)) * (H - padY * 2);

  const pts: Pt[] = points.map((p, i) => [x(i), y(p.value)]);
  const line = smoothPath(pts);
  const area = areaPath(pts, H - padY, x(0), x(points.length - 1));
  const green = theme.palette.primary.main;
  const maxIdx = values.indexOf(max);
  const minIdx = values.indexOf(min);

  return (
    <Box sx={{ width: "100%" }}>
      <Box
        component="svg"
        viewBox={`0 0 ${W} ${H}`}
        sx={{ width: "100%", display: "block", overflow: "visible" }}
      >
        <defs>
          <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={green} stopOpacity={0.28} />
            <stop offset="100%" stopColor={green} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#area-${gid})`} />
        <path
          d={line}
          fill="none"
          stroke={green}
          strokeWidth={2.25}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {[maxIdx, minIdx].map((idx, k) =>
          k === 1 && minIdx === maxIdx ? null : (
            <circle
              key={idx}
              cx={x(idx)}
              cy={y(values[idx])}
              r={3.5}
              fill={theme.palette.background.paper}
              stroke={green}
              strokeWidth={2}
            />
          ),
        )}
        {/* Подписи крайних значений — только они несут смысл на мелком графике. */}
        <text
          x={x(maxIdx)}
          y={y(max) - 7}
          fill={theme.palette.text.primary}
          fontSize={11}
          textAnchor="middle"
        >
          {fmt(max)}
        </text>
        {minIdx !== maxIdx && (
          <text
            x={x(minIdx)}
            y={y(min) + 14}
            fill={theme.palette.text.secondary}
            fontSize={11}
            textAnchor="middle"
          >
            {fmt(min)}
          </text>
        )}
      </Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          mt: 0.5,
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {points[0].label}
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
