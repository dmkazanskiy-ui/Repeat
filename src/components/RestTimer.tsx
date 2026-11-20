import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box, ButtonBase, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { CloseRounded as CloseRoundedIcon } from "../ui/icons";
import { TimerOutlined as TimerOutlinedIcon } from "../ui/icons";
import { CheckRounded as CheckRoundedIcon } from "../ui/icons";
import { useT } from "../lib/i18n";
import { MODE, ink } from "../lib/themeMode";
import { clamp, spring, springLoop, tune } from "../lib/spring";

interface Props {
  /** Метка времени (ms), когда отдых заканчивается. */
  endsAt: number;
  /** Цель отдыха в секундах — для кольца прогресса. */
  target: number;
  /** Акцент-цвет (по типу тренировки). */
  color: string;
  onAdjust: (deltaSec: number) => void;
  onSkip: () => void;
}

type Shape = "idle" | "compact" | "open";

// Пружины Morph Island (designbookmark.com/motion): ширина жёстче высоты —
// форма сначала «доезжает» вбок, потом опускается на место.
const W_SPRING: [number, number] = [380, 24];
const H_SPRING: [number, number] = [300, 22];
const PRESS: [number, number] = [520, 18];
const MAX_RADIUS = 32;

const OBJECT = MODE === "light" ? "#e6eaf0" : "#232a35";
const BTN = MODE === "light" ? "rgba(15,23,42,0.08)" : "rgba(238,242,247,0.1)";
const RING_C = 2 * Math.PI * 17;

const size = (s: Shape): [number, number] => {
  const vw = typeof window === "undefined" ? 400 : window.innerWidth;
  if (s === "idle") return [126, 36];
  if (s === "compact") return [236, 44];
  return [Math.min(340, vw - 32), 132];
};

/**
 * Таймер отдыха между подходами — «остров» внизу экрана. Появляется
 * компактной капсулой с временем; тап раскрывает его в карточку с кольцом и
 * кнопками −15/+15. Форма — пружины ширины и высоты, содержимое
 * перетекает через размытие. По нулю вибрирует и становится зелёным,
 * дальше считает перебор и сам закрывается через 25 с.
 */
