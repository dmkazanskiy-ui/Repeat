import { useEffect, useRef } from "react";
import { Box, type SxProps, type Theme } from "@mui/material";
import { introActive } from "../ui/tokens";

/** С нуля при первом открытии — 0,8 с; смена значения — 0,4 с. */
const INTRO_MS = 800;
const CHANGE_MS = 400;
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
 * при первом открытии приложения (0,8 с) и от текущего к новому при смене
 * (0,4 с). При переходе между вкладками стоит сразу. Текст — напрямую в DOM.
 */
export default function NumberTicker({ value, format, sx }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const fmt = useRef(format);
  fmt.current = format;
  // Вне первого открытия число сразу показывается целиком — без вспышки «0».
  const st = useRef<{ shown: number; raf: number; seen: boolean; startedFromZero: boolean; initialText: string }>(null as never);
  if (!st.current) {
    const fromZero = introActive();
    st.current = { shown: fromZero ? 0 : value, raf: 0, seen: false, startedFromZero: fromZero, initialText: format(fromZero ? 0 : value) };
  }

  function animateTo(to: number, ms: number) {
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
      const t = Math.min(1, (now - start) / ms);
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
      // С нуля — только при запуске приложения; при переходе между вкладками
      // число сразу стоит на месте.
      if (st.current.startedFromZero) animateTo(value, INTRO_MS);
      else animateTo(value, CHANGE_MS); // значение могло смениться до показа
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
    if (st.current.seen) animateTo(value, CHANGE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Box component="span" ref={ref} sx={{ fontVariantNumeric: "tabular-nums", ...sx }}>
      {st.current.initialText}
    </Box>
  );
}
