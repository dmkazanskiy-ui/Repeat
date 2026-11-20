import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { Box, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { clamp, spring, springLoop, tune, type Spring } from "../lib/spring";

// Пружины Jelly Slider (designbookmark.com/motion, tokens.css):
const FOLLOW: [number, number] = [900, 50]; // бегунок за пальцем
const BUBBLE: [number, number] = [420, 22]; // капля со значением поднимается
const RELEASE: [number, number] = [300, 14]; // отскок после перетяга за край
const GLIDE: [number, number] = [420, 34]; // клавиатура / внешнее значение
const DROP_X: [number, number] = [260, 18]; // капля отстаёт — наклоняется
const PRESS: [number, number] = [520, 16];
const BLUR = 8;

// Геометрия как в исходнике: R — радиус бегунка, D — капли.
const R = 12;
const TR = 14;
const D = 18;
const OX = 40;
const OY = 80;
const CY = 16;
const RISE = -38;
const REST_DROP = 0.5;

interface Props {
  /** 0–1; null — ещё не выбрано (бегунок по центру, приглушён). */
  value: number | null;
  onChange: (v: number) => void;
  label: string;
  /** Подписи концов шкалы: [слева, справа]. */
  ends: [string, string];
  color: string;
}

/**
 * «Желейный» слайдер: бегунок тянется по скорости, при перетаскивании из него
 * выплывает капля с оценкой 0–10 и снова втекает при отпускании (SVG goo-фильтр).
 * За краями — резиновое сопротивление. Значение хранится непрерывно 0–1.
 */
export default function JellySlider({ value, onChange, label, ends, color }: Props) {
  const theme = useTheme();
  const fid = `goo-${useId().replace(/:/g, "")}`;
  const onColor = theme.palette.getContrastText(color);

  const railRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const hitRef = useRef<HTMLDivElement>(null);
  const marksRef = useRef<(HTMLElement | null)[]>([]);

  const st = useRef<{
    W: number;
    X: Spring;
    DX: Spring;
    DY: Spring;
    DS: Spring;
    PS: Spring;
    dragging: boolean;
    lifted: boolean;
    loop: ReturnType<typeof springLoop> | null;
  }>(null as never);
  if (!st.current) {
    const mk = (x: number, k: [number, number]) => {
      const s = spring(x);
      tune(s, k);
      return s;
    };
    st.current = {
      W: 0,
      X: mk(0, FOLLOW),
      DX: mk(0, DROP_X),
      DY: mk(CY, BUBBLE),
      DS: mk(REST_DROP, BUBBLE),
      PS: mk(1, PRESS),
      dragging: false,
      lifted: false,
      loop: null,
    };
  }

  const span = () => Math.max(st.current.W - 2 * R, 1);
  const toX = (v: number) => R + v * span();
  const toV = (x: number) => clamp((x - R) / span(), 0, 1);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  function render() {
    const s = st.current;
    const x = s.X.x;
    const v = toV(x);
    // Бегунок тянется вдоль трека со скоростью, площадь сохраняется.
    const stretch = 1 + Math.min(Math.abs(s.X.v) / 2400, 0.4);
    if (thumbRef.current)
      thumbRef.current.style.transform = `translate(${x - TR + OX}px,${CY - TR + OY}px) scale(${stretch * s.PS.x},${s.PS.x / stretch})`;
    const tilt = clamp((s.DX.x - s.X.x) * 0.9, -28, 28);
    const dTr = `translate(${s.DX.x - D}px,${s.DY.x - D}px) rotate(${tilt}deg) scale(${s.DS.x})`;
    if (dropRef.current) dropRef.current.style.transform = `translate(${OX}px,${OY}px) ${dTr}`;
    if (labelRef.current) {
      labelRef.current.style.transform = dTr;
      labelRef.current.style.opacity = String(clamp((s.DS.x - 0.7) / 0.25, 0, 1));
      labelRef.current.textContent = String(Math.round(v * 10));
    }
    if (fillRef.current) fillRef.current.style.width = `${clamp(x, 0, s.W) * clamp((x - R) / R, 0, 1)}px`;
    if (hitRef.current) {
      hitRef.current.style.left = `${x - R}px`;
      hitRef.current.setAttribute("aria-valuenow", String(Math.round(v * 10)));
    }
    const lit = Math.round(v * 10);
    marksRef.current.forEach((m, i) => m?.classList.toggle("on", i <= lit && lit > 0));
  }
  const renderRef = useRef(render);
  renderRef.current = render;

  function kick() {
    const s = st.current;
    s.loop ??= springLoop(
      () => {
        s.DX.t = s.X.x; // капля догоняет бегунок
        return [s.X, s.DX, s.DY, s.DS, s.PS];
      },
      () => renderRef.current(),
    );
    s.loop.kick();
  }

  function sync() {
    const s = st.current;
    const up = s.dragging || s.lifted;
    s.DY.t = up ? CY + RISE : CY;
    s.DS.t = up ? 1 : REST_DROP;
    s.PS.t = s.dragging ? 1.16 : 1;
    kick();
  }

  const rubber = (x: number, min: number, max: number, d = 18) =>
    x < min
      ? min - (1 - 1 / (((min - x) * 0.55) / d + 1)) * d
      : x > max
        ? max + (1 - 1 / (((x - max) * 0.55) / d + 1)) * d
        : x;
  const localX = (e: React.PointerEvent) => e.clientX - (railRef.current?.getBoundingClientRect().left ?? 0);

  function drag(e: React.PointerEvent) {
    const s = st.current;
    s.X.t = rubber(localX(e), R, s.W - R);
    onChangeRef.current(toV(s.X.t));
    kick();
  }

  useLayoutEffect(() => {
    const rail = railRef.current;
    const measure = () => {
      const s = st.current;
      const w = rail?.clientWidth ?? 0;
      if (!w || w === s.W) return;
      const ratio = s.W ? toV(s.X.t) : (value ?? 0.5);
      s.W = w;
      s.X.x = s.X.t = s.DX.x = s.DX.t = toX(ratio);
      s.X.v = s.DX.v = 0;
      render();
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (rail) ro.observe(rail);
    return () => {
      ro.disconnect();
      st.current.loop?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Значение поменяли снаружи (другой экран, синхронизация) — плавно едем.
  useEffect(() => {
    const s = st.current;
    if (s.dragging || !s.W || value == null) return;
    if (Math.abs(toV(s.X.t) - value) < 0.005) return;
    tune(s.X, GLIDE);
    s.X.t = toX(value);
    kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const muted = value == null;

  return (
    <Box sx={{ py: 1 }}>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <filter id={fid} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={BLUR} result="b" />
          <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="g" />
          <feComposite in="SourceGraphic" in2="g" operator="atop" />
        </filter>
      </svg>
      <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>{label}</Typography>
      <Box
        ref={railRef}
        onPointerDown={(e) => {
          const s = st.current;
          s.dragging = true;
          try {
            railRef.current?.setPointerCapture(e.pointerId);
          } catch {
            /* ок */
          }
          tune(s.X, FOLLOW);
          drag(e);
          sync();
        }}
        onPointerMove={(e) => st.current.dragging && drag(e)}
        onPointerUp={() => {
          const s = st.current;
          if (!s.dragging) return;
          s.dragging = false;
          tune(s.X, RELEASE);
          s.X.t = clamp(s.X.t, R, s.W - R);
          onChangeRef.current(toV(s.X.t));
          sync();
        }}
        onPointerCancel={() => {
          st.current.dragging = false;
          sync();
        }}
        sx={{ position: "relative", height: 32, touchAction: "none", cursor: "pointer", opacity: muted ? 0.55 : 1, transition: "opacity .2s" }}
      >
        <Box sx={{ position: "absolute", left: 0, right: 0, top: 13, height: 6, borderRadius: 999, bgcolor: "action.selected", overflow: "hidden" }}>
          <Box ref={fillRef} sx={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 0, bgcolor: color, borderRadius: 999 }} />
        </Box>
        {/* goo-слой: бегунок и капля сливаются в одну жидкую форму */}
        <Box sx={{ position: "absolute", left: -OX, right: -OX, top: -OY, height: 140, filter: `url(#${fid})`, pointerEvents: "none" }}>
          <Box ref={dropRef} sx={{ position: "absolute", left: 0, top: 0, width: 36, height: 36, borderRadius: "50%", bgcolor: color, willChange: "transform" }} />
          <Box ref={thumbRef} sx={{ position: "absolute", left: 0, top: 0, width: 28, height: 28, borderRadius: "50%", bgcolor: color, willChange: "transform" }} />
        </Box>
        <Box
          ref={labelRef}
          sx={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 36,
            height: 36,
            display: "grid",
            placeItems: "center",
            fontSize: 12,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            color: onColor,
            pointerEvents: "none",
            willChange: "transform,opacity",
          }}
        />
        <Box
          ref={hitRef}
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={10}
          aria-valuetext={`${Math.round((value ?? 0.5) * 10)} — ${ends[0]} … ${ends[1]}`}
          onKeyDown={(e) => {
            const d = ({ ArrowRight: 0.1, ArrowUp: 0.1, ArrowLeft: -0.1, ArrowDown: -0.1 } as Record<string, number>)[e.key];
            if (d === undefined) return;
            e.preventDefault();
            const s = st.current;
            const next = clamp(Math.round((toV(s.X.t) + d) * 10) / 10, 0, 1);
            tune(s.X, GLIDE);
            s.X.t = toX(next);
            s.lifted = true;
            onChangeRef.current(next);
            sync();
          }}
          onBlur={() => {
            st.current.lifted = false;
            sync();
          }}
          sx={{ position: "absolute", top: 4, width: 24, height: 24, borderRadius: "50%", outline: "none", "&:focus-visible": { boxShadow: `0 0 0 3px ${alpha(color, 0.5)}` } }}
        />
      </Box>
      {/* Шкала: метка на каждый балл, длинные на 0/5/10; пройденные светятся */}
      <Box sx={{ position: "relative", height: 8, mt: 1 }} aria-hidden>
        {Array.from({ length: 11 }, (_, i) => (
          <Box
            key={i}
            component="i"
            ref={(el: HTMLElement | null) => void (marksRef.current[i] = el)}
            sx={{
              position: "absolute",
              top: 0,
              left: `calc(${R}px + (100% - ${2 * R}px) * ${i / 10})`,
              width: "1.5px",
              ml: "-0.75px",
              height: i % 5 === 0 ? 8 : 4,
              borderRadius: "1px",
              bgcolor: i % 5 === 0 ? "text.disabled" : "action.selected",
              transition: "background-color .2s ease",
              "&.on": { bgcolor: i % 5 === 0 ? "text.primary" : "text.secondary" },
            }}
          />
        ))}
      </Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.75 }}>
        <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>{ends[0]}</Typography>
        <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>{ends[1]}</Typography>
      </Box>
    </Box>
  );
}
