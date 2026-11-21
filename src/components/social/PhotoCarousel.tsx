// Фото тренировки, как в Strava: одно — в своих пропорциях (от 4:5 до 1,91:1),
// несколько — листаются пальцем, высоту задаёт первое; внизу точки и «2/5».
import { useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { photoUrl } from "../../lib/social";
import type { WorkoutPhoto } from "../../lib/types";
import { photoRatio } from "./snap";

export default function PhotoCarousel({
  photos,
  rounded = 0,
  onIndex,
  fill = false,
  chrome = true,
}: {
  photos: WorkoutPhoto[];
  rounded?: number | string;
  onIndex?: (i: number) => void;
  /** Растянуть по родителю вместо своих пропорций (родитель сам задаёт размер). */
  fill?: boolean;
  /** Показывать точки и счётчик (в свёрнутой миниатюре — нет). */
  chrome?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const rowRef = useRef<HTMLDivElement>(null);
  if (photos.length === 0) return null;
  const ratio = photoRatio(photos[0]);

  return (
    <Box sx={{ position: "relative", width: "100%", ...(fill ? { height: "100%" } : { aspectRatio: String(ratio) }), borderRadius: rounded, overflow: "hidden", bgcolor: "action.hover" }}>
      <Box
        ref={rowRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (i !== index) {
            setIndex(i);
            onIndex?.(i);
          }
        }}
        onClick={(e) => photos.length > 1 && e.stopPropagation()}
        sx={{
          display: "flex",
          width: "100%",
          height: "100%",
          overflowX: photos.length > 1 ? "auto" : "hidden",
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
          overscrollBehaviorX: "contain",
        }}
      >
        {photos.map((p, i) => (
          <Box
            key={p.id}
            component="img"
            src={photoUrl(p.id)}
            alt=""
            loading={i === 0 ? "eager" : "lazy"}
            draggable={false}
            sx={{ flex: "0 0 100%", width: "100%", height: "100%", objectFit: "cover", scrollSnapAlign: "start", display: "block", userSelect: "none" }}
          />
        ))}
      </Box>
      {photos.length > 1 && chrome && (
        <>
          <Typography sx={{ position: "absolute", top: 10, right: 10, px: 1, py: 0.25, borderRadius: 999, fontSize: 12, fontWeight: 600, color: "#fff", bgcolor: "rgba(0,0,0,0.45)", pointerEvents: "none" }}>
            {index + 1}/{photos.length}
          </Typography>
          <Box sx={{ position: "absolute", bottom: 10, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 0.75, pointerEvents: "none" }}>
            {photos.map((p, i) => (
              <Box key={p.id} sx={{ width: i === index ? 16 : 6, height: 6, borderRadius: 3, bgcolor: i === index ? "#fff" : "rgba(255,255,255,0.55)", transition: "width .25s cubic-bezier(.34,1.56,.64,1), background-color .2s" }} />
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}
