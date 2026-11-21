// Pull to Refresh (designbookmark.com/motion#db-pull-refresh), пересобран на MUI
// и наших пружинах. Тянешь список вниз — он идёт с резиновым сопротивлением,
// из «ручки» вытягивается капля (goo-фильтр держит их слитыми). За порогом
// капля «щёлкает», отрывается и становится спиннером; когда данные пришли,
// список пружиной возвращается на место.
//
// Тянуть можно только когда страница прокручена в самый верх: иначе это
// обычная прокрутка. Работает и пальцем (touch), и мышью.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Box } from "@mui/material";
import { clamp, spring, springLoop, tune } from "../lib/spring";

// Значения из tokens.css оригинала.
const THRESHOLD = 88; // --pull-threshold, px
const RETURN: [number, number] = [260, 18]; // --pull-return
const FOLLOW: [number, number] = [900, 50]; // --spring-follow: список под пальцем
const DROP: [number, number] = [380, 20];
const DROP_SCALE: [number, number] = [420, 18];
const SPIN: [number, number] = [400, 26];
const HOLD = 64; // где список ждёт, пока крутится спиннер
const REST_Y = 5;
const REST_S = 0.25;
/** Спиннер крутится не меньше этого, даже если сервер ответил мгновенно. */
const MIN_SPIN_MS = 700;

export type PullStatus = "idle" | "pull" | "release" | "loading";

/** Сначала вдвое медленнее пальца (порог легко достать), дальше — настоящее сопротивление. */
function rubber(d: number): number {
  d = Math.max(0, d);
  return d <= 180 ? d * 0.55 : 99 + 60 * (1 - 1 / (((d - 180) * 0.55) / 60 + 1));
}

interface Props {
  onRefresh: () => Promise<unknown>;
  /** Шапка над списком (не двигается); получает статус для подписи. */
  header?: (status: PullStatus) => ReactNode;
  children: ReactNode;
}

