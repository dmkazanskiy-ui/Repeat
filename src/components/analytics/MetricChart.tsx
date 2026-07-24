import { useId, useState } from "react";
import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { roundedTopRect, smoothPath } from "../../lib/chart";
import type { Pt } from "../../lib/chart";
import type { MetricDataPoint } from "../../lib/analytics";

interface Props {
  points: MetricDataPoint[];
  /** Предыдущий период той же длины — рисуется нейтральной серой линией. */
  previous?: MetricDataPoint[];
  /** Среднее за тренировочный день — пунктирная линия. */
  average?: number;
  format: (v: number) => string;
  labelOf: (dateKey: string) => string;
}

const W = 320;
const H = 168;
const PAD_X = 8;
const PAD_TOP = 18;
const PAD_BOTTOM = 22;

/**
 * Столбчатый график: градиентные столбцы со скруглённым верхом, рецессивная
 * сетка, линия среднего и наложение предыдущего периода тонкой серой кривой.
 * Тултип по тапу ставится над выбранным столбцом. Инлайновый SVG.
 */
export default function MetricChart({
  points,
  previous,
  average,
  format,
  labelOf,
}: Props) {
  const theme = useTheme();
  const gid = useId().replace(/:/g, "");
  const [selected, setSelected] = useState<number | null>(null);

  if (points.length === 0) return null;

  const prev = previous && previous.length === points.length ? previous : null;
  const values = points.map((p) => p.value);
  const max = Math.max(
    1,
    ...values,
    ...(prev ? prev.map((p) => p.value) : []),
    average ?? 0,
  );
  const top = max * 1.18;

  const n = points.length;
  const slot = (W - PAD_X * 2) / n;
  const barW = Math.min(slot * 0.56, 30);
  const cx = (i: number) => PAD_X + slot * (i + 0.5);
  const y = (v: number) =>
    H - PAD_BOTTOM - (v / top) * (H - PAD_TOP - PAD_BOTTOM);
  const base = y(0);

  const showLabels = n <= 8;
  const green = theme.palette.primary.main;
  const gridColor = theme.palette.divider;

  // Рецессивная сетка: пара горизонтальных линий на 1/2 и максимуме.
  const gridLines = [max, max / 2];
  const prevPts: Pt[] = prev ? prev.map((p, i) => [cx(i), y(p.value)]) : [];

  return (
    <Box sx={{ position: "relative", width: "100%" }}>
      {selected != null && (
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: `${((selected + 0.5) / n) * 100}%`,
            transform: "translateX(-50%)",
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1.5,
            px: 1,
            py: 0.25,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 2,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            {labelOf(points[selected].date)} · {format(points[selected].value)}
          </Typography>
        </Box>
      )}

      <Box
        component="svg"
        viewBox={`0 0 ${W} ${H}`}
        sx={{ width: "100%", display: "block", mt: 3, overflow: "visible" }}
      >
        <defs>
          <linearGradient id={`bar-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={green} stopOpacity={0.95} />
            <stop offset="100%" stopColor={green} stopOpacity={0.35} />
          </linearGradient>
        </defs>

        {/* Рецессивная сетка */}
        {gridLines.map((v, i) => (
          <line
            key={i}
            x1={PAD_X}
            x2={W - PAD_X}
            y1={y(v)}
            y2={y(v)}
            stroke={gridColor}
            strokeWidth={1}
            opacity={0.5}
          />
        ))}

        {average != null && average > 0 && (
          <line
            x1={PAD_X}
            x2={W - PAD_X}
            y1={y(average)}
            y2={y(average)}
            stroke={theme.palette.text.secondary}
            strokeDasharray="3 4"
            strokeWidth={1.5}
            opacity={0.8}
          />
        )}

        {points.map((p, i) => {
          const h = base - y(p.value);
          const active = selected === i;
          return (
            <g key={p.date} onClick={() => setSelected(active ? null : i)}>
              <rect
                x={cx(i) - slot / 2}
                y={PAD_TOP}
                width={slot}
                height={H - PAD_TOP - PAD_BOTTOM}
                fill="transparent"
              />
              {h > 0 && (
                <path
                  d={roundedTopRect(cx(i) - barW / 2, y(p.value), barW, h, 4)}
                  fill={`url(#bar-${gid})`}
                  opacity={active ? 1 : 0.9}
                  stroke={active ? green : "none"}
                  strokeWidth={active ? 1.5 : 0}
                />
              )}
              {showLabels && (
                <text
                  x={cx(i)}
                  y={H - 7}
                  fill={
                    active ? theme.palette.text.primary : theme.palette.text.secondary
                  }
                  fontSize={10}
                  fontWeight={active ? 600 : 400}
                  textAnchor="middle"
                >
                  {labelOf(p.date)}
                </text>
              )}
            </g>
          );
        })}

        {prev && (
          <path
            d={smoothPath(prevPts)}
            fill="none"
            stroke={theme.palette.text.secondary}
            strokeWidth={1.5}
            strokeLinecap="round"
            opacity={0.55}
          />
        )}
      </Box>

      {!showLabels && (
        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
          <Typography variant="caption" color="text.secondary">
            {labelOf(points[0].date)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {labelOf(points[points.length - 1].date)}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
