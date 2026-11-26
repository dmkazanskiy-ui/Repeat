// Лента на главной. Вход — pull-to-reveal у нижнего края «Сегодня» (как в
// Bybit): дотянул страницу до конца и тянешь вверх — снизу поднимается ракета.
//  • Первые ~60 px идут почти 1:1, дальше мягкое сопротивление (rubber band):
//    не нужно тянуть через весь экран.
//  • Решение — по проекции скорости (WWDC18 «Designing Fluid Interfaces»):
//    короткий быстрый свайп тоже открывает, медленный — по порогу.
//  • Ракета привязана к прогрессу: выезжает, выпрямляется, разгорается пламя;
//    на пороге — вибро-щелчок (selectionChanged, и при возврате ниже тоже) и
//    подпись «Отпусти». Сработало — impact medium, ракета улетает, страница
//    прерываемой пружиной съезжает к ленте.
//  • «Уменьшение движения» — без полёта. Подпись — ещё и кнопка «Открыть».
import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { Card } from "../../ui";
import ExpandFeedCard from "./ExpandFeedCard";
import Avatar from "./Avatar";
import { fetchFeed, useMyProfile } from "../../lib/social";
import type { Post } from "../../lib/social";
import { useAccount } from "../../lib/auth";
import { haptic } from "../../lib/telegram";
import { useT } from "../../lib/i18n";
import { clamp, spring, springLoop, tune } from "../../lib/spring";

// Пружины: возврат 260/18, под пальцем 900/50, ракета 380/20, улёт 220/22.
const RETURN: [number, number] = [260, 18];
const FOLLOW: [number, number] = [900, 50];
const ROCKET: [number, number] = [380, 20];
const LAUNCH: [number, number] = [220, 22];
const SCROLL: [number, number] = [260, 24];
const GATE = 120; // высота «шлюза» в покое
const THRESHOLD = 64; // сколько вытянуть шлюз, чтобы открыть
const PROJECT_S = 0.18; // на сколько секунд вперёд проецируем бросок пальца

/** Открыта ли лента в этом запуске и где стояла страница — чтобы вернуться из поста туда же. */
let opened = false;
let savedScroll = 0;

/** Сопротивление за краем: почти 1:1 до 60 px пальца, дальше мягко к потолку ~150. */
function rubber(d: number): number {
  d = Math.max(0, d);
  if (d <= 60) return d * 0.9;
  return 54 + 96 * (1 - 1 / (1 + (d - 60) / 140));
}

const atBottom = () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Ракета: корпус, окно, стабилизаторы и пламя (пламя растёт отдельно). */
function Rocket({ color, flame }: { color: string; flame: string }) {
  return (
    <svg viewBox="0 0 40 56" width={40} height={56} aria-hidden style={{ overflow: "visible" }}>
      <path data-flame d="M14 40 Q20 62 26 40 Z" fill={flame} style={{ transformOrigin: "20px 40px", transformBox: "view-box" }} />
      <path d="M20 2 C29 10 31 22 29 38 L11 38 C9 22 11 10 20 2 Z" fill={color} />
      <path d="M11 28 L4 38 L11 38 Z M29 28 L36 38 L29 38 Z" fill={color} opacity={0.75} />
      <circle cx={20} cy={18} r={4.5} fill="none" stroke="currentColor" strokeWidth={2.5} opacity={0.9} />
    </svg>
  );
}

interface Props {
  onOpenPost: (id: string) => void;
  onOpenProfile: (pid: string) => void;
  onEditProfile: () => void;
  /** Меняется, когда свои тренировки ушли на сервер — перечитать ленту. */
  refreshKey?: number;
}

