import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Box, ButtonBase, Switch, Typography } from "@mui/material";
import { CheckRounded, ChevronLeft, ChevronRight } from "./icons";
import { spring, springLoop, tune, type Spring } from "../lib/spring";
import { motion, radius } from "./tokens";

// Тайминги Stack Panel (Kokonut UI): пружина без отскока 0,42 с на открытие,
// 0,34 с на возврат; нижняя страница сдвигается на треть (параллакс).
// Пружина «duration d, bounce 0» ≈ жёсткость (2π/d)², критическое затухание.
const springFor = (d: number): [number, number] => {
  const k = (2 * Math.PI / d) ** 2;
  return [k, 2 * Math.sqrt(k)];
};
const PUSH = springFor(0.42);
const POP = springFor(0.34);
const PARALLAX = 0.3;
const POP_DISTANCE = 0.35;
const POP_VELOCITY = 0.5; // px/мс

export interface StackRow {
  id: string;
  label: string;
  /** Серый текст справа — текущее значение. */
  detail?: string;
  /** Какую страницу открывает строка. */
  to?: string;
  onSelect?: () => void;
  /** Галочка — строка выбирает один вариант раздела. */
  selected?: boolean;
  /** Переключатель в этом состоянии. */
  checked?: boolean;
  /** Что-то своё справа. */
  trailing?: ReactNode;
  /** Иконка слева. */
  icon?: ReactNode;
  tone?: "default" | "danger";
}

export interface StackSection {
  title?: string;
  rows: StackRow[];
  footer?: string;
}

export interface StackPage {
  title: string;
  sections: StackSection[];
}

/**
 * Панель с вложенными страницами, как настройки в телефоне (Stack Panel,
 * Kokonut UI). Строка открывает свою страницу справа, а её подпись улетает
 * в заголовок; назад — кнопкой, свайпом вправо или Escape.
 */
