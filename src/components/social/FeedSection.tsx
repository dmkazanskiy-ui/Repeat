// Лента на главной. Под «Сегодня» — «магнит»: дотянул страницу до конца и
// тянешь дальше — низ растягивается с сопротивлением, из ручки вытягивается
// капля (как в Pull to refresh), а отпустишь раньше порога — пружина тянет
// обратно к тренировкам. Дотянул — капля отрывается, лента открывается и
// страница пружиной съезжает к ней. Дальше — тренировки людей с открытым
// профилем, подгружаются по мере прокрутки.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { Card } from "../../ui";
import ExpandFeedCard from "./ExpandFeedCard";
import Avatar from "./Avatar";
import { fetchFeed, useMyProfile } from "../../lib/social";
import type { Post } from "../../lib/social";
import { useAccount } from "../../lib/auth";
import { haptic } from "../../lib/telegram";
import { MODE } from "../../lib/themeMode";
import { useT } from "../../lib/i18n";
import { clamp, spring, springLoop, tune } from "../../lib/spring";

// Пружины из Pull to refresh (tokens.css): возврат 260/18, под пальцем 900/50.
const RETURN: [number, number] = [260, 18];
const FOLLOW: [number, number] = [900, 50];
const DROP: [number, number] = [380, 20];
const DROP_SCALE: [number, number] = [420, 18];
const SCROLL: [number, number] = [260, 24];
const GATE = 132; // высота «шлюза» в покое: лента начинается заметно ниже
const THRESHOLD = 110; // сколько протянуть, чтобы открыть
const REST_S = 0.3;

/** Открыта ли лента в этом запуске и где стояла страница — чтобы вернуться из поста туда же. */
let opened = false;
let savedScroll = 0;

function rubber(d: number): number {
  d = Math.max(0, d);
  return d <= 200 ? d * 0.55 : 110 + 60 * (1 - 1 / (((d - 200) * 0.55) / 60 + 1));
}

// Goo-фильтр режет полупрозрачное — капле и ручке нужен сплошной цвет.
const GOO = MODE === "light" ? "#c3c9d2" : "#3b4352";

const atBottom = () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;

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
  const dropRef = useRef<HTMLDivElement>(null);
  const filterId = `feedgoo-${useId().replace(/:/g, "")}`;

  // ── «Магнит»: тянешь за край страницы, отпустил раньше — пружина вернёт.
  useEffect(() => {
    if (open) return;
    const P = spring(0, ...RETURN); // насколько растянут шлюз
    const D = spring(14, ...DROP); // центр капли
    const DS = spring(REST_S, ...DROP_SCALE); // размер капли
    let pulling = false;
    let y0: number | null = null;
    let isArmed = false;
    let done = false;
    let wheelAcc = 0;
    let wheelTimer = 0;

    const loop = springLoop(
      () => {
        const p = clamp(P.x / THRESHOLD, 0, 1);
        D.t = done ? GATE + P.x : 14 + P.x * 0.5;
        DS.t = done ? 1.6 : REST_S + (1 - REST_S) * p;
        return [P, D, DS];
      },
      () => {
        if (gateRef.current) gateRef.current.style.height = `${GATE + P.x}px`;
        if (dropRef.current) {
          const st = 1 + clamp(Math.abs(D.v) / 1600, 0, 0.35);
          dropRef.current.style.transform = `translateY(${(D.x - 16).toFixed(2)}px) scale(${(DS.x / st).toFixed(3)},${(DS.x * st).toFixed(3)})`;
          dropRef.current.style.opacity = done ? String(clamp(1 - (DS.x - 1) / 0.6, 0, 1).toFixed(3)) : "1";
        }
        // Низ страницы держим прижатым: растёт шлюз — контент едет вверх.
        if (P.x > 0.5 && !done) window.scrollTo(0, document.documentElement.scrollHeight);
      },
    );

    const arm = (on: boolean) => {
      if (on === isArmed) return;
      isArmed = on;
      setArmed(on);
      if (on) {
        DS.v += 4; // «щелчок» капли на пороге
        haptic("light");
      }
    };
    const pull = (d: number) => {
      P.t = rubber(d);
      arm(P.t >= THRESHOLD);
      loop.kick();
    };
    const release = () => {
      pulling = false;
      y0 = null;
      if (P.t >= THRESHOLD) {
        done = true;
        haptic("success");
        loop.kick();
        window.setTimeout(() => {
          opened = true;
          setOpen(true);
        }, 160);
      } else {
        tune(P, RETURN);
        P.t = 0;
        arm(false);
        loop.kick();
      }
    };

    const onStart = (e: TouchEvent) => {
      y0 = e.touches[0].clientY;
      pulling = false;
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
        if (y0 - y < 4) return;
        pulling = true;
        tune(P, FOLLOW);
      }
      if (e.cancelable) e.preventDefault();
      pull(y0 - y);
    };
    const onEnd = () => {
      if (pulling) release();
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
      wheelTimer = window.setTimeout(release, 180);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      loop.stop();
      window.clearTimeout(wheelTimer);
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
    return (
      <Box ref={gateRef} sx={{ position: "relative", height: GATE, mt: 3, mb: -2, userSelect: "none" }} aria-hidden={false}>
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b" />
            <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="g" />
            <feComposite in="SourceGraphic" in2="g" operator="atop" />
          </filter>
        </svg>
        <Box sx={{ position: "absolute", inset: 0, filter: `url(#${filterId})`, pointerEvents: "none" }}>
          <Box sx={{ position: "absolute", left: "50%", top: 12, width: 44, height: 6, ml: "-22px", borderRadius: "3px", bgcolor: GOO }} />
          <Box ref={dropRef} sx={{ position: "absolute", left: "50%", top: 0, width: 32, height: 32, ml: "-16px", borderRadius: "50%", bgcolor: GOO, willChange: "transform" }} />
        </Box>
        {/* Ручка поверх: тонкую полоску goo-фильтр размывает в ноль, а она должна быть видна всегда. */}
        <Box sx={{ position: "absolute", left: "50%", top: 12, width: 44, height: 6, ml: "-22px", borderRadius: "3px", bgcolor: GOO, pointerEvents: "none" }} />
        <Box
          component="button"
          onClick={() => {
            opened = true;
            setOpen(true);
          }}
          sx={{ position: "absolute", left: 0, right: 0, bottom: 28, border: 0, bgcolor: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "center", color: "text.secondary" }}
        >
          <Typography sx={{ fontSize: 15, fontWeight: 700, color: "text.primary" }}>{t("Лента", "Feed")}</Typography>
          <Typography sx={{ fontSize: 12, color: "text.secondary", transition: "opacity .2s" }}>
            {armed ? t("Отпусти — откроется", "Release to open") : t("Потяни вверх, чтобы открыть", "Pull up to open")}
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
