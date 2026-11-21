// Публичный профиль: фото, о себе, чем занимается, и его тренировки из ленты.
import { useEffect, useState } from "react";
import { Box, Button, CircularProgress, IconButton, Stack, Typography } from "@mui/material";
import { Card, Section } from "../../ui";
import { ArrowBack as ArrowBackIcon } from "../../ui/icons";
import ExpandFeedCard from "../../components/social/ExpandFeedCard";
import { fetchFeed, fetchProfile, setFollow } from "../../lib/social";
import ProfileCard from "../../components/social/ProfileCard";
import type { Post, PublicProfile } from "../../lib/social";
import { useT } from "../../lib/i18n";

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
      </Stack>

      <ProfileCard profile={profile} onFollow={(on) => setFollow(profile.pid, on)} onEdit={onEdit} />

      <Section title={t("Тренировки", "Workouts")}>
        {posts.length === 0 ? (
          <Card>
            <Typography variant="body2" color="text.secondary">
              {t("Пока ничего не опубликовано.", "Nothing shared yet.")}
            </Typography>
          </Card>
        ) : (
          <Stack spacing={1}>
            {posts.map((p) => (
              <ExpandFeedCard key={p.id} post={p} onOpen={onOpenPost} onAuthor={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
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
