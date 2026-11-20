import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { clamp, spring, springLoop, tune, type Spring } from "../lib/spring";
import { useT } from "../lib/i18n";

// Пружины — из Stat Card (designbookmark.com/motion): точки графика 200/17
// по очереди через 30 мс, цифры 160/22, плашка переключателя 380/30.
const POINT: [number, number] = [200, 17];
const NUMBER: [number, number] = [160, 22];
const PILL: [number, number] = [380, 30];
const STAGGER_MS = 30;
/** Ряд пересэмплирован в фиксированное число точек — так пружины переезжают между диапазонами. */
const N = 24;
const H = 96;

export interface StatRange {
  key: string;
  label: string;
}

interface Props {
  label: string;
  /** Главная цифра (последнее значение в диапазоне). */
  value: number | null;
  format: (v: number) => string;
  /** Изменение за диапазон. null — не показывать. */
  delta: number | null;
  /** Единица изменения: по умолчанию «%», для веса тела — « кг». */
  deltaSuffix?: string;
  /** Рост — это хорошо (для веса тела не обязательно: тогда чип нейтральный). */
  upIsGood?: boolean;
  /** Значения по порядку дат. */
  values: number[];
  firstLabel?: string;
  lastLabel?: string;
  ranges: StatRange[];
  range: string;
  onRange: (key: string) => void;
  /** Свой график вместо линии (например, «вес + повторы»). */
  custom?: ReactNode;
}

function resample(values: number[]): number[] {
  if (values.length === 0) return Array(N).fill(0);
  const lo0 = Math.min(...values);
  const hi0 = Math.max(...values);
  const span = hi0 - lo0 || Math.abs(hi0) || 1;
  const lo = lo0 - span * 0.15;
  const hi = hi0 + span * 0.15;
  const norm = (v: number) => (v - lo) / (hi - lo);
  if (values.length === 1) return Array(N).fill(norm(values[0]));
  return Array.from({ length: N }, (_, k) => {
    const pos = (k / (N - 1)) * (values.length - 1);
    const i = Math.floor(pos);
    const f = pos - i;
    const a = values[i];
    const b = values[Math.min(i + 1, values.length - 1)];
    return norm(a + (b - a) * f);
  });
}

/**
 * Карточка показателя: подпись, крупная цифра, чип изменения, плавный
 * график с заливкой и переключатель диапазона. При смене диапазона плашка
 * переезжает, цифры «докручиваются», а точки графика по очереди пружинят
 * к новой высоте.
 */
