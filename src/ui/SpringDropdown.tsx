import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box, ButtonBase } from "@mui/material";
import { ExpandMoreRounded } from "./icons";
import { spring, springLoop, tune, type Spring } from "../lib/spring";
import { radius } from "./tokens";

// Пружины Spring Dropdown (designbookmark.com/motion).
const H_S: [number, number] = [300, 23]; // высота меню — с лёгким перелётом
const C_S: [number, number] = [300, 18]; // шеврон
const O_S: [number, number] = [400, 34]; // прозрачность меню
const TS_S: [number, number] = [500, 18]; // «нажатие» кнопки
const R_S: [number, number] = [340, 26]; // значение «въезжает» в кнопку
const LEAD: [number, number] = [620, 36]; // передний край подсветки
const TRAIL: [number, number] = [200, 20]; // задний — тянется
const HO_S: [number, number] = [400, 32];
const ROW_S: [number, number] = [300, 24]; // строки падают по очереди
const TICK_S: [number, number] = [260, 26]; // галочка рисуется
const ROW = 44;
const PAD = 6;
const GAP = 8;
const VISIBLE = 6; // больше — меню прокручивается

export interface DropOption {
  id: string;
  label: string;
  /** Серым справа: e1RM, число тренировок и т. п. */
  hint?: string;
  color?: string;
}

/**
 * Выпадающий список на пружинах: меню выпадает из-под кнопки с лёгким
 * перелётом, строки падают по очереди, подсветка тянется между строками,
 * у выбранной рисуется галочка, а новое значение въезжает в кнопку.
 * Длинный список прокручивается внутри меню.
 */