export default function StackPanel({
  pages,
  root,
  bare = false,
  onClose,
  closeLabel = "Готово",
}: {
  pages: Record<string, StackPage>;
  root: string;
  /** Без своей рамки — когда панель живёт внутри окна-шторки. */
  bare?: boolean;
  /** Кнопка «Готово» справа в шапке. */
  onClose?: () => void;
  closeLabel?: string;
}) {
  const [stack, setStack] = useState<string[]>([root]);
  const [height, setHeight] = useState<number | "auto">("auto");
  const [titleFrom, setTitleFrom] = useState<{ dx: number; dy: number; scale: number } | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);

  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const underRef = useRef<HTMLDivElement>(null);
  const shadeRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  const st = useRef<{ x: Spring; width: number; busy: boolean; loop: ReturnType<typeof springLoop> | null; done: (() => void) | null }>(
    null as never,
  );
  if (!st.current) st.current = { x: spring(0), width: 360, busy: false, loop: null, done: null };

  const top = stack[stack.length - 1];
  const under = stack.length > 1 ? stack[stack.length - 2] : null;

  function paint() {
    const { x, width } = st.current;
    const v = Math.max(0, x.x);
    if (topRef.current) topRef.current.style.transform = `translate3d(${v}px,0,0)`;
    if (underRef.current) underRef.current.style.transform = `translate3d(${-PARALLAX * (width - v)}px,0,0)`;
    if (shadeRef.current) shadeRef.current.style.opacity = String(0.06 * (1 - v / width));
  }
  const paintRef = useRef(paint);
  paintRef.current = paint;

  function animateX(to: number, cfg: [number, number], done?: () => void) {
    const s = st.current;
    tune(s.x, cfg);
    s.x.t = to;
    s.done = done ?? null;
    s.loop ??= springLoop(
      () => [s.x],
      () => {
        paintRef.current();
        // Пружина успокоилась — завершаем переход.
        if (Math.abs(s.x.x - s.x.t) < 0.01 && Math.abs(s.x.v) < 0.01 && s.done) {
          const d = s.done;
          s.done = null;
          d();
        }
      },
    );
    s.loop.kick();
  }

  // Ширина — для параллакса и порога свайпа.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const ro = new ResizeObserver(() => (st.current.width = body.clientWidth || 360));
    ro.observe(body);
    return () => {
      ro.disconnect();
      st.current.loop?.stop();
    };
  }, []);

  // Высота панели следует за верхней страницей.
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    setHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, [top, stack.length]);

  // Заголовок: при открытии из строки прилетает с места её подписи, иначе
  // слегка сдвигается и проявляется.
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (titleFrom && !reduce) {
      el.animate(
        [
          { transform: `translate(${titleFrom.dx}px, ${titleFrom.dy}px) scale(${titleFrom.scale})` },
          { transform: "translate(0, 0) scale(1)" },
        ],
        { duration: 420, easing: motion.easeOut, fill: "backwards" },
      );
    } else {
      el.animate(
        [
          { opacity: 0, transform: `translateX(${dir * 24}px)` },
          { opacity: 1, transform: "translateX(0)" },
        ],
        { duration: reduce ? 0 : 280, easing: motion.easeOut },
      );
    }
  }, [top, stack.length, titleFrom, dir]);

  function push(row: StackRow, label: HTMLElement | null) {
    row.onSelect?.();
    const s = st.current;
    if (!row.to || !pages[row.to] || s.busy) return;
    // Откуда лететь заголовку: подпись строки → центр шапки.
    const panel = panelRef.current?.getBoundingClientRect();
    const head = titleRef.current?.getBoundingClientRect();
    if (panel && head && label) {
      const r = label.getBoundingClientRect();
      const fs = parseFloat(getComputedStyle(label).fontSize);
      const ownFs = parseFloat(getComputedStyle(titleRef.current!).fontSize);
      // Шапка центрирована; новый заголовок той же ширины, что и подпись (примерно).
      const targetLeft = panel.left + (panel.width - r.width * (ownFs / fs)) / 2;
      setTitleFrom({ dx: r.left - targetLeft, dy: r.top + r.height / 2 - (head.top + head.height / 2), scale: fs / ownFs });
    } else setTitleFrom(null);
    setDir(1);
    s.busy = true;
    s.x.x = s.width;
    s.x.v = 0;
    setStack((prev) => [...prev, row.to as string]);
    requestAnimationFrame(() => {
      paintRef.current();
      animateX(0, PUSH, () => (st.current.busy = false));
    });
  }

  function pop() {
    const s = st.current;
    if (stack.length < 2 || s.busy) return;
    s.busy = true;
    setTitleFrom(null);
    animateX(s.width, POP, () => {
      setDir(-1);
      setStack((prev) => prev.slice(0, -1));
      s.x.x = s.x.t = 0;
      s.x.v = 0;
      s.busy = false;
      requestAnimationFrame(() => paintRef.current());
    });
  }

  // Свайп вправо по верхней странице — назад; за краем — сопротивление.
  const drag = useRef<{ id: number; x0: number; y0: number; axis: "none" | "x" | "y"; pts: { x: number; t: number }[] } | null>(null);
  function onPointerDown(e: React.PointerEvent) {
    if (stack.length < 2 || st.current.busy) return;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, axis: "none", pts: [{ x: e.clientX, t: e.timeStamp }] };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (d.axis === "none") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.axis = Math.abs(dx) > Math.abs(dy) && dx > 0 ? "x" : "y";
      if (d.axis === "x") (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (d.axis !== "x") return;
    d.pts = [...d.pts.slice(-4), { x: e.clientX, t: e.timeStamp }];
    const s = st.current;
    s.x.x = s.x.t = Math.max(0, dx);
    s.x.v = 0;
    paintRef.current();
  }
  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || d.axis !== "x") return;
    const a = d.pts[0];
    const b = d.pts[d.pts.length - 1];
    const v = b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0;
    const s = st.current;
    if (s.x.x > s.width * POP_DISTANCE || v > POP_VELOCITY) pop();
    else animateX(0, PUSH);
  }

  return (
    <Box
      ref={panelRef}
      onKeyDown={(e) => {
        if (e.key === "Escape" && stack.length > 1) {
          e.preventDefault();
          pop();
        }
      }}
      sx={{
        position: "relative",
        overflow: "hidden",
        borderRadius: bare ? 0 : radius.card,
        border: bare ? "none" : "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      {/* Шапка: «назад» с названием родителя и заголовок по центру */}
      <Box sx={{ position: "relative", zIndex: 2, height: 48, display: "flex", alignItems: "center", px: 1, borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
        {under && (
          <ButtonBase
            onClick={pop}
            sx={{ position: "relative", zIndex: 1, maxWidth: "32%", display: "flex", alignItems: "center", borderRadius: "10px", py: 0.75, pl: 0.25, pr: 1, color: "text.secondary", fontSize: 14 }}
          >
            <ChevronLeft sx={{ fontSize: 20 }} />
            <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {pages[under].title}
            </Box>
          </ButtonBase>
        )}
        <Typography
          component="span"
          ref={titleRef}
          key={`${top}-${stack.length}`}
          sx={{
            position: "absolute",
            left: 0,
            right: 0,
            mx: "auto",
            width: "fit-content",
            maxWidth: "55%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 15,
            fontWeight: 600,
            transformOrigin: "left center",
          }}
        >
          {pages[top].title}
        </Typography>
        {onClose && (
          <ButtonBase
            onClick={onClose}
            sx={{ position: "relative", zIndex: 1, ml: "auto", borderRadius: "10px", py: 0.75, px: 1, fontSize: 14, fontWeight: 600, color: "primary.main" }}
          >
            {closeLabel}
          </ButtonBase>
        )}
      </Box>

      {/* Тело: нижняя страница с параллаксом, верхняя — сверху и тянется пальцем */}
      <Box
        ref={bodyRef}
        sx={{ position: "relative", height, transition: `height 380ms ${motion.easeOut}`, overflow: "hidden" }}
      >
        {under && (
          <Box ref={underRef} aria-hidden inert key={`${under}-${stack.length - 1}`} sx={{ position: "absolute", left: 0, right: 0, top: 0, pointerEvents: "none" }}>
            <PageView page={pages[under]} onOpen={() => undefined} />
            <Box ref={shadeRef} sx={{ position: "absolute", inset: 0, bgcolor: "#000", opacity: 0 }} />
          </Box>
        )}
        <Box
          ref={topRef}
          key={`${top}-${stack.length}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          sx={{
            position: "relative",
            bgcolor: "background.paper",
            touchAction: stack.length > 1 ? "pan-y" : "auto",
            boxShadow: stack.length > 1 ? "-8px 0 24px -12px rgba(0,0,0,0.25)" : "none",
            willChange: "transform",
          }}
        >
          <Box ref={measureRef}>
            <PageView page={pages[top]} onOpen={push} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function PageView({ page, onOpen }: { page: StackPage; onOpen: (row: StackRow, label: HTMLElement | null) => void }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, px: 1.5, pt: 1.5, pb: 2 }}>
      {page.sections.map((section, i) => (
        <Box component="section" key={i}>
          {section.title && (
            <Typography sx={{ mb: 0.75, px: 1.5, fontSize: 12, fontWeight: 600, color: "text.secondary" }}>{section.title}</Typography>
          )}
          <Box
            component="ul"
            sx={{
              m: 0,
              p: 0,
              listStyle: "none",
              overflow: "hidden",
              borderRadius: radius.tile,
              bgcolor: "action.hover",
              "& > li + li": { borderTop: "1px solid", borderColor: "divider" },
            }}
          >
            {section.rows.map((row) => (
              <li key={row.id}>
                <RowView row={row} onOpen={onOpen} />
              </li>
            ))}
          </Box>
          {section.footer && (
            <Typography sx={{ mt: 0.75, px: 1.5, fontSize: 12, lineHeight: 1.45, color: "text.disabled" }}>{section.footer}</Typography>
          )}
        </Box>
      ))}
    </Box>
  );
}

function RowView({ row, onOpen }: { row: StackRow; onOpen: (row: StackRow, label: HTMLElement | null) => void }) {
  const labelRef = useRef<HTMLSpanElement>(null);
  const interactive = Boolean(row.to || row.onSelect);
  const content = (
    <>
      {row.icon}
      <Box
        component="span"
        ref={labelRef}
        sx={{ flex: 1, minWidth: 0, textAlign: "left", fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: row.tone === "danger" ? "error.main" : "text.primary" }}
      >
        {row.label}
      </Box>
      {row.detail && (
        <Box component="span" sx={{ maxWidth: "45%", flex: "none", fontSize: 14, color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.detail}
        </Box>
      )}
      {row.trailing}
      {row.checked !== undefined && <Switch checked={row.checked} tabIndex={-1} sx={{ my: -1, mr: -1, pointerEvents: "none" }} />}
      {row.selected !== undefined && (
        <CheckRounded sx={{ fontSize: 18, flex: "none", color: "primary.main", visibility: row.selected ? "visible" : "hidden" }} />
      )}
      {row.to && <ChevronRight sx={{ fontSize: 18, flex: "none", mr: -0.5, color: "text.disabled" }} />}
    </>
  );
  const base = { width: "100%", minHeight: 48, display: "flex", alignItems: "center", gap: 1.25, px: 1.5, py: 1 } as const;
  if (!interactive) return <Box sx={base}>{content}</Box>;
  return (
    <ButtonBase
      onClick={() => onOpen(row, labelRef.current)}
      role={row.checked !== undefined ? "switch" : undefined}
      aria-checked={row.checked}
      aria-pressed={row.selected}
      sx={{ ...base, justifyContent: "flex-start", transition: `background-color ${motion.press}ms ease`, "&:active": { bgcolor: "action.selected" } }}
    >
      {content}
    </ButtonBase>
  );
}
