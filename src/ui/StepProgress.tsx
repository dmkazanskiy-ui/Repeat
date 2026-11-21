// Step progress (designbookmark.com/motion#db-step-progress) на наших пружинах.
// Зелёная линия пружиной (160/22) доезжает до текущего шага; пройденный шаг
// заливается зелёным (260/24) и в нём сама рисуется галочка (140/20, через
// 120 мс); текущий подпрыгивает (500/14) и становится светлым (300/26).
import { useEffect, useRef } from "react";
import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { clamp, spring, springLoop, type Spring } from "../lib/spring";

const LINE: [number, number] = [160, 22];
const FILL: [number, number] = [260, 24];
const CHECK: [number, number] = [140, 20];
const POP: [number, number] = [500, 14];
const ON: [number, number] = [300, 26];
const DOT = 32;

interface StepSprings {
  f: Spring;
  c: Spring;
  p: Spring;
  on: Spring;
}

export default function StepProgress({ steps, current }: { steps: string[]; current: number }) {
  const theme = useTheme();
  const green = theme.palette.primary.main;
  const onGreen = theme.palette.primary.contrastText;
  const surface = theme.palette.background.paper;
  const inverse = theme.palette.text.primary;
  const onInverse = theme.palette.background.default;
  const n = steps.length;

  const barRef = useRef<HTMLSpanElement>(null);
  const dotRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const numRefs = useRef<(HTMLElement | null)[]>([]);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const nameRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const st = useRef<{ L: Spring; s: StepSprings[]; loop: ReturnType<typeof springLoop> | null; timers: number[]; first: boolean }>({
    L: spring(0, ...LINE),
    s: steps.map(() => ({ f: spring(0, ...FILL), c: spring(0, ...CHECK), p: spring(1, ...POP), on: spring(0, ...ON) })),
    loop: null,
    timers: [],
    first: true,
  });

  useEffect(() => {
    const S = st.current;
    S.loop = springLoop(
      () => [S.L, ...S.s.flatMap((x) => [x.f, x.c, x.p, x.on])],
      () => {
        if (barRef.current) barRef.current.style.width = `${(clamp(S.L.x, 0, 1) * 100).toFixed(3)}%`;
        S.s.forEach((x, i) => {
          const f = clamp(x.f.x, 0, 1);
          const o = clamp(x.on.x, 0, 1);
          const d = dotRefs.current[i];
          if (d) {
            d.style.background =
              f > 0.01
                ? `color-mix(in srgb, ${green} ${(f * 100).toFixed(1)}%, ${surface})`
                : o > 0.01
                  ? `color-mix(in srgb, ${inverse} ${(o * 100).toFixed(1)}%, ${surface})`
                  : surface;
            d.style.color = o > 0.5 ? onInverse : theme.palette.text.secondary;
            d.style.transform = `scale(${x.p.x.toFixed(4)})`;
          }
          const num = numRefs.current[i];
          if (num) num.style.opacity = (1 - f).toFixed(3);
          const path = pathRefs.current[i];
          if (path) path.style.strokeDashoffset = (22 * (1 - clamp(x.c.x, 0, 1))).toFixed(2);
        });
      },
    );
    S.loop.kick();
    return () => {
      S.loop?.stop();
      S.timers.forEach(clearTimeout);
    };
  }, [green, surface, inverse, onInverse, theme.palette.text.secondary]);

  useEffect(() => {
    const S = st.current;
    const i = clamp(current, 0, n - 1);
    S.L.t = n > 1 ? i / (n - 1) : 1;
    S.s.forEach((x, k) => {
      const done = k < i || (i === n - 1 && k === n - 1);
      x.f.t = done ? 1 : 0;
      x.on.t = k === i && !done ? 1 : 0;
      if (done) S.timers.push(window.setTimeout(() => {
        x.c.t = 1;
        S.loop?.kick();
      }, 120));
      else x.c.t = 0;
      const nm = nameRefs.current[k];
      if (nm) nm.style.color = k <= i ? theme.palette.text.primary : theme.palette.text.secondary;
    });
    // Первый показ — без прыжка; дальше текущий шаг подпрыгивает.
    if (!S.first) {
      S.s[i].p.x = 0.7;
      S.s[i].p.v = 6;
    }
    S.first = false;
    S.loop?.kick();
  }, [current, n, theme.palette.text.primary, theme.palette.text.secondary]);

  return (
    <Box role="progressbar" aria-valuemin={1} aria-valuemax={n} aria-valuenow={current + 1} aria-valuetext={steps[current]} sx={{ width: "100%", maxWidth: 360, mx: "auto" }}>
      <Box sx={{ position: "relative", height: DOT, mx: "14px" }}>
        <Box sx={{ position: "absolute", left: 0, right: 0, top: 14, height: 4, borderRadius: 2, bgcolor: "action.selected" }} />
        <Box component="span" ref={barRef} sx={{ position: "absolute", left: 0, top: 14, height: 4, borderRadius: 2, bgcolor: green, willChange: "width" }} />
        {steps.map((_, i) => (
          <Box
            key={i}
            component="span"
            ref={(el: HTMLSpanElement | null) => {
              dotRefs.current[i] = el;
            }}
            sx={{
              position: "absolute",
              top: 0,
              left: `${n > 1 ? (i / (n - 1)) * 100 : 50}%`,
              width: DOT,
              height: DOT,
              ml: `${-DOT / 2}px`,
              borderRadius: "50%",
              bgcolor: surface,
              boxShadow: `inset 0 0 0 1px ${theme.palette.divider}`,
              color: "text.secondary",
              display: "grid",
              placeItems: "center",
              fontSize: 13,
              fontWeight: 700,
              willChange: "transform",
            }}
          >
            <Box component="b" ref={(el: HTMLElement | null) => { numRefs.current[i] = el; }} sx={{ position: "absolute", fontWeight: "inherit" }}>
              {i + 1}
            </Box>
            <svg viewBox="0 0 24 24" width={16} height={16} style={{ position: "absolute", fill: "none", stroke: onGreen, strokeWidth: 2.8, strokeLinecap: "round", strokeLinejoin: "round" }} aria-hidden>
              <path ref={(el) => { pathRefs.current[i] = el; }} d="M5 12.5l4.5 4.5L19 7.5" style={{ strokeDasharray: 22, strokeDashoffset: 22 }} />
            </svg>
          </Box>
        ))}
      </Box>
      <Box sx={{ position: "relative", height: 18, mx: "14px", mt: 1.25 }}>
        {steps.map((name, i) => (
          <Box
            key={i}
            component="span"
            ref={(el: HTMLSpanElement | null) => {
              nameRefs.current[i] = el;
            }}
            sx={{ position: "absolute", top: 0, left: `${n > 1 ? (i / (n - 1)) * 100 : 50}%`, transform: "translateX(-50%)", fontSize: 12, color: "text.secondary", whiteSpace: "nowrap", transition: "color .3s" }}
          >
            {name}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
