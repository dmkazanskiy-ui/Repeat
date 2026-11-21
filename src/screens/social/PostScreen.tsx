// Чужая (или своя) тренировка из ленты: детали подходов и комментарии.
import { useEffect, useState } from "react";
import { Box, Button, CircularProgress, IconButton, ListItemIcon, Menu, MenuItem, Stack, TextField, Typography } from "@mui/material";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import { Card, IconBadge, Section, Tile, radius, text } from "../../ui";
import PhotoCarousel from "../../components/social/PhotoCarousel";
import { ArrowBack as ArrowBackIcon, DeleteOutlined as DeleteOutlineIcon } from "../../ui/icons";
import Avatar from "../../components/social/Avatar";
import LikeButton from "../../components/social/LikeButton";
import { kindColor, snapStats } from "../../components/social/snap";
import { ActivityIcon } from "../../lib/icons";
import type { IconKey } from "../../lib/icons";
import { formatDateFull } from "../../lib/format";
import { addComment, deleteComment, deletePost, fetchPost, useMyProfile } from "../../lib/social";
import type { Post } from "../../lib/social";
import { useAccount } from "../../lib/auth";
import { useT } from "../../lib/i18n";

export default function PostScreen({
  id,
  onBack,
  onAuthor,
  onEditProfile,
}: {
  id: string;
  onBack: () => void;
  onAuthor: (pid: string) => void;
  onEditProfile: () => void;
}) {
  const t = useT();
  const me = useMyProfile();
  const { admin } = useAccount();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [menu, setMenu] = useState<HTMLElement | null>(null);

  useEffect(() => {
    fetchPost(id).then(setPost, () => setError(true));
  }, [id]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      setPost(await addComment(id, text));
      setDraft("");
    } catch {
      /* оставим текст в поле */
    } finally {
      setSending(false);
    }
  }

  if (error) {
    return (
      <Box>
        <IconButton onClick={onBack} edge="start" aria-label={t("Назад", "Back")}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {t("Тренировка недоступна — её убрали из ленты.", "This workout is no longer in the feed.")}
        </Typography>
      </Box>
    );
  }
  if (!post) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 8 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const { snap } = post;
  const stats = snapStats(snap, t);
  const canComment = Boolean(me?.public);

  return (
    <Box sx={{ pb: 12 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1.5 }}>
        <IconButton onClick={onBack} edge="start" aria-label={t("Назад", "Back")}>
          <ArrowBackIcon />
        </IconButton>
        <Box role="button" onClick={() => onAuthor(post.author.pid)} sx={{ display: "flex", alignItems: "center", gap: 1.25, flex: 1, minWidth: 0, cursor: "pointer" }}>
          <Avatar person={post.author} size={36} />
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: 14, fontWeight: 600 }}>
              {post.author.name}
            </Typography>
            <Typography noWrap sx={{ fontSize: 12, color: "text.secondary" }}>
              {formatDateFull(snap.date)}
              {snap.time ? ` · ${snap.time}` : ""}
            </Typography>
          </Box>
        </Box>
        {(post.mine || admin) && (
          <IconButton onClick={(e) => setMenu(e.currentTarget)} aria-label={t("Ещё", "More")} sx={{ width: 40, height: 40, bgcolor: "action.hover" }}>
            <MoreHorizRoundedIcon />
          </IconButton>
        )}
      </Stack>

      {(snap.photos?.length ?? 0) > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <PhotoCarousel photos={snap.photos!} rounded={radius.card} />
        </Box>
      )}

      <Card sx={{ mb: 1.5 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: stats.length ? 2 : 0 }}>
          <IconBadge color={kindColor(snap.kind)} size={48}>
            <ActivityIcon icon={(snap.icon || null) as IconKey | null} fontSize="medium" />
          </IconBadge>
          <Typography sx={{ fontSize: 19, fontWeight: 700, flex: 1, minWidth: 0 }}>{snap.title}</Typography>
        </Stack>
        {stats.length > 0 && (
          <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`, gap: 1 }}>
            {stats.map((s) => (
              <Tile key={s.label} label={s.label} value={s.value} />
            ))}
          </Box>
        )}
        <Stack direction="row" sx={{ mt: 1.5, alignItems: "center" }}>
          <LikeButton post={post.id} liked={post.liked} likes={post.likes} />
        </Stack>
      </Card>

      {snap.exercises.length > 0 && (
        <Section title={t("Упражнения", "Exercises")}>
          <Stack spacing={1}>
            {snap.exercises.map((ex, i) => (
              <Card key={i} sx={{ p: 1.75 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 0.75 }}>{ex.name}</Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                  {ex.sets.map((s, j) => (
                    <Box key={j} sx={{ px: 1, py: 0.5, borderRadius: "10px", bgcolor: "action.hover", fontSize: 13, fontVariantNumeric: "tabular-nums", color: s.wu ? "text.secondary" : "text.primary" }}>
                      {s.wu ? `${t("Р", "W")} ` : ""}
                      {s.w ?? "—"} × {s.r ?? "—"}
                    </Box>
                  ))}
                </Box>
              </Card>
            ))}
          </Stack>
        </Section>
      )}

      <Section title={t("Комментарии", "Comments")} action={<Typography sx={text.caption}>{post.commentList?.length || ""}</Typography>}>
        {post.commentList?.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t("Пока никто не написал.", "No comments yet.")}
          </Typography>
        )}
        <Stack spacing={1.5} sx={{ mb: 2 }}>
          {post.commentList?.map((c) => (
            <Stack key={c.id} direction="row" spacing={1.25} sx={{ alignItems: "flex-start" }}>
              <Box role="button" onClick={() => onAuthor(c.author.pid)} sx={{ cursor: "pointer" }}>
                <Avatar person={c.author} size={32} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{c.author.name}</Typography>
                <Typography sx={{ fontSize: 14, overflowWrap: "anywhere" }}>{c.text}</Typography>
              </Box>
              {(c.mine || post.mine || admin) && (
                <IconButton size="small" aria-label={t("Удалить комментарий", "Delete comment")} onClick={async () => setPost(await deleteComment(post.id, c.id))} sx={{ color: "text.secondary" }}>
                  <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                </IconButton>
              )}
            </Stack>
          ))}
        </Stack>

        {canComment ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: "flex-end" }}>
            <TextField
              fullWidth
              multiline
              maxRows={4}
              placeholder={t("Написать комментарий", "Write a comment")}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 500))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <IconButton onClick={() => void send()} disabled={!draft.trim() || sending} aria-label={t("Отправить", "Send")} sx={{ width: 48, height: 48, bgcolor: "primary.main", color: "primary.contrastText", "&:hover": { bgcolor: "primary.dark" }, "&.Mui-disabled": { bgcolor: "action.hover" } }}>
              <SendRoundedIcon />
            </IconButton>
          </Stack>
        ) : (
          <Card>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
              {t("Комментировать можно с открытым профилем — чтобы было видно, кто пишет.", "You can comment once your profile is public — so people see who’s writing.")}
            </Typography>
            <Button variant="outlined" onClick={onEditProfile}>
              {t("Открыть профиль", "Open profile")}
            </Button>
          </Card>
        )}
      </Section>

      <Menu open={menu != null} anchorEl={menu} onClose={() => setMenu(null)}>
        <MenuItem
          onClick={async () => {
            setMenu(null);
            await deletePost(post.id);
            onBack();
          }}
        >
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" color="error" />
          </ListItemIcon>
          <Typography color="error">{post.mine ? t("Убрать из ленты", "Remove from feed") : t("Удалить (модерация)", "Delete (moderation)")}</Typography>
        </MenuItem>
      </Menu>
    </Box>
  );
}
