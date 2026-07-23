import { useState } from "react";
import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
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
const H = 150;
const PAD_X = 6;
const PAD_TOP = 16;
const PAD_BOTTOM = 20;

/**
 * Столбчатый график с нулевыми днями, линией среднего, наложением предыдущего
 * периода и тултипом по тапу. Инлайновый SVG — без сторонних либ. Тултип
 * ставится над выбранным столбцом, чтобы не перекрывать его.
 */
export default function MetricChart({
  points,
  previous,
  average,
  format,
  labelOf,
}: Props) {
  const theme = useTheme();
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
  const top = max * 1.15;

  const n = points.length;
  const slot = (W - PAD_X * 2) / n;
  const barW = Math.min(slot * 0.6, 34);
  const cx = (i: number) => PAD_X + slot * (i + 0.5);
  const y = (v: number) =>
    H - PAD_BOTTOM - (v / top) * (H - PAD_TOP - PAD_BOTTOM);
  const base = y(0);

  const showLabels = n <= 8;
  const prevLine = prev
    ? prev.map((p, i) => `${cx(i)},${y(p.value)}`).join(" ")
    : "";

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
            borderRadius: 1,
            px: 1,
            py: 0.25,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 2,
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
        sx={{ width: "100%", display: "block", mt: 3 }}
      >
        {average != null && average > 0 && (
          <line
            x1={PAD_X}
            x2={W - PAD_X}
            y1={y(average)}
            y2={y(average)}
            stroke={theme.palette.text.secondary}
            strokeDasharray="4 4"
            strokeWidth={1}
            opacity={0.7}
          />
        )}

        {points.map((p, i) => {
          const h = base - y(p.value);
          const active = selected === i;
          return (
            <g key={p.date} onClick={() => setSelected(active ? null : i)}>
              {/* Прозрачная зона тапа на всю высоту — попасть в нулевой день тоже. */}
              <rect
                x={cx(i) - slot / 2}
                y={PAD_TOP}
                width={slot}
                height={H - PAD_TOP - PAD_BOTTOM}
                fill="transparent"
              />
              <rect
                x={cx(i) - barW / 2}
                y={y(p.value)}
                width={barW}
                height={Math.max(0, h)}
                rx={3}
                fill={theme.palette.primary.main}
                opacity={active ? 1 : 0.85}
              />
              {showLabels && (
                <text
                  x={cx(i)}
                  y={H - 6}
                  fill={theme.palette.text.secondary}
                  fontSize={10}
                  textAnchor="middle"
                >
                  {labelOf(p.date)}
                </text>
              )}
            </g>
          );
        })}

        {prev && (
          <polyline
            points={prevLine}
            fill="none"
            stroke={theme.palette.text.secondary}
            strokeWidth={1.5}
            strokeDasharray="1 0"
            opacity={0.5}
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