export default function SpringDropdown({
  options,
  value,
  onChange,
  label,
}: {
  options: DropOption[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<{ cur: string; prev: string | null }>({ cur: value, prev: null });
  const rootRef = useRef<HTMLDivElement>(null);
  const trigRef = useRef<HTMLButtonElement>(null);
  const chevRef = useRef<SVGSVGElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hlRef = useRef<HTMLDivElement>(null);
  const curRef = useRef<HTMLDivElement>(null);
  const prevRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tickRefs = useRef<(SVGPathElement | null)[]>([]);

  const n = options.length;
  const MH = PAD * 2 + ROW * Math.min(n, VISIBLE);
  const selIdx = Math.max(0, options.findIndex((o) => o.id === value));

  const st = useRef<{
    H: Spring; C: Spring; O: Spring; TS: Spring; R: Spring; HT: Spring; HB: Spring; HO: Spring;
    rows: { s: Spring; k: Spring }[]; hov: number; open: boolean; timers: number[];
    loop: ReturnType<typeof springLoop> | null;
  }>(null as never);
  const mk = (v: number, k: [number, number]) => {
    const s = spring(v);
    tune(s, k);
    return s;
  };
  if (!st.current) {
    st.current = {
      H: mk(0, H_S), C: mk(0, C_S), O: mk(0, O_S), TS: mk(1, TS_S), R: mk(1, R_S),
      HT: mk(PAD, LEAD), HB: mk(PAD + ROW, LEAD), HO: mk(0, HO_S),
      rows: [], hov: -1, open: false, timers: [], loop: null,
    };
  }
  // Пружины строк — по числу вариантов.
  while (st.current.rows.length < n) st.current.rows.push({ s: mk(0, ROW_S), k: mk(0, TICK_S) });

  function render() {
    const s = st.current;
    const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
    if (trigRef.current) trigRef.current.style.transform = `scale(${s.TS.x})`;
    if (chevRef.current) chevRef.current.style.transform = `rotate(${180 * s.C.x}deg)`;
    const menu = menuRef.current;
    if (menu) {
      const h = Math.max(0, s.H.x);
      menu.style.height = `${h}px`;
      menu.style.opacity = String(clamp(s.O.x, 0, 1));
      menu.style.visibility = h < 1 ? "hidden" : "visible";
      menu.style.pointerEvents = s.open ? "auto" : "none";
      menu.style.transform = `scaleX(${0.9 + 0.1 * clamp(s.H.x / MH, 0, 1.06)})`;
    }
    s.rows.slice(0, n).forEach((r, i) => {
      const el = rowRefs.current[i];
      if (el) {
        el.style.opacity = String(clamp(r.s.x, 0, 1));
        el.style.transform = `translateY(${(r.s.x - 1) * 14}px)`;
      }
      const tick = tickRefs.current[i];
      if (tick) tick.style.strokeDashoffset = String(22 * (1 - clamp(r.k.x, 0, 1)));
    });
    if (hlRef.current) {
      const ht = Math.min(s.HT.x, s.HB.x - 16);
      hlRef.current.style.height = `${Math.max(16, s.HB.x - ht)}px`;
      hlRef.current.style.transform = `translateY(${ht}px)`;
      hlRef.current.style.opacity = String(clamp(s.HO.x, 0, 1) * clamp(s.O.x, 0, 1));
    }
    if (curRef.current && prevRef.current) {
      curRef.current.style.opacity = String(clamp(s.R.x, 0, 1));
      curRef.current.style.transform = `translateY(${(1 - s.R.x) * 20}px)`;
      prevRef.current.style.opacity = String(clamp(1 - s.R.x, 0, 1));
      prevRef.current.style.transform = `translateY(${-s.R.x * 20}px)`;
    }
  }
  const renderRef = useRef(render);
  renderRef.current = render;
  function kick() {
    const s = st.current;
    s.loop ??= springLoop(() => [s.H, s.C, s.O, s.TS, s.R, s.HT, s.HB, s.HO, ...s.rows.flatMap((r) => [r.s, r.k])], () => renderRef.current());
    s.loop.kick();
  }

  function hover(i: number, snap = false) {
    const s = st.current;
    if (i === s.hov || i < 0 || i >= n) return;
    const top = PAD + i * ROW;
    if (snap || s.hov < 0) {
      s.HT.x = s.HT.t = top;
      s.HB.x = s.HB.t = top + ROW;
      s.HT.v = s.HB.v = 0;
    } else {
      const down = i > s.hov;
      tune(down ? s.HB : s.HT, LEAD);
      tune(down ? s.HT : s.HB, TRAIL);
      s.HT.t = top;
      s.HB.t = top + ROW;
    }
    s.hov = i;
    s.HO.t = 1;
    kick();
  }

  function setMenu(o: boolean) {
    const s = st.current;
    if (s.open === o) return;
    s.open = o;
    setOpen(o);
    s.H.t = o ? MH : 0;
    s.C.t = o ? 1 : 0;
    s.O.t = o ? 1 : 0;
    s.timers.forEach(clearTimeout);
    s.timers = s.rows.slice(0, n).map((r, i) =>
      window.setTimeout(() => {
        r.s.t = st.current.open ? 1 : 0;
        kick();
      }, o ? 50 + Math.min(i, VISIBLE) * 45 : Math.max(0, n - 1 - i) * 20),
    );
    if (o) {
      s.rows.forEach((r, i) => (r.k.x = r.k.t = i === selIdx ? 1 : 0));
      hover(selIdx, true);
      // Выбранная строка — в поле зрения, если список длинный.
      requestAnimationFrame(() => {
        if (listRef.current) listRef.current.scrollTop = Math.max(0, (selIdx - 2) * ROW);
      });
    } else {
      s.hov = -1;
      s.HO.t = 0;
    }
    kick();
  }

  function select(i: number) {
    const s = st.current;
    const id = options[i].id;
    s.rows.forEach((r, j) => (r.k.t = j === i ? 1 : 0));
    s.TS.x = 0.955;
    kick();
    if (id !== value) onChange(id);
    window.setTimeout(() => setMenu(false), 240);
  }

  // Значение сменилось — новое въезжает снизу, старое уходит вверх.
  useLayoutEffect(() => {
    if (value === shown.cur) return;
    setShown({ cur: value, prev: shown.cur });
    const s = st.current;
    s.R.x = 0;
    s.R.v = 0;
    s.R.t = 1;
    kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => {
    st.current.loop?.stop();
    st.current.timers.forEach(clearTimeout);
  }, []);

  const labelOf = (id: string | null) => options.find((o) => o.id === id);
  const slot = (opt: DropOption | undefined, refEl: React.RefObject<HTMLDivElement | null>, start: number) => (
    <Box ref={refEl} sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", gap: 1.25, minWidth: 0, opacity: start }}>
      {opt?.color && <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: opt.color, flex: "none" }} />}
      <Box component="span" sx={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {opt?.label ?? ""}
      </Box>
    </Box>
  );

  return (
    <Box ref={rootRef} sx={{ position: "relative", zIndex: open ? 10 : "auto" }}>
      <ButtonBase
        ref={trigRef}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          st.current.TS.x = 0.965;
          setMenu(!open);
        }}
        onKeyDown={(e) => {
          const s = st.current;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!s.open) setMenu(true);
            else hover(s.hov + (e.key === "ArrowDown" ? 1 : -1));
          } else if ((e.key === "Enter" || e.key === " ") && s.open && s.hov > -1) {
            e.preventDefault();
            select(s.hov);
          } else if (e.key === "Escape" && s.open) setMenu(false);
        }}
        sx={{ width: "100%", height: 48, display: "flex", alignItems: "center", gap: 1.25, pl: 2, pr: 1.5, borderRadius: radius.tile, bgcolor: "action.hover", justifyContent: "flex-start" }}
      >
        <Box sx={{ position: "relative", flex: 1, height: 48, overflow: "hidden", minWidth: 0 }}>
          {slot(labelOf(shown.prev), prevRef, 0)}
          {slot(labelOf(shown.cur), curRef, 1)}
        </Box>
        <ExpandMoreRounded ref={chevRef} sx={{ fontSize: 20, flex: "none", color: "text.secondary" }} />
      </ButtonBase>

      <Box
        ref={menuRef}
        role="listbox"
        aria-label={label}
        sx={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 48 + GAP,
          height: 0,
          borderRadius: "18px",
          overflow: "hidden",
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          boxShadow: "0 16px 40px -12px rgba(0,0,0,0.45)",
          transformOrigin: "50% 0",
          visibility: "hidden",
        }}
      >
        <Box ref={listRef} sx={{ position: "relative", height: "100%", overflowY: n > VISIBLE ? "auto" : "hidden", p: `${PAD}px` }}>
          <Box ref={hlRef} sx={{ position: "absolute", left: PAD, right: PAD, top: 0, borderRadius: "12px", bgcolor: "action.selected", opacity: 0, pointerEvents: "none" }} />
          {options.map((o, i) => (
            <Box
              key={o.id}
              ref={(el: HTMLDivElement | null) => void (rowRefs.current[i] = el)}
              role="option"
              aria-selected={o.id === value}
              onPointerEnter={() => hover(i)}
              onClick={() => select(i)}
              sx={{ position: "relative", zIndex: 1, height: ROW, display: "flex", alignItems: "center", gap: 1.25, pl: 1.5, pr: 1.25, borderRadius: "12px", cursor: "pointer", opacity: 0 }}
            >
              {o.color && <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: o.color, flex: "none" }} />}
              <Box component="span" sx={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {o.label}
              </Box>
              {o.hint && (
                <Box component="span" sx={{ fontSize: 12.5, color: "text.secondary", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {o.hint}
                </Box>
              )}
              <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
                <path ref={(el) => void (tickRefs.current[i] = el)} d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray={22} strokeDashoffset={22} />
              </svg>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
