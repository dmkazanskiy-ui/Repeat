import { Box, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Кольцевой скор (как «68» в референсах): дуга-прогресс + число по центру.
 * Одна зелёная серия, трек — нейтральный.
 */
export function ScoreRing({
  fraction,
  center,
  sub,
  size = 104,
}: {
  fraction: number;
  center: string;
  sub?: string;
  size?: number;
}) {
  const theme = useTheme();
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - clamp01(fraction));
  return (
    <Box sx={{ position: "relative", width: size, height: size, flex: "0 0 auto" }}>
      <Box component="svg" viewBox={`0 0 ${size} ${size}`} sx={{ width: size, height: size }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={theme.palette.divider}
          strokeWidth={stroke}
          opacity={0.6}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={theme.palette.primary.main}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Box>
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography variant="h1" sx={{ fontWeight: 700, lineHeight: 1 }}>
          {center}
        </Typography>
        {sub && (
          <Typography variant="caption" color="text.secondary">
            {sub}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

/**
 * Линейка-шкала с маркером (как индикаторы в референсах): ряд тонких засечек и
 * зелёный маркер на позиции 0..1. Показывает, где текущее значение относительно
 * «обычного». Оранжевый маркер, когда сильно выше нормы.
 */
export function RulerMeter({
  position,
  warn = false,
  ticks = 25,
}: {
  position: number | null;
  warn?: boolean;
  ticks?: number;
}) {
  const theme = useTheme();
  const W = 300;
  const H = 34;
  const padX = 4;
  const step = (W - padX * 2) / (ticks - 1);
  const markerColor = warn ? theme.palette.warning.main : theme.palette.primary.main;
  const mx = position == null ? null : padX + clamp01(position) * (W - padX * 2);

  return (
    <Box component="svg" viewBox={`0 0 ${W} ${H}`} sx={{ width: "100%", display: "block" }}>
      {Array.from({ length: ticks }, (_, i) => {
        const x = padX + i * step;
        const mid = i === Math.floor((ticks - 1) / 2);
        return (
          <line
            key={i}
            x1={x}
            x2={x}
            y1={mid ? 4 : 8}
            y2={mid ? H - 12 : H - 14}
            stroke={theme.palette.text.secondary}
            strokeWidth={1}
            opacity={mid ? 0.5 : 0.28}
          />
        );
      })}
      {mx != null && (
        <>
          <line x1={mx} x2={mx} y1={2} y2={H - 10} stroke={markerColor} strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={mx} cy={2} r={3} fill={markerColor} />
        </>
      )}
    </Box>
  );
}

/**
 * Неделя точками-чекинами (как серии в референсах): 7 кружков Пн–Вс, активные
 * дни залиты зелёным, сегодня в кольце.
 */
export function WeekDots({
  active,
  labels,
  todayIndex,
}: {
  active: boolean[];
  labels: string[];
  todayIndex: number;
}) {
  return (
    <Stack direction="row" sx={{ justifyContent: "space-between" }}>
      {active.map((on, i) => (
        <Stack key={i} spacing={0.5} sx={{ alignItems: "center", flex: 1 }}>
          <Box
            sx={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              bgcolor: on ? "primary.main" : "transparent",
              border: "1.5px solid",
              borderColor: on
                ? "primary.main"
                : i === todayIndex
                  ? "primary.main"
                  : "divider",
              opacity: on || i === todayIndex ? 1 : 0.6,
            }}
          />
          <Typography variant="caption" sx={{ fontSize: 10, color: "text.secondary" }}>
            {labels[i]}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}
