import { useTheme } from "@mui/material/styles";
import { Box, Typography } from "@mui/material";

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

  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const area = `${padX},${H - padY} ${line} ${W - padX},${H - padY}`;
  const maxIdx = values.indexOf(max);
  const minIdx = values.indexOf(min);

  return (
    <Box sx={{ width: "100%" }}>
      <Box
        component="svg"
        viewBox={`0 0 ${W} ${H}`}
        sx={{ width: "100%", display: "block", overflow: "visible" }}
      >
        <polygon points={area} fill={theme.palette.primary.main} opacity={0.1} />
        <polyline
          points={line}
          fill="none"
          stroke={theme.palette.primary.main}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(p.value)}
            r={i === maxIdx || i === minIdx ? 3.5 : 2}
            fill={theme.palette.primary.main}
          />
        ))}
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