export default function StatCard({
  label,
  value,
  format,
  delta,
  upIsGood = true,
  deltaSuffix = "%",
  values,
  firstLabel,
  lastLabel,
  ranges,
  range,
  onRange,
  custom,
}: Props) {
  const theme = useTheme();
  const t = useT();
  const green = theme.palette.primary.main;
  const gid = `stat-${useId().replace(/:/g, "")}`;
  const svgRef = useRef<SVGSVGElement>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const fillRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const bigRef = useRef<HTMLParagraphElement>(null);
  const deltaRef = useRef<HTMLSpanElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const segBtns = useRef<(HTMLButtonElement | null)[]>([]);
  const fmtRef = useRef(format);
  fmtRef.current = format;

  const st = useRef<{
    pts: Spring[];
    val: Spring;
    dv: Spring;
    px: Spring;
    pw: Spring;
    timers: number[];
    width: number;
    loop: ReturnType<typeof springLoop> | null;
  }>(null as never);
  if (!st.current) {
    const mk = (k: [number, number]) => {
      const s = spring(0);
      tune(s, k);
      return s;
    };
    st.current = {
      pts: Array.from({ length: N }, () => mk(POINT)),
      val: mk(NUMBER),
      dv: mk(NUMBER),
      px: mk(PILL),
      pw: mk(PILL),
      timers: [],
      width: 0,
      loop: null,
    };
  }

  function render() {
    const s = st.current;
    const W = s.width;
    if (bigRef.current) bigRef.current.textContent = value == null ? "—" : fmtRef.current(Math.max(0, s.val.x));
    if (deltaRef.current && delta != null) {
      const d = s.dv.x;
      deltaRef.current.textContent = `${d > 0.05 ? "+" : d < -0.05 ? "−" : ""}${Math.abs(d).toFixed(1).replace(".", t(",", "."))}${deltaSuffix}`;
    }
    if (pillRef.current) {
      pillRef.current.style.transform = `translateX(${s.px.x.toFixed(2)}px)`;
      pillRef.current.style.width = `${s.pw.x.toFixed(2)}px`;
    }
    if (!W || !lineRef.current || !fillRef.current) return;
    svgRef.current?.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const xy = s.pts.map((p, i) => [4 + (i / (N - 1)) * (W - 8), 8 + (1 - clamp(p.x, -0.05, 1.05)) * (H - 16)]);
    let d = `M${xy[0][0].toFixed(2)} ${xy[0][1].toFixed(2)}`;
    for (let i = 0; i < N - 1; i++) {
      const p0 = xy[i - 1] || xy[i];
      const p1 = xy[i];
      const p2 = xy[i + 1];
      const p3 = xy[i + 2] || p2;
      d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(2)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(2)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(2)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
    }
    lineRef.current.setAttribute("d", d);
    fillRef.current.setAttribute("d", `${d} L${xy[N - 1][0].toFixed(2)} ${H} L${xy[0][0].toFixed(2)} ${H} Z`);
    if (dotRef.current) {
      const [lx, ly] = xy[N - 1];
      dotRef.current.style.transform = `translate(${(lx - 4.5).toFixed(2)}px,${(ly - 4.5).toFixed(2)}px)`;
    }
  }

  const renderRef = useRef(render);
  renderRef.current = render;

  function kick() {
    const s = st.current;
    s.loop ??= springLoop(() => [...s.pts, s.val, s.dv, s.px, s.pw], () => renderRef.current());
    s.loop.kick();
  }

  // Плашка переключателя под выбранной кнопкой.
  function placePill(jump: boolean) {
    const s = st.current;
    const i = ranges.findIndex((r) => r.key === range);
    const b = segBtns.current[i];
    if (!b) return;
    s.px.t = b.offsetLeft;
    s.pw.t = b.offsetWidth;
    if (jump || !s.pw.x) {
      s.px.x = s.px.t;
      s.pw.x = s.pw.t;
    }
    kick();
  }

  useLayoutEffect(() => {
    const el = wrapRef.current;
    const measure = () => {
      st.current.width = el?.clientWidth ?? 0;
      placePill(true);
      render();
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (el) ro.observe(el);
    return () => {
      ro.disconnect();
      st.current.loop?.stop();
      st.current.timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => placePill(false), [range]); // eslint-disable-line react-hooks/exhaustive-deps

  // Новые данные: цифры докручиваются, точки слева направо переезжают.
  const sig = values.join(",");
  useEffect(() => {
    const s = st.current;
    s.val.t = value ?? 0;
    s.dv.t = delta ?? 0;
    s.timers.forEach(clearTimeout);
    const target = resample(values);
    s.timers = target.map((v, k) =>
      window.setTimeout(() => {
        s.pts[k].t = v;
        kick();
      }, k * STAGGER_MS),
    );
    kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, value, delta]);

  const good = delta != null && (upIsGood ? delta > 0.5 : false);

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary", lineHeight: "18px" }}>{label}</Typography>
          <Typography
            ref={bigRef}
            sx={{ fontSize: 32, lineHeight: "40px", fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}
          >
            {value == null ? "—" : format(0)}
          </Typography>
        </Box>
        {delta != null && (
          <Box
            component="span"
            ref={deltaRef}
            sx={{
              px: 1.1,
              py: 0.5,
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
              bgcolor: good ? alpha(green, 0.16) : "action.hover",
              color: good ? "primary.main" : "text.secondary",
            }}
          />
        )}
      </Box>

      <Box sx={{ my: 1.75 }}>
        {custom ?? (
          <>
            <Box ref={wrapRef} sx={{ position: "relative" }}>
              {values.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ height: H, display: "grid", placeItems: "center" }}>
                  {t("В этом диапазоне нет данных.", "No data in this range.")}
                </Typography>
              ) : null}
              <Box
                component="svg"
                ref={svgRef}
                aria-hidden
                viewBox={`0 0 320 ${H}`}
                sx={{ display: values.length ? "block" : "none", width: "100%", height: H, overflow: "visible" }}
              >
                <defs>
                  <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={green} stopOpacity={0.32} />
                    <stop offset="1" stopColor={green} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <path ref={fillRef} fill={`url(#${gid})`} />
                <path ref={lineRef} fill="none" stroke={green} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              </Box>
              {values.length > 0 && (
                <Box
                  component="span"
                  ref={dotRef}
                  sx={{ position: "absolute", left: 0, top: 0, width: 9, height: 9, borderRadius: "50%", bgcolor: green, willChange: "transform" }}
                />
              )}
            </Box>
            {values.length > 0 && (firstLabel || lastLabel) && (
              <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.75 }}>
                <Typography sx={{ fontSize: 11 }} color="text.secondary">{firstLabel}</Typography>
                <Typography sx={{ fontSize: 11 }} color="text.secondary">{lastLabel}</Typography>
              </Box>
            )}
          </>
        )}
      </Box>

      <Box sx={{ position: "relative", display: "flex", p: "3px", borderRadius: 999, bgcolor: "action.hover" }}>
        <Box
          component="span"
          ref={pillRef}
          sx={{
            position: "absolute",
            left: 0,
            top: 3,
            bottom: 3,
            borderRadius: 999,
            bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === "dark" ? 0.14 : 0.1),
            willChange: "transform,width",
          }}
        />
        {ranges.map((r, i) => (
          <Box
            key={r.key}
            component="button"
            ref={(el: HTMLButtonElement | null) => void (segBtns.current[i] = el)}
            onClick={() => onRange(r.key)}
            aria-pressed={r.key === range}
            sx={{
              position: "relative",
              zIndex: 1,
              flex: 1,
              py: "7px",
              border: 0,
              bgcolor: "transparent",
              cursor: "pointer",
              font: "inherit",
              fontSize: 13,
              fontWeight: 600,
              color: r.key === range ? "text.primary" : "text.secondary",
              transition: "color .2s",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {r.label}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
