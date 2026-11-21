// Карточка ленты — Expand card (designbookmark.com/motion#db-expand-card) на
// наших пружинах. Свёрнута — строка: миниатюра, название, автор, главная цифра.
// Тап — одна пружина 240/21 раскрывает её: фото растёт на всю ширину (листается,
// если их несколько), название съезжает под него, через 160 мс проявляются
// детали (260/28): цифры, упражнения, лайк и «Подробнее» — полный экран.
import { useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import { radius } from "../../ui";
import { CARD_IN } from "../../theme";
import Avatar from "./Avatar";
import LikeButton from "./LikeButton";
import PhotoCarousel from "./PhotoCarousel";
import { kindColor, photoRatio, setLine, snapStats } from "./snap";
import { ActivityIcon } from "../../lib/icons";
import type { IconKey } from "../../lib/icons";
import { alpha } from "@mui/material/styles";
import { clamp, spring, springLoop } from "../../lib/spring";
import { formatDateFull } from "../../lib/format";
import type { Post } from "../../lib/social";
import { useT } from "../../lib/i18n";

const P_SPRING: [number, number] = [240, 21];
const A_SPRING: [number, number] = [260, 28];
const ROW = 72;
const PAD = 12;
const THUMB = 48;

export default function ExpandFeedCard({ post, onOpen, onAuthor }: { post: Post; onOpen: (id: string) => void; onAuthor: (pid: string) => void }) {
  const t = useT();
  const { snap } = post;
  const photos = snap.photos ?? [];
  const hasPhoto = photos.length > 0;
  const stats = snapStats(snap, t);
  const main = stats.find((s) => s.label !== t("Время", "Time")) ?? stats[0];
  const color = kindColor(snap.kind);
  const [open, setOpen] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const metricRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const st = useRef({ p: spring(0, ...P_SPRING), a: spring(0, ...A_SPRING), loop: null as ReturnType<typeof springLoop> | null, timer: 0 });

  useEffect(() => {
    const s = st.current;
    const paint = () => {
      const card = cardRef.current;
      if (!card) return;
      const W = card.offsetWidth;
      const p = s.p.x;
      const q = clamp(p, 0, 1);
      const photoW = W - PAD * 2;
      const photoH = hasPhoto ? photoW / photoRatio(photos[0]) : THUMB;
      // Миниатюра → фото на всю ширину (без фото иконка остаётся на месте).
      const tw = hasPhoto ? THUMB + q * (photoW - THUMB) : THUMB;
      const th = hasPhoto ? Math.max(THUMB, THUMB + p * (photoH - THUMB)) : THUMB;
      if (thumbRef.current) {
        thumbRef.current.style.width = `${tw.toFixed(2)}px`;
        thumbRef.current.style.height = `${th.toFixed(2)}px`;
        thumbRef.current.style.borderRadius = `${(12 + q * 4).toFixed(2)}px`;
      }
      const headY = hasPhoto ? 16 + p * (PAD + photoH + 12 - 16) : 16;
      const headX = hasPhoto ? 72 - (72 - 16) * q : 72;
      if (headRef.current) headRef.current.style.transform = `translate(${headX.toFixed(2)}px,${headY.toFixed(2)}px)`;
      if (metricRef.current) metricRef.current.style.transform = `translateY(${(26 + (headY - 16)).toFixed(2)}px)`;
      const moreTop = hasPhoto ? PAD + photoH + 12 + 48 : ROW;
      const more = moreRef.current;
      if (more) {
        const a = clamp(s.a.x, 0, 1);
        more.style.top = `${moreTop}px`;
        more.style.opacity = a.toFixed(3);
        more.style.transform = `translateY(${((1 - s.a.x) * 10).toFixed(2)}px)`;
      }
      const full = moreTop + (more?.offsetHeight ?? 0) + 16;
      card.style.height = `${(ROW + p * (full - ROW)).toFixed(2)}px`;
    };
    s.loop = springLoop(() => [s.p, s.a], paint);
    paint();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(paint) : null;
    if (cardRef.current) ro?.observe(cardRef.current);
    return () => {
      s.loop?.stop();
      ro?.disconnect();
      window.clearTimeout(s.timer);
    };
    // Пересобираем только когда сменился набор фото, а не на каждый рендер.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPhoto, photos.map((p) => p.id).join()]);

  function toggle() {
    const s = st.current;
    const next = !open;
    setOpen(next);
    window.clearTimeout(s.timer);
    s.p.t = next ? 1 : 0;
    if (next) s.timer = window.setTimeout(() => {
      s.a.t = 1;
      s.loop?.kick();
    }, 160);
    else s.a.t = 0;
    s.loop?.kick();
  }

  const when = `${formatDateFull(snap.date)}${snap.time ? ` · ${snap.time}` : ""}`;

  return (
    <Box
      ref={cardRef}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={toggle}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle())}
      sx={{ position: "relative", height: ROW, borderRadius: radius.card, bgcolor: "background.paper", border: 1, borderColor: "divider", overflow: "hidden", cursor: "pointer", willChange: "height", animation: CARD_IN, WebkitTapHighlightColor: "transparent" }}
    >
      {/* Миниатюра / фото */}
      <Box ref={thumbRef} sx={{ position: "absolute", left: PAD, top: PAD, width: THUMB, height: THUMB, borderRadius: "12px", overflow: "hidden", bgcolor: hasPhoto ? "action.hover" : alpha(color, 0.14), color, display: "grid", placeItems: "center", pointerEvents: open ? "auto" : "none" }}>
        {hasPhoto ? <PhotoCarousel photos={photos} fill chrome={open} /> : <ActivityIcon icon={(snap.icon || null) as IconKey | null} fontSize="small" />}
      </Box>

      {/* Название и автор */}
      <Box ref={headRef} sx={{ position: "absolute", left: 0, top: 0, maxWidth: "calc(100% - 150px)", transform: "translate(72px,16px)", willChange: "transform" }}>
        <Typography noWrap sx={{ fontSize: 15, fontWeight: 700, lineHeight: "20px" }}>
          {snap.title}
        </Typography>
        <Typography noWrap sx={{ fontSize: 13, lineHeight: "18px", color: "text.secondary" }}>
          {post.author.name} · {when}
        </Typography>
      </Box>

      {/* Главная цифра справа */}
      {main && (
        <Box ref={metricRef} sx={{ position: "absolute", right: 16, top: 0, transform: "translateY(26px)", willChange: "transform" }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700, lineHeight: "20px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{main.value}</Typography>
        </Box>
      )}

      {/* Детали — проявляются после раскрытия */}
      <Box ref={moreRef} sx={{ position: "absolute", left: 16, right: 16, top: ROW, opacity: 0, willChange: "transform,opacity", pointerEvents: open ? "auto" : "none" }}>
        <Box
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            onAuthor(post.author.pid);
          }}
          sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.25, cursor: "pointer", width: "fit-content" }}
        >
          <Avatar person={post.author} size={28} />
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{post.author.name}</Typography>
        </Box>

        {stats.length > 0 && (
          <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`, gap: 1, mb: 1.25 }}>
            {stats.map((s) => (
              <Box key={s.label} sx={{ p: 1.25, borderRadius: radius.tile, bgcolor: "action.hover", minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: 12, color: "text.secondary", mb: 0.25 }}>{s.label}</Typography>
                <Typography noWrap sx={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{s.value}</Typography>
              </Box>
            ))}
          </Box>
        )}

        {snap.exercises.slice(0, 3).map((ex, i) => (
          <Box key={i} sx={{ display: "flex", gap: 1, py: 0.25, alignItems: "baseline" }}>
            <Typography noWrap sx={{ fontSize: 13, flex: 1, minWidth: 0 }}>{ex.name}</Typography>
            <Typography noWrap sx={{ fontSize: 12, color: "text.secondary", flex: "none", fontVariantNumeric: "tabular-nums" }}>{setLine(ex.sets)}</Typography>
          </Box>
        ))}

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 1 }} onClick={(e) => e.stopPropagation()}>
          <LikeButton post={post.id} liked={post.liked} likes={post.likes} />
          <Box
            component="button"
            onClick={() => onOpen(post.id)}
            aria-label={t("Комментарии", "Comments")}
            sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, border: 0, bgcolor: "transparent", p: 0.75, cursor: "pointer", color: "text.secondary", fontFamily: "inherit" }}
          >
            <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 20 }} />
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: "text.secondary" }}>{post.comments || ""}</Typography>
          </Box>
          <Box
            component="button"
            onClick={() => onOpen(post.id)}
            sx={{ ml: "auto", px: 1.75, py: 0.9, border: 0, borderRadius: radius.pill, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, bgcolor: "text.primary", color: "background.default", whiteSpace: "nowrap" }}
          >
            {t("Подробнее", "Open")}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