export default function RestTimer({ endsAt, target, color, onAdjust, onSkip }: Props) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  const [shape, setShape] = useState<Shape>("idle");
  const buzzed = useRef(false);
  const leaving = useRef(false);
  const leaveTimer = useRef(0);

  const islandRef = useRef<HTMLDivElement>(null);
  const st = useRef<{
    W: ReturnType<typeof spring>;
    H: ReturnType<typeof spring>;
    press: ReturnType<typeof spring>;
    loop: ReturnType<typeof springLoop> | null;
  }>(null as never);
  if (!st.current) {
    const [w, h] = size("idle");
    const W = spring(w);
    const H = spring(h);
    const press = spring(1);
    tune(W, W_SPRING);
    tune(H, H_SPRING);
    tune(press, PRESS);
    st.current = { W, H, press, loop: null };
  }

  function render() {
    const { W, H, press } = st.current;
    const el = islandRef.current;
    if (!el) return;
    const h = Math.max(H.x, 20);
    // Пока высота быстро меняется, ширина чуть «отдаёт» — ощущение объёма.
    const give = clamp(-H.v / 7000, -0.05, 0.05);
    el.style.width = `${W.x * (1 + give)}px`;
    el.style.height = `${h}px`;
    el.style.borderRadius = `${Math.min(h / 2, MAX_RADIUS)}px`;
    el.style.transform = `scale(${press.x})`;
  }

  function morph(next: Shape) {
    const s = st.current;
    const [w, h] = size(next);
    const grow = w * h > s.W.t * s.H.t;
    tune(s.W, W_SPRING);
    tune(s.H, [H_SPRING[0] * (grow ? 1 : 1.3), H_SPRING[1]]);
    s.W.t = w;
    s.H.t = h;
    s.press.v -= grow ? 1.6 : 1;
    s.loop ??= springLoop(() => [s.W, s.H, s.press], render);
    s.loop.kick();
    setShape(next);
  }

  // Появление: точка-капсула растягивается в таймер.
  useLayoutEffect(() => {
    render();
    const id = window.setTimeout(() => morph("compact"), 60);
    return () => {
      window.clearTimeout(id);
      st.current.loop?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const remaining = Math.round((endsAt - now) / 1000);
  const done = remaining <= 0;

  useEffect(() => {
    if (done && !buzzed.current) {
      buzzed.current = true;
      st.current.press.v -= 2.4;
      st.current.loop?.kick();
      try {
        navigator.vibrate?.(180);
      } catch {
        /* не поддерживается — не страшно */
      }
    }
    if (!done) buzzed.current = false;
  }, [done]);

  // Закрытие: остров сжимается в точку, потом исчезает.
  function close() {
    if (leaving.current) return;
    leaving.current = true;
    morph("idle");
    leaveTimer.current = window.setTimeout(onSkip, 260);
  }

  // Новый отдых, пока остров закрывался (отметили следующий подход), — остаёмся.
  const firstEnds = useRef(endsAt);
  useEffect(() => {
    if (endsAt === firstEnds.current) return;
    firstEnds.current = endsAt;
    if (leaving.current) {
      window.clearTimeout(leaveTimer.current);
      leaving.current = false;
      morph("compact");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);

  useEffect(() => {
    if (remaining < -25) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const abs = Math.abs(remaining);
  const clock = `${done ? "+" : ""}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
  const accent = done ? ink("#4ade80") : color;
  const progress = done ? 1 : clamp(1 - remaining / target, 0, 1);
  const label = done ? t("Готово к подходу", "Ready for next set") : t("Отдых", "Rest");
  const Icon = done ? CheckRoundedIcon : TimerOutlinedIcon;

  // Слой содержимого: проявляется из размытия, когда форма его.
  const layer = (on: boolean, width: number | string) => ({
    position: "absolute" as const,
    left: "50%",
    top: "50%",
    width,
    opacity: on ? 1 : 0,
    filter: on ? "none" : "blur(6px)",
    transform: `translate(-50%,-50%) scale(${on ? 1 : 0.9})`,
    transition: on
      ? "opacity .35s ease .09s, filter .35s ease .09s, transform .6s cubic-bezier(.16,1,.3,1) .09s"
      : "opacity .14s ease, filter .14s ease, transform .2s ease",
    pointerEvents: on ? ("auto" as const) : ("none" as const),
  });

  const pressDown = () => {
    st.current.press.t = 0.96;
    st.current.loop?.kick();
  };
  const pressUp = () => {
    st.current.press.t = 1;
    st.current.loop?.kick();
  };

  return (
    <Box
      sx={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
        zIndex: 1400,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <Box
        ref={islandRef}
        role="status"
        aria-live="polite"
        aria-label={`${label} ${clock}`}
        onClick={() => !leaving.current && morph(shape === "open" ? "compact" : "open")}
        onPointerDown={pressDown}
        onPointerUp={pressUp}
        onPointerCancel={pressUp}
        onPointerLeave={pressUp}
        sx={{
          position: "relative",
          pointerEvents: "auto",
          overflow: "hidden",
          cursor: "pointer",
          bgcolor: OBJECT,
          boxShadow: "0 12px 32px -12px rgba(0,0,0,0.55)",
          willChange: "width,height,transform",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {/* Компактный: иконка, подпись, время */}
        <Box
          sx={{
            ...layer(shape === "compact", 208),
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            whiteSpace: "nowrap",
            color: accent,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Icon sx={{ fontSize: 18 }} />
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{label}</Typography>
          </Box>
          <Typography sx={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" }}>
            {clock}
          </Typography>
        </Box>

        {/* Раскрытый: кольцо, крупное время, −15/+15, закрыть */}
        <Box sx={{ ...layer(shape === "open", "calc(100% - 32px)"), minWidth: 280 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box sx={{ position: "relative", width: 44, height: 44, flex: "none", color: accent }}>
              <Box component="svg" viewBox="0 0 40 40" sx={{ width: 44, height: 44, transform: "rotate(-90deg)", display: "block" }}>
                <circle cx="20" cy="20" r="17" fill="none" strokeWidth="3.5" stroke={alpha(accent, 0.2)} />
                <circle
                  cx="20"
                  cy="20"
                  r="17"
                  fill="none"
                  strokeWidth="3.5"
                  stroke={accent}
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  strokeDashoffset={RING_C * (1 - progress)}
                  style={{ transition: "stroke-dashoffset .25s linear" }}
                />
              </Box>
              <Icon sx={{ position: "absolute", inset: 0, m: "auto", fontSize: 18 }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 12, color: "text.secondary", lineHeight: 1.2 }}>{label}</Typography>
              <Typography
                sx={{ fontSize: 28, fontWeight: 700, lineHeight: 1.15, letterSpacing: "-0.02em", color: accent, fontVariantNumeric: "tabular-nums" }}
              >
                {clock}
              </Typography>
            </Box>
            <ButtonBase
              aria-label={t("Пропустить отдых", "Skip rest")}
              onClick={(e) => {
                e.stopPropagation();
                close();
              }}
              sx={{ width: 40, height: 40, borderRadius: "50%", bgcolor: BTN, color: "text.primary", flex: "none" }}
            >
              <CloseRoundedIcon fontSize="small" />
            </ButtonBase>
          </Box>
          <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
            {[-15, 15].map((d) => (
              <ButtonBase
                key={d}
                onClick={(e) => {
                  e.stopPropagation();
                  onAdjust(d);
                }}
                sx={{
                  flex: 1,
                  height: 40,
                  borderRadius: 999,
                  bgcolor: BTN,
                  color: "text.primary",
                  fontSize: 14,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  transition: "transform .2s cubic-bezier(.34,1.56,.64,1)",
                  "&:active": { transform: "scale(.94)" },
                }}
              >
                {d > 0 ? `+${d}` : `−${-d}`} {t("с", "s")}
              </ButtonBase>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
