import { useRef, useState } from "react";
import { Box } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { motion, radius } from "./tokens";

interface Props {
  label: string;
  /** null — ещё не задано. */
  value: number | null;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  /** Подпись единицы рядом со значением: «кг», «см». */
  unit: string;
  /** Последнее известное значение: с него начинается ввод, если поле пустое. */
  hint?: number | null;
  /** С чего начать, если нет ни значения, ни прошлого замера (типичное значение). */
  start?: number;
  ticks?: number;
}

const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
const decimalsOf = (step: number) => (String(step).split(".")[1] ?? "").length;

/**
 * Ползунок в духе дизайн-инструментов (Scrubber, SmoothUI): подпись слева,
 * значение справа, заливка и тонкая капсула-бегунок, засечки.
 *
 * Тянется относительно, а не прыгает под палец: так шкала 0–200 остаётся
 * точной. Отведи палец вниз от полосы — точность растёт (×¼, дальше ×⅒),
 * как в скрабберах iOS. Пустое поле по тапу берёт прошлое значение.
 */
export default function Scrubber({ label, value, onChange, min, max, step, unit, hint, start, ticks = 9 }: Props) {
  const theme = useTheme();
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const drag = useRef<{ id: number; x: number; y0: number; v: number; moved: boolean } | null>(null);

  const dec = decimalsOf(step);
  const snap = (v: number) => clamp(Math.round((v - min) / step) * step + min, min, max);
  const shown = value ?? hint ?? null;
  const pct = shown == null ? 0 : ((shown - min) / (max - min)) * 100;
  const fmt = (v: number) => v.toFixed(dec).replace(".", ",");

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    try {
      trackRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* синтетические события без захвата — не страшно */
    }
    setActive(true);
    drag.current = { id: e.pointerId, x: e.clientX, y0: e.clientY, v: value ?? hint ?? start ?? (min + max) / 2, moved: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const track = trackRef.current;
    if (!d || d.id !== e.pointerId || !track) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 3) return;
    d.moved = true;
    d.x = e.clientX;
    // Чем дальше палец ушёл от полосы по вертикали, тем мельче шаг.
    const off = Math.abs(e.clientY - d.y0);
    const fine = off < 40 ? 1 : off < 100 ? 0.25 : 0.1;
    d.v = clamp(d.v + (dx / track.clientWidth) * (max - min) * fine, min, max);
    const next = snap(d.v);
    if (next !== value) onChange(next);
  }
  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    setActive(false);
    // Тап без движения по пустому полю — взять прошлое значение.
    if (d && d.id === e.pointerId && !d.moved && value == null && hint != null) onChange(snap(hint));
  }
  function onKeyDown(e: React.KeyboardEvent) {
    const base = value ?? hint ?? min;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowUp" ? base + step
      : e.key === "ArrowLeft" || e.key === "ArrowDown" ? base - step
      : e.key === "Home" ? min
      : e.key === "End" ? max
      : null;
    if (next == null) return;
    e.preventDefault();
    onChange(snap(next));
  }

  const fg = theme.palette.text.primary;
  const empty = value == null;
  const ease = `${motion.fast}ms ${motion.easeOut}`;

  return (
    <Box
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value ?? undefined}
      aria-valuetext={value == null ? "не задано" : `${fmt(value)} ${unit}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      sx={{
        position: "relative",
        height: 44,
        borderRadius: radius.control,
        overflow: "hidden",
        bgcolor: "action.hover",
        cursor: "ew-resize",
        touchAction: "none",
        userSelect: "none",
        outline: "none",
        "&:focus-visible": { boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.6)}` },
      }}
    >
      {/* Заливка до значения; пустое поле — бледный след прошлого замера */}
      <Box
        sx={{
          position: "absolute",
          inset: "0 auto 0 0",
          width: `${pct}%`,
          bgcolor: alpha(fg, empty ? 0.05 : 0.12),
          borderRadius: radius.control,
          transition: active ? "none" : `width 150ms ${motion.easeOut}`,
        }}
      />
      {/* Засечки */}
      {Array.from({ length: ticks }, (_, i) => (
        <Box
          key={i}
          sx={{
            position: "absolute",
            top: "50%",
            left: `${((i + 1) / (ticks + 1)) * 100}%`,
            width: "1px",
            height: 6,
            borderRadius: 999,
            bgcolor: alpha(fg, 0.25),
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }}
        />
      ))}
      {/* Капсула-бегунок: ярче и крупнее, пока тянешь */}
      {shown != null && (
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: `${pct}%`,
            ml: "-5px",
            width: 4,
            height: 24,
            borderRadius: 999,
            bgcolor: fg,
            transform: `translate(-50%, -50%) scale(${active ? 1 : 0.7})`,
            opacity: active ? 0.85 : empty ? 0.12 : 0.3,
            transition: active ? `transform ${ease}, opacity ${ease}` : `left 150ms ${motion.easeOut}, transform ${ease}, opacity ${ease}`,
            pointerEvents: "none",
            zIndex: 3,
          }}
        />
      )}
      <Box sx={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, fontWeight: 500, zIndex: 4, pointerEvents: "none" }}>
        {label}
      </Box>
      <Box
        sx={{
          position: "absolute",
          right: 12,
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: 14,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          color: empty ? "text.disabled" : "text.primary",
          zIndex: 4,
          pointerEvents: "none",
        }}
      >
        {value != null ? `${fmt(value)} ${unit}` : hint != null ? `было ${fmt(hint)}` : "—"}
      </Box>
    </Box>
  );
}
