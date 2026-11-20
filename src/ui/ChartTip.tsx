import { Box, Typography } from "@mui/material";

/**
 * Подсказка над точкой/столбиком графика по тапу: значение и подпись.
 * `x` — положение в процентах ширины графика; у краёв подсказка прижимается,
 * чтобы не вылезать за карточку.
 */
export default function ChartTip({ x, top = 0, value, label }: { x: number; top?: number | string; value: string; label?: string }) {
  const shift = x < 15 ? "0%" : x > 85 ? "-100%" : "-50%";
  return (
    <Box
      sx={{
        position: "absolute",
        left: `${x}%`,
        top,
        transform: `translate(${shift}, -100%)`,
        mt: -0.75,
        px: 1,
        py: 0.5,
        borderRadius: "10px",
        bgcolor: "text.primary",
        color: "background.default",
        pointerEvents: "none",
        whiteSpace: "nowrap",
        zIndex: 3,
        boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
      }}
    >
      <Typography sx={{ fontSize: 12, fontWeight: 700, lineHeight: 1.25, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
      {label && <Typography sx={{ fontSize: 10.5, lineHeight: 1.2, opacity: 0.7 }}>{label}</Typography>}
    </Box>
  );
}
