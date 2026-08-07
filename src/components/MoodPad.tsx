import { useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/**
 * 2D-карта настроения: водишь пальцем/курсором — выбираешь точную точку.
 * Ось `y` (низ→верх) = силы/бодрость, ось `x` (лево→право) = вторая ось со
 * смыслом под контекст. Подписи концов и цвет задаются снаружи.
 */
export default function MoodPad({
  value,
  onChange,
  yLabels,
  xLabels,
  color,
}: {
  value: { x: number; y: number } | null;
  onChange: (v: { x: number; y: number }) => void;
  yLabels: [string, string];
  xLabels: [string, string];
  color: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  function setFrom(e: React.PointerEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    onChange({
      x: clamp((e.clientX - r.left) / r.width),
      y: clamp(1 - (e.clientY - r.top) / r.height),
    });
  }

  const px = value ? value.x * 100 : 50;
  const py = value ? (1 - value.y) * 100 : 50;
  const labelSx = {
    position: "absolute" as const,
    color: "text.secondary",
    fontSize: 10.5,
    pointerEvents: "none" as const,
    maxWidth: "44%",
  };

  return (
    <Box sx={{ position: "relative", px: 3, py: 2.5 }}>
      {/* Подписи осей по краям */}
      <Typography sx={{ ...labelSx, top: 4, left: "50%", transform: "translateX(-50%)" }}>
        {yLabels[1]}
      </Typography>
      <Typography sx={{ ...labelSx, bottom: 4, left: "50%", transform: "translateX(-50%)" }}>
        {yLabels[0]}
      </Typography>
      <Typography sx={{ ...labelSx, left: 2, top: "50%", transform: "translateY(-50%)", textAlign: "left" }}>
        {xLabels[0]}
      </Typography>
      <Typography sx={{ ...labelSx, right: 2, top: "50%", transform: "translateY(-50%)", textAlign: "right" }}>
        {xLabels[1]}
      </Typography>

      {/* Поле-карта */}
      <Box
        ref={ref}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setDragging(true);
          setFrom(e);
        }}
        onPointerMove={(e) => dragging && setFrom(e)}
        onPointerUp={() => setDragging(false)}
        sx={{
          position: "relative",
          width: "100%",
          maxWidth: 260,
          mx: "auto",
          aspectRatio: "1",
          borderRadius: 3,
          border: "1px solid",
          borderColor: alpha(color, 0.3),
          cursor: "pointer",
          touchAction: "none",
          overflow: "hidden",
          // Сетка точек + мягкий блик к «лучшему» верхнему углу.
          backgroundColor: "action.hover",
          backgroundImage: `radial-gradient(circle at 72% 22%, ${alpha(color, 0.16)}, transparent 60%), radial-gradient(${alpha(
            "#94a3b3",
            0.28,
          )} 1.1px, transparent 1.3px)`,
          backgroundSize: "100% 100%, 12.5% 12.5%",
          backgroundPosition: "center, center",
        }}
      >
        {/* Точка выбора */}
        <Box
          sx={{
            position: "absolute",
            left: `${px}%`,
            top: `${py}%`,
            width: 24,
            height: 24,
            borderRadius: "50%",
            transform: "translate(-50%, -50%)",
            bgcolor: value ? color : alpha(color, 0.4),
            border: "2px solid #fff",
            boxShadow: `0 2px 8px ${alpha("#000", 0.4)}`,
            transition: dragging ? "none" : "left .08s, top .08s",
            pointerEvents: "none",
          }}
        />
      </Box>
    </Box>
  );
}
