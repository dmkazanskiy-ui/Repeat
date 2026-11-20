import { useLayoutEffect, useRef, useState } from "react";
import { Box, ButtonBase, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { ExpandMoreRounded, TrendingDownRounded, TrendingUpRounded } from "../../ui/icons";
import NumberTicker from "../NumberTicker";
import { Card, radius } from "../../ui";
import { spring, springLoop, tune, type Spring } from "../../lib/spring";

// Пружины Storage Meter (designbookmark.com/motion, tokens.css).
const SOFT: [number, number] = [260, 24]; // строки раскрываются
const POP: [number, number] = [520, 16]; // выбранный кусок полосы «вздувается»
const FADE: [number, number] = [420, 32]; // остальные приглушаются
const HL_Y: [number, number] = [300, 26]; // подсветка строки переезжает
const ROW = 44;

export interface MeterRow {
  id: string;
  label: string;
  color: string;
  /** Доля в полосе (например, число тренировок). */
  share: number;
  /** Справа в строке: «2 · 4 000 кг». */
  value: string;
  /** Что раскрывается по тапу. */
  details: { label: string; value: string }[];
}

interface Props {
  title: string;
  changePercent: number | null;
  changeLabel: string;
  total: number;
  totalWord: (n: number) => string;
  sub: string;
  rows: MeterRow[];
}

/**
 * Главная карточка аналитики в духе Storage Meter: крупный итог, полоса из
 * частей по видам тренировок и строки-виды. Тап по строке — её кусок полосы
 * вздувается, остальные тускнеют, а строка раскрывается подробностями.
 * Повторный тап сворачивает. Коротко сверху — подробно по запросу.
 */
export default function PeriodMeter({ title, changePercent, changeLabel, total, totalWord, sub, rows }: Props) {
  const theme = useTheme();
  const [sel, setSel] = useState<number | null>(null);
  const segRefs = useRef<(HTMLDivElement | null)[]>([]);
  const panRefs = useRef<(HTMLDivElement | null)[]>([]);
  const innerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const hlRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const n = rows.length;
  const st = useRef<{ W: Spring[]; H: Spring[]; O: Spring[]; P: Spring[]; HT: Spring; HO: Spring; loop: ReturnType<typeof springLoop> | null }>(null as never);
  if (!st.current || st.current.W.length !== n) {
    const mk = (v: number, k: [number, number]) => {
      const s = spring(v);
      tune(s, k);
      return s;
    };
    st.current = {
      W: rows.map(() => mk(0, SOFT)),
      H: rows.map(() => mk(1, POP)),
      O: rows.map(() => mk(1, FADE)),
      P: rows.map(() => mk(0, SOFT)),
      HT: mk(0, HL_Y),
      HO: mk(0, FADE),
      loop: null,
    };
  }

  function render() {
    const s = st.current;
    const bw = barRef.current?.clientWidth ?? 0;
    const sum = Math.max(1, rows.reduce((a, r) => a + r.share, 0));
    let x = 0;
    rows.forEach((_, i) => {
      const w = Math.max(0, (s.W[i].x / sum) * bw);
      const seg = segRefs.current[i];
      if (seg) {
        seg.style.width = `${Math.max(0, w - 3)}px`;
        seg.style.transform = `translateX(${x}px) scaleY(${Math.min(1.1, Math.max(0.5, 0.86 + 0.14 * s.H[i].x))})`;
        seg.style.opacity = String(Math.min(1, Math.max(0, s.O[i].x)));
      }
      x += w;
      const pan = panRefs.current[i];
      const inner = innerRefs.current[i];
      if (pan && inner) {
        const p = Math.min(1.04, Math.max(0, s.P[i].x));
        pan.style.height = `${inner.offsetHeight * p}px`;
        inner.style.opacity = String(Math.min(1, Math.max(0, s.P[i].x * 1.8 - 0.8)));
        inner.style.transform = `translateY(${(1 - Math.min(1, Math.max(0, s.P[i].x))) * -8}px)`;
      }
    });
    if (hlRef.current) {
      // Подсветка под выбранной строкой: её верх = сумма высот строк выше.
      hlRef.current.style.transform = `translateY(${s.HT.x}px)`;
      hlRef.current.style.opacity = String(Math.min(1, Math.max(0, s.HO.x)));
      const i = sel ?? 0;
      const inner = innerRefs.current[i];
      hlRef.current.style.height = `${ROW + (inner ? inner.offsetHeight * Math.min(1, Math.max(0, s.P[i].x)) : 0)}px`;
    }
  }
  const renderRef = useRef(render);
  renderRef.current = render;
  function kick() {
    const s = st.current;
    s.loop ??= springLoop(() => [...s.W, ...s.H, ...s.O, ...s.P, s.HT, s.HO], () => renderRef.current());
    s.loop.kick();
  }

  // Полоса заполняется при показе и при смене данных.
  const sig = rows.map((r) => r.share).join(",");
  useLayoutEffect(() => {
    rows.forEach((r, i) => (st.current.W[i].t = r.share));
    kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  useLayoutEffect(() => () => st.current.loop?.stop(), []);

  function pick(i: number) {
    const s = st.current;
    const next = sel === i ? null : i;
    setSel(next);
    rows.forEach((_, j) => {
      const on = j === next;
      s.P[j].t = on ? 1 : 0;
      s.O[j].t = next == null || on ? 1 : 0.32;
      if (on) s.H[j].x = Math.min(s.H[j].x, 0.5); // кусок «вздувается» из сжатия
    });
    // Подсветка: строки выше выбранной закрыты (кроме неё самой), так что верх = i·ROW.
    if (next != null) s.HT.t = next * ROW;
    s.HO.t = next == null ? 0 : 1;
    kick();
  }

  const up = (changePercent ?? 0) >= 0;

  return (
    <Card sx={{ mb: 2, px: 1, pt: 2, pb: 1 }}>
      {/* Шапка: название периода и изменение к прошлому */}
      <Box sx={{ display: "flex", alignItems: "center", px: 1.5, gap: 1 }}>
        <Typography sx={{ flex: 1, fontSize: 14, fontWeight: 600, color: "text.secondary" }}>{title}</Typography>
        {changePercent != null && (
          <Box
            component="span"
            title={changeLabel}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.25,
              px: 1,
              height: 24,
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              bgcolor: up ? alpha(theme.palette.primary.main, 0.14) : "action.hover",
              color: up ? "primary.main" : "text.secondary",
            }}
          >
            {up ? <TrendingUpRounded sx={{ fontSize: 15 }} /> : <TrendingDownRounded sx={{ fontSize: 15 }} />}
            {up ? "+" : ""}
            {Math.round(changePercent)}%
          </Box>
        )}
      </Box>

      {/* Крупный итог */}
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75, px: 1.5, pt: 0.5 }}>
        <Typography sx={{ fontSize: 34, lineHeight: "40px", fontWeight: 700, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>
          <NumberTicker value={total} format={(v) => String(Math.round(v))} />
        </Typography>
        <Typography sx={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>{totalWord(total)}</Typography>
        <Typography noWrap sx={{ fontSize: 13, color: "text.secondary", minWidth: 0 }}>
          {sub}
        </Typography>
      </Box>

      {/* Полоса из частей */}
      <Box ref={barRef} sx={{ position: "relative", height: 14, mx: 1.5, mt: 1.75, mb: 1.5, borderRadius: 999, bgcolor: "action.hover", overflow: "hidden" }} aria-hidden>
        {rows.map((r, i) => (
          <Box
            key={r.id}
            ref={(el: HTMLDivElement | null) => void (segRefs.current[i] = el)}
            sx={{ position: "absolute", left: 0, top: 0, height: 14, borderRadius: 999, bgcolor: r.color, willChange: "transform, width, opacity" }}
          />
        ))}
      </Box>

      {/* Строки по видам */}
      <Box sx={{ position: "relative" }}>
        <Box ref={hlRef} sx={{ position: "absolute", left: 0, right: 0, top: 0, height: ROW, borderRadius: radius.tile, bgcolor: "action.hover", opacity: 0, pointerEvents: "none" }} />
        {rows.map((r, i) => {
          const open = sel === i;
          return (
            <Box key={r.id} sx={{ position: "relative", zIndex: 1 }}>
              <ButtonBase
                onClick={() => pick(i)}
                aria-expanded={open}
                sx={{
                  width: "100%",
                  height: ROW,
                  px: 1.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  borderRadius: radius.tile,
                  justifyContent: "flex-start",
                  color: sel == null || open ? "text.primary" : "text.secondary",
                  transition: "color .2s",
                }}
              >
                <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: r.color, flex: "none", opacity: r.share > 0 ? 1 : 0.35 }} />
                <Typography sx={{ flex: 1, textAlign: "left", fontSize: 15, fontWeight: 500 }}>{r.label}</Typography>
                <Typography sx={{ fontSize: 14, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{r.value}</Typography>
                <ExpandMoreRounded sx={{ fontSize: 18, color: "text.disabled", transition: "transform .2s", transform: open ? "rotate(180deg)" : "none" }} />
              </ButtonBase>
              {/* Подробности вида */}
              <Box ref={(el: HTMLDivElement | null) => void (panRefs.current[i] = el)} sx={{ height: 0, overflow: "hidden" }}>
                <Box
                  ref={(el: HTMLDivElement | null) => void (innerRefs.current[i] = el)}
                  sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1, px: 1.5, pl: 4.25, pb: 1.5, opacity: 0 }}
                >
                  {r.details.map((d) => (
                    <Box key={d.label} sx={{ minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 11, color: "text.secondary" }}>
                        {d.label}
                      </Typography>
                      <Typography noWrap sx={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                        {d.value}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Card>
  );
}
