import { useEffect, useRef } from "react";
import { Box, type SxProps, type Theme } from "@mui/material";

/** Длительность докрутки: всегда не дольше секунды, как бы далеко ни ехало число. */
const DURATION_MS = 800;
const reduce =
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Быстрый старт и мягкая посадка (ease-out quart), без перелёта. */
const ease = (t: number) => 1 - (1 - t) ** 4;

interface Props {
  value: number;
  format: (v: number) => string;
  sx?: SxProps<Theme>;
}

/**
 * Число, которое докручивается до значения (Number Ticker из Magic UI): с нуля,
 * когда впервые попало в экран, и от текущего к новому при смене. Длится
 * фиксированные 0,8 с. Текст пишется напрямую в DOM, без ререндеров.
 */
export default function NumberTicker({ value, format, sx }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const fmt = useRef(format);
  fmt.current = format;
  const st = useRef({ shown: 0, raf: 0, seen: false });

  function animateTo(to: number) {
    const s = st.current;
    cancelAnimationFrame(s.raf);
    const from = s.shown;
    const paint = (v: number) => {
      s.shown = v;
      if (ref.current) ref.current.textContent = fmt.current(v);
    };
    if (reduce || from === to) return paint(to);
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      paint(t >= 1 ? to : from + (to - from) * ease(t));
      if (t < 1) s.raf = requestAnimationFrame(frame);
    };
    s.raf = requestAnimationFrame(frame);
  }

  // Первый показ — когда элемент попал в экран.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      st.current.seen = true;
      animateTo(value);
      io.disconnect();
    });
    io.observe(el);
    const s = st.current;
    return () => {
      io.disconnect();
      cancelAnimationFrame(s.raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (st.current.seen) animateTo(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Box component="span" ref={ref} sx={{ fontVariantNumeric: "tabular-nums", ...sx }}>
      {format(0)}
    </Box>
  );
}
