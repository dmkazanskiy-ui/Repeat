// Карточка тренировки в ленте: кто, что, сколько; лайк и комментарии.
import { Box, ButtonBase, Stack, Typography } from "@mui/material";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import { Card, IconBadge, radius } from "../../ui";
import Avatar from "./Avatar";
import LikeButton from "./LikeButton";
import { ActivityIcon } from "../../lib/icons";
import type { IconKey } from "../../lib/icons";
import { formatDateFull } from "../../lib/format";
import { kindColor, setLine, snapStats } from "./snap";
import type { Post } from "../../lib/social";
import { useT } from "../../lib/i18n";

export default function FeedCard({
  post,
  onOpen,
  onAuthor,
}: {
  post: Post;
  onOpen: (id: string) => void;
  onAuthor: (pid: string) => void;
}) {
  const t = useT();
  const { snap } = post;
  const stats = snapStats(snap, t);
  const color = kindColor(snap.kind);
  return (
    <Card sx={{ p: 0, overflow: "hidden" }}>
      <ButtonBase component="div" onClick={() => onOpen(post.id)} sx={{ display: "block", width: "100%", textAlign: "left", p: 2 }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: 1.5 }}>
          <Box
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              onAuthor(post.author.pid);
            }}
            sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0, flex: 1, cursor: "pointer" }}
          >
            <Avatar person={post.author} />
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
          <IconBadge color={color} size={32}>
            <ActivityIcon icon={(snap.icon || null) as IconKey | null} fontSize="small" />
          </IconBadge>
        </Stack>

        <Typography sx={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", mb: 1.25 }}>{snap.title}</Typography>

        {stats.length > 0 && (
          <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`, gap: 1, mb: snap.exercises.length ? 1.25 : 0 }}>
            {stats.map((s) => (
              <Box key={s.label} sx={{ p: 1.25, borderRadius: radius.tile, bgcolor: "action.hover", minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: 12, color: "text.secondary", mb: 0.25 }}>{s.label}</Typography>
                <Typography noWrap sx={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{s.value}</Typography>
              </Box>
            ))}
          </Box>
        )}

        {snap.exercises.slice(0, 3).map((ex, i) => (
          <Stack key={i} direction="row" spacing={1} sx={{ py: 0.25, alignItems: "baseline" }}>
            <Typography noWrap sx={{ fontSize: 13, flex: 1, minWidth: 0 }}>
              {ex.name}
            </Typography>
            <Typography noWrap sx={{ fontSize: 12, color: "text.secondary", flex: "none", fontVariantNumeric: "tabular-nums" }}>
              {setLine(ex.sets)}
            </Typography>
          </Stack>
        ))}
        {snap.exercises.length > 3 && (
          <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.25 }}>
            {t(`ещё ${snap.exercises.length - 3} упр.`, `+${snap.exercises.length - 3} more`)}
          </Typography>
        )}
      </ButtonBase>

      <Stack direction="row" spacing={1.5} sx={{ px: 2, pb: 1.25, alignItems: "center" }}>
        <LikeButton post={post.id} liked={post.liked} likes={post.likes} />
        <Box
          component="button"
          onClick={() => onOpen(post.id)}
          aria-label={t("Комментарии", "Comments")}
          sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, border: "none", bgcolor: "transparent", p: 0.75, cursor: "pointer", color: "text.secondary", fontFamily: "inherit" }}
        >
          <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 20 }} />
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: "text.secondary" }}>{post.comments || ""}</Typography>
        </Box>
      </Stack>
    </Card>
  );
}
