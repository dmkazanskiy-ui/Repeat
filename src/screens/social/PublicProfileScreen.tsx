// Публичный профиль: фото, о себе, чем занимается, и его тренировки из ленты.
import { useEffect, useState } from "react";
import { Box, Button, CircularProgress, IconButton, Stack, Typography } from "@mui/material";
import { Card, Section, Tile, radius } from "../../ui";
import { ArrowBack as ArrowBackIcon } from "../../ui/icons";
import Avatar from "../../components/social/Avatar";
import FeedCard from "../../components/social/FeedCard";
import { ACTIVITIES, fetchFeed, fetchProfile } from "../../lib/social";
import type { Post, PublicProfile } from "../../lib/social";
import { useLang, useT } from "../../lib/i18n";

export default function PublicProfileScreen({
  pid,
  onBack,
  onOpenPost,
  onEdit,
}: {
  pid: string;
  onBack: () => void;
  onOpenPost: (id: string) => void;
  onEdit: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setProfile(null);
    Promise.all([fetchProfile(pid), fetchFeed(0, pid)]).then(
      ([p, f]) => {
        setProfile(p);
        setPosts(f.posts);
        setMore(f.more);
      },
      () => setError(true),
    );
  }, [pid]);

  const back = (
    <IconButton onClick={onBack} edge="start" aria-label={t("Назад", "Back")}>
      <ArrowBackIcon />
    </IconButton>
  );
  if (error) {
    return (
      <Box>
        {back}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {t("Профиль закрыт или удалён.", "This profile is private or deleted.")}
        </Typography>
      </Box>
    );
  }
  if (!profile) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 8 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 10 }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        {back}
        {profile.mine && (
          <Button size="small" onClick={onEdit}>
            {t("Изменить", "Edit")}
          </Button>
        )}
      </Stack>

      <Stack sx={{ alignItems: "center", textAlign: "center", mb: 2.5 }}>
        <Avatar person={profile} size={96} />
        <Typography variant="h1" sx={{ mt: 1.5 }}>
          {profile.name}
        </Typography>
        {profile.bio && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, maxWidth: 320, overflowWrap: "anywhere" }}>
            {profile.bio}
          </Typography>
        )}
        {profile.acts.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 0.75, mt: 1.5 }}>
            {profile.acts.map((a) => {
              const meta = ACTIVITIES.find((x) => x.id === a);
              return (
                <Box key={a} sx={{ px: 1.25, py: 0.5, borderRadius: radius.pill, bgcolor: "action.hover", fontSize: 13 }}>
                  {meta ? (lang === "ru" ? meta.ru : meta.en) : a}
                </Box>
              );
            })}
          </Box>
        )}
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1, mb: 1 }}>
        <Tile label={t("Тренировок в ленте", "Workouts shared")} value={profile.posts} />
        <Tile label={t("Лайков", "Likes")} value={profile.likes} />
      </Box>

      <Section title={t("Тренировки", "Workouts")}>
        {posts.length === 0 ? (
          <Card>
            <Typography variant="body2" color="text.secondary">
              {t("Пока ничего не опубликовано.", "Nothing shared yet.")}
            </Typography>
          </Card>
        ) : (
          <Stack spacing={1.5}>
            {posts.map((p) => (
              <FeedCard key={p.id} post={p} onOpen={onOpenPost} onAuthor={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
            ))}
          </Stack>
        )}
        {more && (
          <Button fullWidth sx={{ mt: 1.5 }} onClick={async () => {
            const f = await fetchFeed(posts.length, pid);
            setPosts((prev) => [...prev, ...f.posts]);
            setMore(f.more);
          }}>
            {t("Показать ещё", "Show more")}
          </Button>
        )}
      </Section>
    </Box>
  );
}
