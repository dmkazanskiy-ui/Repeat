// Лента на главной: ниже «Сегодня» страница «прыгает» к ленте (scroll-snap),
// дальше — тренировки людей с открытым профилем, подгружаются по мере прокрутки.
import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { Card } from "../../ui";
import FeedCard from "./FeedCard";
import Avatar from "./Avatar";
import { fetchFeed, useMyProfile } from "../../lib/social";
import type { Post } from "../../lib/social";
import { useAccount } from "../../lib/auth";
import { useT } from "../../lib/i18n";

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

  // «Скачок» к ленте: мягкие точки привязки только пока главная на экране.
  useEffect(() => {
    document.documentElement.classList.add("rp-snap");
    return () => document.documentElement.classList.remove("rp-snap");
  }, []);

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
    void load(0);
  }, [load, refreshKey]);

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

  return (
    <Box component="section" sx={{ mt: 4, scrollSnapAlign: "start", scrollMarginTop: "12px", minHeight: "60vh" }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
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

          <Stack spacing={1.5}>
            {posts?.map((p) => (
              <FeedCard key={p.id} post={p} onOpen={onOpenPost} onAuthor={onOpenProfile} />
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