export default function PullToRefresh({ onRefresh, header, children }: Props) {
  const filterId = `goo-${useId().replace(/:/g, "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const spinRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<PullStatus>("idle");
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    const root = rootRef.current!;
    const P = spring(0, ...RETURN); // сдвиг списка
    const D = spring(REST_Y, ...DROP); // центр капли
    const DS = spring(REST_S, ...DROP_SCALE); // размер капли
    const SP = spring(0, ...SPIN); // спиннер: прозрачность и размер
    let mode: "idle" | "pulling" | "loading" | "settling" = "idle";
    let armed = false;
    let y0: number | null = null;
    let moved = false;
    let alive = true;

    const targets = () => {
      const p = clamp(P.x / THRESHOLD, 0, 1);
      if (mode === "pulling") {
        D.t = Math.max(REST_Y, P.x * 0.5);
        DS.t = REST_S + (1 - REST_S) * p;
        SP.t = 0;
      } else if (mode === "loading") {
        D.t = HOLD / 2;
        DS.t = 1;
        SP.t = 1;
      } else {
        D.t = REST_Y;
        DS.t = REST_S;
        SP.t = 0;
      }
    };
    const loop = springLoop(
      () => {
        targets();
        return [P, D, DS, SP];
      },
      () => {
        listRef.current!.style.transform = P.x > 0.05 ? `translateY(${P.x}px)` : "";
        // Капля вытягивается по вертикали, когда её тянут быстро.
        const st = 1 + clamp(Math.abs(D.v) / 1600, 0, 0.35);
        dropRef.current!.style.transform = `translateY(${D.x - 16}px) scale(${DS.x / st},${DS.x * st})`;
        spinRef.current!.style.transform = `translateY(${D.x - 16}px) scale(${0.6 + 0.4 * SP.x})`;
        const sp = clamp(SP.x, 0, 1);
        dropRef.current!.style.opacity = (1 - sp).toFixed(3);
        spinRef.current!.style.opacity = sp.toFixed(3);
        // В покое капля целиком спрятана под списком.
        root.dataset.pulling = P.x > 0.5 || sp > 0.01 ? "1" : "";
      },
    );

    const start = (y: number) => {
      if (mode !== "idle" || window.scrollY > 0) return;
      y0 = y;
      moved = false;
    };
    const move = (y: number): boolean => {
      if (y0 == null) return false;
      const dy = y - y0;
      if (mode === "idle") {
        if (dy < 6) {
          if (dy < -6) y0 = null; // повёл вверх — это прокрутка
          return false;
        }
        mode = "pulling";
        armed = false;
        tune(P, FOLLOW);
        setStatus("pull");
      }
      if (mode !== "pulling") return false;
      moved = true;
      P.t = rubber(dy);
      const over = P.t >= THRESHOLD;
      if (over && !armed) {
        armed = true;
        DS.v += 4; // «щелчок» капли на пороге
        setStatus("release");
      } else if (!over && armed) {
        armed = false;
        setStatus("pull");
      }
      loop.kick();
      return true;
    };
    const end = () => {
      y0 = null;
      if (mode !== "pulling") return;
      if (P.t >= THRESHOLD) void refresh();
      else {
        mode = "idle";
        tune(P, RETURN);
        P.t = 0;
        setStatus("idle");
        loop.kick();
      }
    };
    async function refresh() {
      mode = "loading";
      tune(P, RETURN);
      P.t = HOLD;
      setStatus("loading");
      loop.kick();
      await Promise.all([refreshRef.current().catch(() => null), new Promise((r) => setTimeout(r, MIN_SPIN_MS))]);
      if (!alive) return;
      mode = "settling";
      tune(P, RETURN);
      P.t = 0;
      setStatus("idle");
      loop.kick();
      setTimeout(() => {
        if (mode === "settling") mode = "idle";
      }, 600);
    }

    // Палец: preventDefault только когда реально тянем, иначе страница прокручивается как обычно.
    const onTouchStart = (e: TouchEvent) => start(e.touches[0].clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (move(e.touches[0].clientY) && e.cancelable) e.preventDefault();
    };
    // Мышь: для проверки на компьютере.
    const onMouseDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      start(e.clientY);
      const mm = (ev: PointerEvent) => {
        if (move(ev.clientY)) ev.preventDefault();
      };
      const mu = () => {
        window.removeEventListener("pointermove", mm);
        window.removeEventListener("pointerup", mu);
        end();
      };
      window.addEventListener("pointermove", mm);
      window.addEventListener("pointerup", mu);
    };
    // После протяжки не открываем строку, на которой отпустили палец.
    const onClick = (e: MouseEvent) => {
      if (moved) {
        e.stopPropagation();
        e.preventDefault();
        moved = false;
      }
    };
    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("touchend", end);
    root.addEventListener("touchcancel", end);
    root.addEventListener("pointerdown", onMouseDown);
    root.addEventListener("click", onClick, true);
    return () => {
      alive = false;
      loop.stop();
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", end);
      root.removeEventListener("touchcancel", end);
      root.removeEventListener("pointerdown", onMouseDown);
      root.removeEventListener("click", onClick, true);
    };
  }, []);

  return (
    <Box ref={rootRef} sx={{ position: "relative", userSelect: "none", WebkitUserSelect: "none", "&:not([data-pulling='1']) .ptr-goo, &:not([data-pulling='1']) .ptr-spin": { visibility: "hidden" } }}>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b" />
          <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="g" />
          <feComposite in="SourceGraphic" in2="g" operator="atop" />
        </filter>
      </svg>
      {header?.(status)}
      <Box sx={{ position: "relative" }}>
        <Box
          className="ptr-goo"
          sx={{ position: "absolute", left: 0, right: 0, top: 0, height: 120, filter: `url(#${filterId})`, pointerEvents: "none", zIndex: 1 }}
        >
          <Box sx={{ position: "absolute", left: "50%", top: "2px", width: 44, height: 6, ml: "-22px", borderRadius: "3px", bgcolor: "text.primary" }} />
          <Box
            ref={dropRef}
            sx={{ position: "absolute", left: "50%", top: 0, width: 32, height: 32, ml: "-16px", borderRadius: "50%", bgcolor: "text.primary", willChange: "transform" }}
          />
        </Box>
        <Box
          ref={spinRef}
          className="ptr-spin"
          sx={{
            position: "absolute",
            left: "50%",
            top: 0,
            width: 32,
            height: 32,
            ml: "-16px",
            p: "6px",
            borderRadius: "50%",
            bgcolor: "text.primary",
            color: "background.default",
            zIndex: 2,
            pointerEvents: "none",
            opacity: 0,
            "& svg": { width: "100%", height: "100%", display: "block", animation: "ptr-spin .8s linear infinite" },
            "@keyframes ptr-spin": { to: { transform: "rotate(360deg)" } },
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <path d="M12 4a8 8 0 0 1 8 8" />
          </svg>
        </Box>
        <Box ref={listRef} sx={{ position: "relative", zIndex: 2, bgcolor: "background.default", willChange: "transform" }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
