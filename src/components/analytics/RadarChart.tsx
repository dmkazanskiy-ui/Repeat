import { Box, Stack, Typography, useTheme } from "@mui/material";
import { L } from "../../lib/i18n";

export interface RadarPoint {
  label: string;
  value: number;
}

interface Props {
  data: RadarPoint[];
  /** Верх шкалы. По умолчанию — максимум значений (относительная форма). */
  max?: number;
  formatValue?: (v: number) => string;
  /** Компактный список «метка — значение» под диаграммой (точные числа). */
  showValues?: boolean;
}

const W = 320;
const C = W / 2;
const R = 96;
const LABEL_R = R + 20;
const RINGS = [0.25, 0.5, 0.75, 1];

function pointAt(index: number, count: number, radius: number): [number, number] {
  // Первая ось — вверх, дальше по часовой стрелке.
  const angle = (-90 + (index * 360) / count) * (Math.PI / 180);
  return [C + radius * Math.cos(angle), C + radius * Math.sin(angle)];
}

function polygonPoints(count: number, radius: number): string {
  return Array.from({ length: count }, (_, i) => pointAt(i, count, radius).join(","))
    .join(" ");
}

/**
 * Лепестковая (radar) диаграмма для одной серии: концентрическая сетка,
 * оси с подписями и одна полупрозрачная заливка с точками-вершинами. Один
 * акцент — без радуги (правила dataviz). Точные значения — списком под
 * диаграммой, чтобы не подписывать каждую вершину числом.
 */
export default function RadarChart({
  data,
  max,
  formatValue = (v) => String(Math.round(v)),
  showValues = true,
}: Props) {
  const theme = useTheme();
  const n = data.length;
  const accent = theme.palette.primary.main;
  const grid = theme.palette.divider;
  const ink = theme.palette.text.secondary;

  const scaleMax = max ?? Math.max(...data.map((d) => d.value), 1);
  const safeMax = scaleMax > 0 ? scaleMax : 1;

  const dataPts = data.map((d, i) => {
    const r = Math.max(0, Math.min(1, d.value / safeMax)) * R;
    return pointAt(i, n, r);
  });

  return (
    <Box>
      <Box
        component="svg"
        viewBox={`0 0 ${W} ${W}`}
        role="img"
        aria-label={L("Лепестковая диаграмма", "Radar chart")}
        sx={{ width: "100%", maxWidth: 360, mx: "auto", display: "block", overflow: "visible" }}
      >
        {/* Сетка — концентрические многоугольники */}
        {RINGS.map((t) => (
          <polygon
            key={t}
            points={polygonPoints(n, t * R)}
            fill="none"
            stroke={grid}
            strokeWidth={1}
            opacity={0.6}
          />
        ))}
        {/* Оси-спицы */}
        {data.map((_, i) => {
          const [x, y] = pointAt(i, n, R);
          return (
            <line key={i} x1={C} y1={C} x2={x} y2={y} stroke={grid} strokeWidth={1} opacity={0.5} />
          );
        })}
        {/* Заливка данными */}
        <polygon
          points={dataPts.map((p) => p.join(",")).join(" ")}
          fill={accent}
          fillOpacity={0.16}
          stroke={accent}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {/* Точки-вершины */}
        {dataPts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={4.5} fill={accent} stroke={theme.palette.background.paper} strokeWidth={1.5} />
        ))}
        {/* Подписи осей */}
        {data.map((d, i) => {
          const [x, y] = pointAt(i, n, LABEL_R);
          const cos = (x - C) / LABEL_R;
          const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
          return (
            <text
              key={i}
              x={x}
              y={y}
              textAnchor={anchor}
              dominantBaseline="middle"
              fill={ink}
              fontSize={11}
              fontFamily={theme.typography.fontFamily}
            >
              {d.label}
            </text>
          );
        })}
      </Box>

      {showValues && (
        <Box
          sx={{
            mt: 1.5,
            display: "flex",
            flexWrap: "wrap",
            gap: 0.5,
            justifyContent: "center",
          }}
        >
          {data.map((d) => (
            <Stack
              key={d.label}
              direction="row"
              spacing={0.5}
              sx={{ alignItems: "center", px: 0.75 }}
            >
              <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "primary.main" }} />
              <Typography variant="caption" color="text.secondary">
                {d.label}
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                {formatValue(d.value)}
              </Typography>
            </Stack>
          ))}
        </Box>
      )}
    </Box>
  );
}
