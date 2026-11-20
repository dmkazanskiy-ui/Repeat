import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Box, ButtonBase, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Add } from "../ui/icons";
import { spring, springLoop, tune, type Spring } from "../lib/spring";

// Пружины Goo Menu (designbookmark.com/motion, tokens.css).
const OUT: [number, number] = [230, 15]; // пузыри вылетают
const IN: [number, number] = [520, 34]; // возвращаются
const POP: [number, number] = [520, 16]; // «пружинка» кнопки
const ROT: [number, number] = [320, 20]; // поворот плюса в крестик
const STAGGER_MS = 45;
const RADIUS = 118;
const MAIN = 50;
const BUB = 46;

export interface GooAction {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
}

/**
 * Кнопка «+», из которой выливаются жидкие пузыри-действия (Goo Menu):
 * пузыри — пружины, SVG-фильтр сливает их, пока они рядом, поэтому они
 * отрываются как капли. Тап по пузырю — всё втягивается обратно и
 * запускается действие. Закрыть — повторный тап, тап мимо или Escape.
 */
export default function GooMenu({ actions, label }: { actions: GooAction[]; label: string }) {
  const theme = useTheme();
  const fid = `goo-${useId().replace(/:/g, "")}`;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const mainBlobRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLSpanElement>(null);
  const blobRefs = useRef<(HTMLDivElement | null)[]>([]);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Веер над кнопкой: от −155° до −25°.
  const n = actions.length;
  const home = actions.map((_, i) => {
    const deg = n === 1 ? -90 : -155 + (130 * i) / (n - 1);
    const a = (deg * Math.PI) / 180;
    return { x: Math.cos(a) * RADIUS, y: Math.sin(a) * RADIUS };
  });

  const st = useRef<{ sc: Spring; rot: Spring; bubs: { x: Spring; y: Spring; s: Spring }[]; timers: number[]; loop: ReturnType<typeof springLoop> | null }>(
    null as never,
  );
  if (!st.current || st.current.bubs.length !== n) {
    const mk = (v: number, k: [number, number]) => {
      const s = spring(v);
      tune(s, k);
      return s;
    };
    st.current = {
      sc: mk(1, POP),
      rot: mk(0, ROT),
      bubs: actions.map(() => ({ x: mk(0, OUT), y: mk(0, OUT), s: mk(0.5, [420, 22]) })),
      timers: [],
      loop: null,
    };
  }

  function render() {
    const s = st.current;
    if (mainBlobRef.current) mainBlobRef.current.style.transform = `translate(-50%, -50%) scale(${s.sc.x})`;
    if (plusRef.current) plusRef.current.style.transform = `rotate(${s.rot.x}deg)`;
    s.bubs.forEach((b, i) => {
      // Сплющивание по направлению полёта — как у капли.
      const sp = Math.hypot(b.x.v, b.y.v);
      const stretch = 1 + Math.min(sp / 2600, 0.32);
      const a = Math.atan2(b.y.v, b.x.v);
      const blob = blobRefs.current[i];
      if (blob) blob.style.transform = `translate(${b.x.x - BUB / 2}px, ${b.y.x - BUB / 2}px) rotate(${a}rad) scale(${b.s.x * stretch}, ${b.s.x / stretch})`;
      const btn = btnRefs.current[i];
      if (btn) {
        btn.style.transform = `translate(${b.x.x - BUB / 2}px, ${b.y.x - BUB / 2}px) scale(${b.s.x})`;
        btn.style.opacity = String(Math.min(1, Math.max(0, (Math.hypot(b.x.x, b.y.x) - 18) / 40)));
      }
    });
  }
  const renderRef = useRef(render);
  renderRef.current = render;

  function kick() {
    const s = st.current;
    s.loop ??= springLoop(
      () => [s.sc, s.rot, ...s.bubs.flatMap((b) => [b.x, b.y, b.s])],
      () => renderRef.current(),
    );
    s.loop.kick();
  }

  function setMenu(v: boolean) {
    if (v === open) return;
    setOpen(v);
    const s = st.current;
    s.timers.forEach(clearTimeout);
    s.rot.t = v ? 135 : 0;
    s.sc.v -= v ? 3 : 1.6;
    s.timers = s.bubs.map((b, i) =>
      window.setTimeout(
        () => {
          const k = v ? OUT : IN;
          tune(b.x, k);
          tune(b.y, k);
          b.x.t = v ? home[i].x : 0;
          b.y.t = v ? home[i].y : 0;
          b.s.t = v ? 1 : 0.5;
          tune(b.s, v ? [300, 14] : [420, 30]);
          kick();
        },
        (v ? i : n - 1 - i) * STAGGER_MS * (v ? 1 : 0.66),
      ),
    );
    kick();
  }

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => {
    st.current.loop?.stop();
    st.current.timers.forEach(clearTimeout);
  }, []);

  const green = theme.palette.primary.main;
  const on = theme.palette.primary.contrastText;

  return (
    <Box ref={rootRef} sx={{ position: "relative", width: MAIN, height: MAIN, mx: 0.5, flex: "none", zIndex: 5 }}>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <filter id={fid} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={9} result="b" />
          <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="g" />
          <feComposite in="SourceGraphic" in2="g" operator="atop" />
        </filter>
      </svg>

      {/* Жидкий слой: кнопка и пузыри сливаются фильтром */}
      <Box sx={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0, filter: `url(#${fid})`, pointerEvents: "none" }}>
        {actions.map((a, i) => (
          <Box
            key={a.id}
            ref={(el: HTMLDivElement | null) => void (blobRefs.current[i] = el)}
            sx={{ position: "absolute", left: 0, top: 0, width: BUB, height: BUB, borderRadius: "50%", bgcolor: green, willChange: "transform", transform: `translate(${-BUB / 2}px, ${-BUB / 2}px) scale(0.5)` }}
          />
        ))}
        <Box
          ref={mainBlobRef}
          sx={{ position: "absolute", left: 0, top: 0, width: MAIN, height: MAIN, borderRadius: "50%", bgcolor: green, transform: "translate(-50%, -50%)" }}
        />
      </Box>

      {/* Кнопки поверх жидкости */}
      <Box sx={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0 }}>
        {actions.map((a, i) => (
          <ButtonBase
            key={a.id}
            ref={(el: HTMLButtonElement | null) => void (btnRefs.current[i] = el)}
            aria-label={a.label}
            tabIndex={open ? 0 : -1}
            onClick={(e) => {
              e.stopPropagation();
              setMenu(false);
              window.setTimeout(a.onSelect, 160);
            }}
            sx={{
              position: "absolute",
              left: 0,
              top: 0,
              width: BUB,
              height: BUB,
              borderRadius: "50%",
              color: on,
              opacity: 0,
              pointerEvents: open ? "auto" : "none",
              "& svg": { fontSize: 22 },
            }}
          >
            {a.icon}
            {/* Подпись под пузырём — что он делает */}
            <Typography
              component="span"
              sx={{
                position: "absolute",
                top: "100%",
                mt: 0.5,
                left: "50%",
                transform: "translateX(-50%)",
                fontSize: 11,
                fontWeight: 600,
                whiteSpace: "nowrap",
                color: "text.primary",
                bgcolor: "background.paper",
                px: 0.75,
                py: 0.25,
                borderRadius: 999,
                boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                pointerEvents: "none",
              }}
            >
              {a.label}
            </Typography>
          </ButtonBase>
        ))}
        <ButtonBase
          aria-label={label}
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            setMenu(!open);
          }}
          sx={{ position: "absolute", left: -MAIN / 2, top: -MAIN / 2, width: MAIN, height: MAIN, borderRadius: "50%", color: on }}
        >
          <Box component="span" ref={plusRef} sx={{ display: "grid", placeItems: "center" }}>
            <Add />
          </Box>
        </ButtonBase>
      </Box>
    </Box>
  );
}
