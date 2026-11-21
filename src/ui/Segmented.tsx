// Segmented control (designbookmark.com/motion#db-segmented-control) на наших
// пружинах. Подсветка едет одной пружиной 300/20 и от скорости слегка
// сплющивается (шире и ниже) — читается мягкой; садится с маленьким перелётом.
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { Box } from "@mui/material";
import { clamp, spring, springLoop } from "../lib/spring";
import { radius } from "./tokens";

const X_SPRING: [number, number] = [300, 20];

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface Props<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** equal — сегменты одной ширины; content — по тексту, ряд прокручивается. */
  fit?: "equal" | "content";
  size?: "small" | "medium";
  ariaLabel?: string;
}

export default function Segmented<T extends string>({ options, value, onChange, fit = "equal", size = "medium", ariaLabel }: Props<T>) {
  const rowRef = useRef<HTMLDivElement>(null);
  const hlRef = useRef<HTMLSpanElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const st = useRef<{ X: ReturnType<typeof spring>; W: number; loop: ReturnType<typeof springLoop> | null; init: boolean }>({
    X: spring(0, ...X_SPRING),
    W: 0,
    loop: null,
    init: true,
  });
  const h = size === "small" ? 32 : 38;
  const idx = Math.max(0, options.findIndex((o) => o.value === value));

  useEffect(() => {
    const s = st.current;
    s.loop = springLoop(
      () => [s.X],
      () => {
        const hl = hlRef.current;
        if (!hl) return;
        const sp = clamp(Math.abs(s.X.v) / 1400, 0, 0.22);
        hl.style.width = `${s.W}px`;
        hl.style.transform = `translateX(${s.X.x.toFixed(2)}px) scale(${(1 + sp).toFixed(4)},${(1 - sp * 0.5).toFixed(4)})`;
      },
    );
    return () => s.loop?.stop();
  }, []);

  // Цель — левый край выбранной кнопки; при первом показе ставим сразу, без езды.
  useLayoutEffect(() => {
    const s = st.current;
    const btn = btnRefs.current[idx];
    if (!btn) return;
    s.X.t = btn.offsetLeft;
    s.W = btn.offsetWidth;
    if (s.init) {
      s.X.x = s.X.t;
      s.init = false;
    }
    s.loop?.kick();
    if (fit === "content") btn.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [idx, options.length, fit]);

  // Ширина могла поменяться (поворот экрана, шрифт) — пересчитать без анимации.
  useEffect(() => {
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const s = st.current;
      const btn = btnRefs.current[idx];
      if (!btn) return;
      s.X.t = s.X.x = btn.offsetLeft;
      s.W = btn.offsetWidth;
      s.loop?.kick();
    });
    ro.observe(row);
    return () => ro.disconnect();
  }, [idx]);

  return (
    <Box sx={{ overflowX: fit === "content" ? "auto" : "visible", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
      <Box
        ref={rowRef}
        role="tablist"
        aria-label={ariaLabel}
        sx={{ position: "relative", display: fit === "content" ? "inline-flex" : "flex", minWidth: fit === "content" ? "100%" : undefined, p: "4px", borderRadius: "16px", bgcolor: "action.hover" }}
      >
        <Box
          component="span"
          ref={hlRef}
          aria-hidden
          sx={{ position: "absolute", left: 0, top: "4px", height: h, borderRadius: radius.control, bgcolor: "text.primary", willChange: "transform", pointerEvents: "none" }}
        />
        {options.map((o, i) => {
          const on = i === idx;
          return (
            <Box
              key={o.value}
              component="button"
              ref={(el: HTMLButtonElement | null) => {
                btnRefs.current[i] = el;
              }}
              role="tab"
              aria-selected={on}
              onClick={() => onChange(o.value)}
              sx={{
                position: "relative",
                zIndex: 1,
                flex: fit === "equal" ? 1 : "none",
                px: fit === "content" ? 1.75 : 0.5,
                height: h,
                border: 0,
                bgcolor: "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: size === "small" ? 13 : 14,
                fontWeight: 600,
                whiteSpace: "nowrap",
                color: on ? "background.default" : "text.secondary",
                transition: "color .25s",
              }}
            >
              {o.label}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
