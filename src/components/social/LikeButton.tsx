import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import FavoriteRoundedIcon from "@mui/icons-material/FavoriteRounded";
import FavoriteBorderRoundedIcon from "@mui/icons-material/FavoriteBorderRounded";
import { haptic } from "../../lib/telegram";
import { setLike } from "../../lib/social";
import { useT } from "../../lib/i18n";
import { ink } from "../../lib/themeMode";

const HEART = ink("#f87171");

/** Лайк: сразу меняем вид (оптимистично), при ошибке откатываем. */
export default function LikeButton({ post, liked, likes, onChange }: { post: string; liked: boolean; likes: number; onChange?: (liked: boolean, likes: number) => void }) {
  const t = useT();
  const [state, setState] = useState({ liked, likes });
  const [pop, setPop] = useState(0);
  useEffect(() => setState({ liked, likes }), [liked, likes]);

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    const next = { liked: !state.liked, likes: state.likes + (state.liked ? -1 : 1) };
    setState(next);
    if (next.liked) {
      setPop((p) => p + 1);
      haptic("light");
    }
    try {
      const r = await setLike(post, next.liked);
      setState(r);
      onChange?.(r.liked, r.likes);
    } catch {
      setState(state);
    }
  }

  return (
    <Box
      component="button"
      onClick={toggle}
      aria-pressed={state.liked}
      aria-label={state.liked ? t("Убрать лайк", "Unlike") : t("Нравится", "Like")}
      sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, border: "none", bgcolor: "transparent", p: 0.75, ml: -0.75, cursor: "pointer", color: state.liked ? HEART : "text.secondary", fontFamily: "inherit" }}
    >
      <Box
        key={pop}
        sx={{
          display: "grid",
          "@keyframes heart-pop": { "0%": { transform: "scale(1)" }, "35%": { transform: "scale(1.35)" }, "100%": { transform: "scale(1)" } },
          animation: pop ? "heart-pop .42s cubic-bezier(.34,1.56,.64,1)" : "none",
        }}
      >
        {state.liked ? <FavoriteRoundedIcon sx={{ fontSize: 22 }} /> : <FavoriteBorderRoundedIcon sx={{ fontSize: 22 }} />}
      </Box>
      <Typography sx={{ fontSize: 14, fontWeight: 600, color: "text.secondary", fontVariantNumeric: "tabular-nums", minWidth: 8 }}>{state.likes || ""}</Typography>
    </Box>
  );
}
