import { Fragment, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { Box, IconButton } from "@mui/material";
import { DOCK, clamp, spring, springLoop, tune } from "../lib/spring";

export interface TabItem {
  key: string;
  label: string;
  icon: ReactNode;
}

interface Props {
  items: TabItem[];
  active: number;
  onChange: (index: number) => void;
  /** Круглая кнопка действия между вкладками (например, «+ тренировка»). */
  action?: { label: string; icon: ReactNode; onClick: () => void; /** Своя кнопка вместо круглой «+». */ node?: ReactNode };
  /** Перед какой вкладкой стоит кнопка действия. */
  actionAt?: number;
}

const BAR_H = 64;
const PILL_H = 44;
const PILL_MAX_W = 60;

/**
 * Таб-бар с «резиновой» пилюлей (по мотивам Rubber Dock). У пилюли два края —
 * две пружины: передний жёсткий, задний ленивый, поэтому при переходе между
 * вкладками она растягивается и догоняет сама себя. Под пилюлей иконки
 * инвертируются — второй слой иконок обрезан по её форме. Пилюлю можно
 * тянуть пальцем по бару, за краями она пружинит.
 */
export default function RubberTabBar({ items, active, onChange, action, actionAt = 2 }: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseIcons = useRef<(HTMLSpanElement | null)[]>([]);
  const topIcons = useRef<(HTMLSpanElement | null)[]>([]);

  // Всё изменяемое — в одном ref: анимация идёт мимо React, стилями напрямую.
  const st = useRef<{
    L: ReturnType<typeof spring>;
    R: ReturnType<typeof spring>;
    pops: ReturnType<typeof spring>[];
    centers: number[];
    pillW: number;
    width: number;
    active: number;
    placed: boolean;
    drag: { id: number; x0: number; last: number; live: boolean; dir: number } | null;
    suppressClick: boolean;
    loop: ReturnType<typeof springLoop> | null;
  }>(null as never);
  if (!st.current) {
    st.current = {
      L: spring(0),
      R: spring(0),
      pops: items.map(() => spring(1, ...DOCK.pop)),
      centers: [],
      pillW: 72,
      width: 0,
      active,
      placed: false,
      drag: null,
      suppressClick: false,
      loop: null,
    };
  }

  function render() {
    const s = st.current;
    const pill = pillRef.current;
    const top = topRef.current;
    if (!pill || !top) return;
    let l = s.L.x;
    let r = s.R.x;
    if (r < l) [l, r] = [r, l];
    const iw = Math.max(r - l, 24);
    // Площадь сохраняется: растянулась — стала тоньше.
    const ih = PILL_H * clamp(1 / Math.sqrt(iw / s.pillW), 0.66, 1.1);
    const y = (BAR_H - ih) / 2;
    pill.style.width = `${iw}px`;
    pill.style.height = `${ih}px`;
    pill.style.borderRadius = `${ih / 2}px`;
    pill.style.transform = `translate3d(${l}px,${y}px,0)`;
    top.style.clipPath = `inset(${y}px ${s.width - l - iw}px ${BAR_H - y - ih}px ${l}px round ${ih / 2}px)`;
    s.pops.forEach((p, i) => {
      const t = `scale(${p.x})`;
      const a = baseIcons.current[i];
      const b = topIcons.current[i];
      if (a) a.style.transform = t;
      if (b) b.style.transform = t;
    });
  }

  function kick() {
    const s = st.current;
    s.loop ??= springLoop(() => [s.L, s.R, ...s.pops], render);
    s.loop.kick();
  }

  function measure() {
    const s = st.current;
    const row = rowRef.current;
    if (!row) return;
    s.width = row.clientWidth;
    s.centers = tabRefs.current.map((b) => (b ? b.offsetLeft + b.offsetWidth / 2 : 0));
    const slot = tabRefs.current[0]?.offsetWidth ?? 72;
    s.pillW = Math.min(slot - 4, PILL_MAX_W);
    const c = s.centers[s.active] ?? 0;
    // Первая раскладка и смена ширины — без анимации.
    s.L.x = s.L.t = c - s.pillW / 2;
    s.R.x = s.R.t = c + s.pillW / 2;
    s.L.v = s.R.v = 0;
    s.placed = true;
    render();
  }

  function moveTo(center: number, dir: number, drag = false) {
    const s = st.current;
    const lead = drag ? DOCK.dragLead : DOCK.lead;
    const trail = drag ? DOCK.dragTrail : DOCK.trail;
    if (dir === 0) {
      tune(s.L, DOCK.still);
      tune(s.R, DOCK.still);
    } else {
      const [l, r] = dir > 0 ? [trail, lead] : [lead, trail];
      tune(s.L, l);
      tune(s.R, r);
    }
    s.L.t = center - s.pillW / 2;
    s.R.t = center + s.pillW / 2;
    kick();
  }

  function select(i: number, dirHint?: number) {
    const s = st.current;
    i = clamp(i, 0, items.length - 1);
    const c = s.centers[i] ?? 0;
    const dir = dirHint ?? Math.sign(c - (s.L.x + s.R.x) / 2);
    moveTo(c, dir);
    if (s.pops[i]) s.pops[i].v -= 3.2;
    s.active = i;
  }

  useLayoutEffect(() => {
    measure();
    const row = rowRef.current;
    if (!row) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(row);
    return () => {
      ro.disconnect();
      st.current.loop?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Вкладку переключили снаружи (баннер, кнопка на другом экране).
  useEffect(() => {
    if (active !== st.current.active && st.current.placed) select(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function choose(i: number, dirHint?: number) {
    select(i, dirHint);
    if (i !== active) onChange(i);
  }

  // ───── перетаскивание пилюли ─────
  const localX = (e: React.PointerEvent) => e.clientX - (rowRef.current?.getBoundingClientRect().left ?? 0);
  const rubber = (x: number, min: number, max: number, d = 46) =>
    x < min
      ? min - (1 - 1 / (((min - x) * 0.55) / d + 1)) * d
      : x > max
        ? max + (1 - 1 / (((x - max) * 0.55) / d + 1)) * d
        : x;

  function onPointerDown(e: React.PointerEvent) {
    st.current.drag = { id: e.pointerId, x0: e.clientX, last: localX(e), live: false, dir: 0 };
  }
  function onPointerMove(e: React.PointerEvent) {
    const s = st.current;
    const d = s.drag;
    if (!d || e.pointerId !== d.id) return;
    if (!d.live && Math.abs(e.clientX - d.x0) > 6) {
      d.live = true;
      rowRef.current?.setPointerCapture(e.pointerId);
    }
    if (!d.live) return;
    const raw = localX(e);
    const delta = raw - d.last;
    d.last = raw;
    if (Math.abs(delta) > 0.5) d.dir = Math.sign(delta);
    const first = s.centers[0] ?? 0;
    const lastC = s.centers[s.centers.length - 1] ?? 0;
    moveTo(rubber(raw, first, lastC), d.dir, true);
  }
  function endDrag(e: React.PointerEvent) {
    const s = st.current;
    const d = s.drag;
    if (!d || e.pointerId !== d.id) return;
    s.drag = null;
    if (!d.live) return;
    // Ближайшая вкладка с небольшим уклоном в сторону броска.
    const spacing = s.centers.length > 1 ? (s.centers[1] - s.centers[0]) : 0;
    const aim = (s.L.t + s.R.t) / 2 + d.dir * 0.18 * spacing;
    let best = 0;
    s.centers.forEach((c, i) => {
      if (Math.abs(c - aim) < Math.abs(s.centers[best] - aim)) best = i;
    });
    choose(best, d.dir || 0);
    s.suppressClick = true;
    setTimeout(() => (s.suppressClick = false), 0);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = clamp(active + (e.key === "ArrowRight" ? 1 : -1), 0, items.length - 1);
    choose(next);
    tabRefs.current[next]?.focus();
  }

  // Одна разметка на оба слоя: нижний — кнопки, верхний — инвертированная копия.
  const slots = (layer: "base" | "top") =>
    items.map((it, i) => (
      <Fragment key={it.key}>
        {action && i === actionAt && (
          layer === "base" ? (
            action.node ?? <IconButton
              onClick={() => !st.current.suppressClick && action.onClick()}
              aria-label={action.label}
              sx={{
                flex: "0 0 auto",
                mx: 0.5,
                width: 50,
                height: 50,
                borderRadius: "50%",
                zIndex: 2,
                bgcolor: "primary.main",
                color: "primary.contrastText",
                boxShadow: "0 6px 18px rgba(74,222,128,0.4)",
                "&:hover": { bgcolor: "primary.main" },
              }}
            >
              {action.icon}
            </IconButton>
          ) : (
            <Box sx={{ flex: "0 0 auto", mx: 0.5, width: 50, height: 50 }} />
          )
        )}
        <Box
          component={layer === "base" ? "button" : "div"}
          ref={layer === "base" ? (el: HTMLButtonElement | null) => void (tabRefs.current[i] = el) : undefined}
          {...(layer === "base"
            ? {
                role: "tab",
                "aria-selected": i === active,
                "aria-label": it.label,
                tabIndex: i === active ? 0 : -1,
                onClick: () => !st.current.suppressClick && choose(i),
              }
            : {})}
          sx={{
            flex: 1,
            minWidth: 0,
            height: BAR_H,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 0.25,
            border: "none",
            bgcolor: "transparent",
            color: "inherit",
            cursor: "inherit",
            fontFamily: "inherit",
            p: 0,
            outline: "none",
            "&:focus-visible": { boxShadow: "inset 0 0 0 2px", borderRadius: 3 },
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <Box
            component="span"
            ref={(el: HTMLSpanElement | null) =>
              void ((layer === "base" ? baseIcons : topIcons).current[i] = el)
            }
            sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.25, maxWidth: "100%", px: 0.5 }}
          >
            {it.icon}
          </Box>
        </Box>
      </Fragment>
    ));

  return (
    <Box
      ref={rowRef}
      role="tablist"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      sx={{ position: "relative", width: "100%", height: BAR_H, touchAction: "none", cursor: "pointer", userSelect: "none" }}
    >
      <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", color: "text.secondary" }}>
        {slots("base")}
      </Box>
      <Box
        ref={pillRef}
        sx={{
          position: "absolute",
          left: 0,
          top: 0,
          bgcolor: "text.primary",
          pointerEvents: "none",
          boxShadow: "0 6px 16px -6px rgba(0,0,0,0.5)",
          willChange: "transform,width,height",
        }}
      />
      <Box
        ref={topRef}
        aria-hidden
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          color: "background.default",
          pointerEvents: "none",
        }}
      >
        {slots("top")}
      </Box>
    </Box>
  );
}