export default function FeedSection({ onOpenPost, onOpenProfile, onEditProfile, refreshKey }: Props) {
  const t = useT();
  const account = useAccount();
  const me = useMyProfile();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(opened);
  const [armed, setArmed] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const gateRef = useRef<HTMLDivElement>(null);
  const rocketRef = useRef<HTMLDivElement>(null);
  const flameRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();

  // ── Pull-to-reveal: тянешь за нижний край, отпустил раньше — пружина вернёт.
  useEffect(() => {
    if (open) return;
    const P = spring(0, ...RETURN); // насколько вытянут шлюз
    const R = spring(0, ...ROCKET); // подъём ракеты 0…1 (+ улёт)
    let pulling = false;
    let y0: number | null = null;
    let isArmed = false;
    let done = false;
    let wheelAcc = 0;
    let wheelTimer = 0;
    // Последние точки пальца — для скорости броска.
    let trail: { y: number; t: number }[] = [];

    const loop = springLoop(
      () => {
        if (!done) R.t = clamp(P.x / THRESHOLD, 0, 1.25);
        return [P, R];
      },
      () => {
        if (gateRef.current) gateRef.current.style.height = `${GATE + P.x}px`;
        const r = R.x;
        const el = rocketRef.current;
        if (el) {
          // До порога: выезжает снизу и выпрямляется. Улёт: r → 4, уходит вверх.
          const rise = Math.min(r, 1);
          const fly = Math.max(0, r - 1.25);
          const y = 26 - 26 * rise - fly * 90;
          const tilt = (1 - Math.min(rise, 1)) * -28;
          const sc = 0.7 + 0.3 * Math.min(rise, 1);
          el.style.transform = `translateY(${y.toFixed(2)}px) rotate(${tilt.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
          el.style.opacity = done ? clamp(1 - fly / 2.5, 0, 1).toFixed(3) : clamp(0.35 + rise, 0, 1).toFixed(3);
        }
        if (flameRef.current) {
          const f = clamp((r - 0.55) / 0.45, 0, 1.6);
          flameRef.current.style.setProperty("--flame", f.toFixed(3));
        }
        // Низ страницы держим прижатым: растёт шлюз — контент едет вверх.
        if (P.x > 0.5 && !done) window.scrollTo(0, document.documentElement.scrollHeight);
      },
    );

    const arm = (on: boolean) => {
      if (on === isArmed) return;
      isArmed = on;
      setArmed(on);
      haptic("selection"); // щелчок на пороге — и туда, и обратно
      if (on) R.v += 3;
    };
    const pull = (d: number) => {
      P.t = rubber(d);
      arm(P.t >= THRESHOLD);
      loop.kick();
    };
    const launch = () => {
      done = true;
      setArmed(true);
      haptic("medium");
      tune(R, LAUNCH);
      R.t = reducedMotion() ? 1 : 4;
      R.v = reducedMotion() ? 0 : 6;
      tune(P, RETURN);
      P.t = THRESHOLD;
      loop.kick();
      window.setTimeout(() => {
        opened = true;
        setOpen(true);
      }, reducedMotion() ? 60 : 260);
    };
    const release = (velocity = 0) => {
      pulling = false;
      y0 = null;
      // Проекция: где окажется шлюз, если палец продолжит с той же скоростью.
      // Медленное ведение (< 350 px/с) — не бросок: решает только порог.
      const projected = velocity > 350 ? P.t + rubber(velocity * PROJECT_S) * 0.6 : P.t;
      if (P.t >= THRESHOLD || projected >= THRESHOLD) launch();
      else {
        tune(P, RETURN);
        P.t = 0;
        arm(false);
        loop.kick();
      }
    };

    const onStart = (e: TouchEvent) => {
      y0 = e.touches[0].clientY;
      pulling = false;
      trail = [];
      // Палец коснулся во время отката — продолжаем с текущей позиции (прерываемая пружина).
      if (P.x > 1 && !done) {
        y0 = e.touches[0].clientY + P.x / 0.9;
        pulling = true;
        tune(P, FOLLOW);
      }
    };
    const onMove = (e: TouchEvent) => {
      if (y0 == null || done) return;
      const y = e.touches[0].clientY;
      if (!pulling) {
        // Доехали до низа посреди жеста — отсчитываем рывок отсюда.
        if (!atBottom()) {
          y0 = y;
          return;
        }
        if (y0 - y < 3) return;
        pulling = true;
        tune(P, FOLLOW);
      }
      if (e.cancelable) e.preventDefault();
      const now = performance.now();
      trail.push({ y, t: now });
      while (trail.length > 2 && now - trail[0].t > 90) trail.shift();
      pull(y0 - y);
    };
    const onEnd = () => {
      if (pulling) {
        const a = trail[0];
        const b = trail[trail.length - 1];
        const v = a && b && b.t > a.t ? ((a.y - b.y) / (b.t - a.t)) * 1000 : 0; // px/s вверх
        release(v);
      }
      y0 = null;
    };
    // Колесо/тачпад на компьютере: копим прокрутку у низа, пауза — «отпустил».
    const onWheel = (e: WheelEvent) => {
      if (done || e.deltaY <= 0 || !atBottom()) return;
      if (!pulling) {
        pulling = true;
        tune(P, FOLLOW);
        wheelAcc = 0;
      }
      wheelAcc += e.deltaY;
      pull(wheelAcc);
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => release(0), 180);
    };

    // Системный bounce и «потяни, чтобы обновить» не должны спорить с жестом.
    const html = document.documentElement;
    const prevOverscroll = html.style.overscrollBehaviorY;
    html.style.overscrollBehaviorY = "none";
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      loop.stop();
      window.clearTimeout(wheelTimer);
      html.style.overscrollBehaviorY = prevOverscroll;
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
      window.removeEventListener("wheel", onWheel);
    };
  }, [open]);

  // Лента только что открылась — страница пружиной съезжает к её заголовку.
  const justOpened = useRef(!opened);
  useEffect(() => {
    if (!open || !justOpened.current) return;
    justOpened.current = false;
    const target = (headerRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY - 12;
    const S = spring(window.scrollY, ...SCROLL);
    S.t = target;
    const stop = () => loop.stop();
    const loop = springLoop(() => [S], () => window.scrollTo(0, S.x));
    loop.kick();
    window.addEventListener("touchstart", stop, { once: true, passive: true });
    return () => {
      loop.stop();
      window.removeEventListener("touchstart", stop);
    };
  }, [open]);

  const load = useCallback(
    async (offset: number) => {
      if (!account.authed) return;
      setLoading(true);
      setError(false);
      try {
        const r = await fetchFeed(offset);
        setPosts((prev) => (offset === 0 ? r.posts : [...(prev ?? []), ...r.posts]));
        setMore(r.more);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [account.authed],
  );

  useEffect(() => {
    if (open) void load(0);
  }, [load, refreshKey, open]);

  // Вернулись из поста/профиля — ставим страницу туда, где она была.
  useEffect(() => {
    if (open && posts && savedScroll) {
      window.scrollTo(0, savedScroll);
      savedScroll = 0;
    }
  }, [open, posts]);
  const openPost = (id: string) => {
    savedScroll = window.scrollY;
    onOpenPost(id);
  };
  const openProfile = (pid: string) => {
    savedScroll = window.scrollY;
    onOpenProfile(pid);
  };

  // Подгрузка следующей страницы, когда низ ленты показался на экране.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more || loading) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void load(posts?.length ?? 0);
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [more, loading, load, posts]);

  if (!open) {
    const ink = theme.palette.text.primary;
    return (
      <Box ref={gateRef} sx={{ position: "relative", height: GATE, mt: 3, mb: -2, userSelect: "none", overflow: "hidden" }}>
        {/* Ракета — знак жеста: выезжает и разгорается по мере протяжки. */}
        <Box sx={{ position: "absolute", left: "50%", top: 6, width: 40, height: 56, ml: "-20px", pointerEvents: "none" }}>
          <Box ref={rocketRef} sx={{ width: 40, height: 56, color: theme.palette.background.paper, transformOrigin: "50% 70%", willChange: "transform, opacity", opacity: 0.35, transform: "translateY(26px) rotate(-28deg) scale(0.7)" }}>
            <Box
              ref={flameRef}
              sx={{
                "--flame": 0,
                "& [data-flame]": { transform: "scaleY(var(--flame))", opacity: "min(1, calc(var(--flame) * 1.5))" },
              }}
            >
              <Rocket color={armed ? theme.palette.primary.main : alpha(ink, 0.55)} flame="#fb923c" />
            </Box>
          </Box>
        </Box>
        <Box
          component="button"
          onClick={() => {
            opened = true;
            setOpen(true);
          }}
          sx={{ position: "absolute", left: 0, right: 0, bottom: 22, border: 0, bgcolor: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "center", color: "text.secondary" }}
        >
          <Typography sx={{ fontSize: 15, fontWeight: 700, color: "text.primary" }}>{t("Лента", "Feed")}</Typography>
          <Typography sx={{ fontSize: 12, color: armed ? "primary.main" : "text.secondary", fontWeight: armed ? 700 : 400, transition: "color .2s" }}>
            {armed ? t("Отпусти — взлетаем", "Release to launch") : t("Потяни вверх или нажми", "Pull up or tap")}
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box component="section" sx={{ mt: 4, minHeight: "60vh" }}>
      <Stack ref={headerRef} direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
        <Typography variant="h2">{t("Лента", "Feed")}</Typography>
        {me && (
          <Box role="button" tabIndex={0} onClick={onEditProfile} sx={{ cursor: "pointer" }} aria-label={t("Мой профиль", "My profile")}>
            <Avatar person={me} size={32} />
          </Box>
        )}
      </Stack>

      {!account.authed ? (
        <Card>
          <Typography variant="body2" color="text.secondary">
            {t("Лента доступна после входа через Telegram — в профиле.", "The feed is available after signing in with Telegram — in your profile.")}
          </Typography>
        </Card>
      ) : (
        <>
          {me && !me.public && (
            <Card sx={{ mb: 1.5 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 600, mb: 0.5 }}>{t("Твоих тренировок здесь не видно", "Your workouts aren’t shown here")}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                {t(
                  "Открой профиль — добавь фото и пару слов о себе, и тренировки появятся в ленте. Заметки, пульс, вес и самочувствие остаются только у тебя.",
                  "Open your profile — add a photo and a few words, and your workouts appear in the feed. Notes, heart rate, weight and mood stay private.",
                )}
              </Typography>
              <Button variant="contained" onClick={onEditProfile}>
                {t("Настроить профиль", "Set up profile")}
              </Button>
            </Card>
          )}

          {posts == null && loading && (
            <Box sx={{ display: "grid", placeItems: "center", py: 4 }}>
              <CircularProgress size={26} />
            </Box>
          )}
          {error && posts == null && (
            <Typography variant="body2" color="text.secondary">
              {t("Не удалось загрузить ленту.", "Couldn’t load the feed.")}
            </Typography>
          )}
          {posts?.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              {t("Пока здесь пусто — стань первым.", "Nothing here yet — be the first.")}
            </Typography>
          )}

          <Stack spacing={1}>
            {posts?.map((p) => (
              <ExpandFeedCard key={p.id} post={p} onOpen={openPost} onAuthor={openProfile} />
            ))}
          </Stack>
          <Box ref={sentinel} sx={{ height: 1 }} />
          {loading && posts != null && (
            <Box sx={{ display: "grid", placeItems: "center", py: 2 }}>
              <CircularProgress size={22} />
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
