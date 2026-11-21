// Like burst (designbookmark.com/motion#db-like-burst) на наших пружинах:
// сердце сплющивается и отпрыгивает (520/13), заливается красным (300/26),
// выбрасывает кольцо цветных точек, а счётчик прокручивается на единицу (260/20).
// Снять лайк — счётчик едет обратно, сердце пустеет с маленьким «присестом».
import { useEffect, useRef, useState } from "react";
import { Box } from "@mui/material";
import { clamp, spring, springLoop } from "../../lib/spring";
import { haptic } from "../../lib/telegram";
import { setLike } from "../../lib/social";
import { useT } from "../../lib/i18n";
import { ink } from "../../lib/themeMode";

const HEART = ink("#f87171");
const DOTS = [HEART, ink("#fb923c"), ink("#facc15"), ink("#4ade80"), ink("#38bdf8"), ink("#a78bfa"), ink("#f472b6"), HEART];
const H_SPRING: [number, number] = [520, 13];
const F_SPRING: [number, number] = [300, 26];
const N_SPRING: [number, number] = [260, 20];
const BURST_S = 0.55;
const PATH = "M12 20.3s-7.6-4.6-9.2-9.4C1.7 7.6 3.9 4.5 7.1 4.5c2 0 3.6 1.1 4.9 3 1.3-1.9 2.9-3 4.9-3 3.2 0 5.4 3.1 4.3 6.4-1.6 4.8-9.2 9.4-9.2 9.4z";

export default function LikeButton({ post, liked, likes }: { post: string; liked: boolean; likes: number }) {
  const t = useT();
  const [state, setState] = useState({ liked, likes });

  const heartRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const colRef = useRef<HTMLSpanElement>(null);
  const dotRefs = useRef<(HTMLElement | null)[]>([]);
  const st = useRef({
    H: spring(1, ...H_SPRING),
    F: spring(liked ? 1 : 0, ...F_SPRING),
    N: spring(liked ? 1 : 0, ...N_SPRING),
    burstAt: -1,
    loop: null as ReturnType<typeof springLoop> | null,
  });

  useEffect(() => {
    const s = st.current;
    const paint = () => {
      const sq = s.H.x;
      if (heartRef.current) heartRef.current.style.transform = `scale(${(sq * (2 - Math.min(sq, 1.15))).toFixed(4)},${sq.toFixed(4)})`;
      const f = clamp(s.F.x, 0, 1);
      if (pathRef.current) {
        pathRef.current.style.fill = `color-mix(in srgb, ${HEART} ${(f * 100).toFixed(1)}%, transparent)`;
        pathRef.current.style.stroke = f > 0.5 ? HEART : "";
      }
      if (colRef.current) colRef.current.style.transform = `translateY(${(-20 * s.N.x).toFixed(2)}px)`;
    };
    s.loop = springLoop(() => [s.H, s.F, s.N], paint);
    paint();
    return () => s.loop?.stop();
  }, []);

  // Пришли свежие данные с сервера — встаём в них без анимации.
  useEffect(() => {
    setState({ liked, likes });
    const s = st.current;
    s.F.x = s.F.t = s.N.x = s.N.t = liked ? 1 : 0;
    s.loop?.kick();
  }, [liked, likes]);

  // Точки летят быстро, тормозят, уменьшаются и гаснут за полсекунды.
  function burst() {
    const start = performance.now();
    const frame = (now: number) => {
      const k = clamp((now - start) / 1000 / BURST_S, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      dotRefs.current.forEach((el, i) => {
        if (!el) return;
        const a = (i / DOTS.length) * Math.PI * 2 + 0.2;
        const r = 9 + e * (18 + (i % 2) * 5);
        el.style.opacity = k >= 1 ? "0" : (1 - k * k).toFixed(3);
        el.style.transform = `translate(${(Math.cos(a) * r).toFixed(2)}px,${(Math.sin(a) * r).toFixed(2)}px) scale(${(1 - 0.7 * k).toFixed(3)})`;
      });
      if (k < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function animate(on: boolean) {
    const s = st.current;
    if (on) {
      s.H.x = 0.6;
      s.H.v = 9;
      burst();
    } else {
      s.H.x = 0.85;
      s.H.v = 3;
    }
    s.F.t = on ? 1 : 0;
    s.N.t = on ? 1 : 0;
    s.loop?.kick();
  }

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    const prev = state;
    const next = { liked: !state.liked, likes: state.likes + (state.liked ? -1 : 1) };
    setState(next);
    animate(next.liked);
    if (next.liked) haptic("light");
    try {
      setState(await setLike(post, next.liked));
    } catch {
      setState(prev);
      animate(prev.liked);
    }
  }

  // Счётчик — два числа столбиком: «без моего лайка» и «с ним».
  const base = state.likes - (state.liked ? 1 : 0);
  const fmt = (n: number) => (n > 0 ? String(n) : "");

  return (
    <Box
      component="button"
      onClick={toggle}
      aria-pressed={state.liked}
      aria-label={state.liked ? t("Убрать лайк", "Unlike") : t("Нравится", "Like")}
      sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, border: "none", bgcolor: "transparent", p: 0.75, ml: -0.75, cursor: "pointer", color: "text.secondary", fontFamily: "inherit" }}
    >
      <Box component="span" sx={{ position: "relative", width: 22, height: 22, flex: "none" }}>
        <Box component="span" sx={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0 }}>
          {DOTS.map((c, i) => (
            <Box
              key={i}
              component="i"
              ref={(el: HTMLElement | null) => {
                dotRefs.current[i] = el;
              }}
              sx={{ position: "absolute", left: "-2.5px", top: "-2.5px", width: 5, height: 5, borderRadius: "50%", bgcolor: c, opacity: 0, willChange: "transform,opacity" }}
            />
          ))}
        </Box>
        <svg ref={heartRef} viewBox="0 0 24 24" width={22} height={22} style={{ position: "absolute", inset: 0, overflow: "visible", willChange: "transform" }} aria-hidden>
          <path ref={pathRef} d={PATH} fill="transparent" stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round" />
        </svg>
      </Box>
      <Box component="span" sx={{ position: "relative", height: 20, overflow: "hidden", fontSize: 14, fontWeight: 600, lineHeight: "20px", fontVariantNumeric: "tabular-nums", minWidth: 8 }}>
        <Box component="span" ref={colRef} sx={{ display: "flex", flexDirection: "column", willChange: "transform" }}>
          <span style={{ height: 20 }}>{fmt(base)}</span>
          <span style={{ height: 20 }}>{fmt(base + 1)}</span>
        </Box>
      </Box>
    </Box>
  );
}
