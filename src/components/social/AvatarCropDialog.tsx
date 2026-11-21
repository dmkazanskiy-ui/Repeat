// Обрезка аватарки — привычный паттерн (Telegram, Instagram): тёмный экран,
// круглое окно, фото двигается пальцем, масштаб — щипком, ползунком или
// колесом. Фото всегда закрывает круг целиком. На выходе — квадрат 512 px.
import { useEffect, useRef, useState } from "react";
import { Box, Button, Dialog, Slider, Stack, Typography } from "@mui/material";
import ZoomOutRoundedIcon from "@mui/icons-material/ZoomOutRounded";
import ZoomInRoundedIcon from "@mui/icons-material/ZoomInRounded";
import { useT } from "../../lib/i18n";

const OUT = 512;
const MAX_ZOOM = 4;

interface View {
  zoom: number; // 1 = фото ровно закрывает круг
  x: number; // сдвиг центра фото от центра круга, px экрана
  y: number;
}

export default function AvatarCropDialog({ src, onCancel, onDone }: { src: string; onCancel: () => void; onDone: (dataUrl: string) => void }) {
  const t = useT();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(300);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => {
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = src;
  }, [src]);

  useEffect(() => {
    const measure = () => setSize(Math.min(340, window.innerWidth - 48));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Пикселей экрана на пиксель фото при zoom = 1: короткая сторона = диаметр круга.
  const base = img ? size / Math.min(img.naturalWidth, img.naturalHeight) : 1;

  /** Не даём фото открыть край круга. */
  function clampView(v: View): View {
    if (!img) return v;
    const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom));
    const s = base * zoom;
    const mx = Math.max(0, (img.naturalWidth * s - size) / 2);
    const my = Math.max(0, (img.naturalHeight * s - size) / 2);
    return { zoom, x: Math.min(mx, Math.max(-mx, v.x)), y: Math.min(my, Math.max(-my, v.y)) };
  }

  /** Масштаб вокруг точки (fx, fy) от центра круга — точка под пальцами остаётся на месте. */
  function zoomAround(v: View, zoom: number, fx = 0, fy = 0): View {
    const k = Math.min(MAX_ZOOM, Math.max(1, zoom)) / v.zoom;
    return clampView({ zoom: v.zoom * k, x: fx - (fx - v.x) * k, y: fy - (fy - v.y) * k });
  }

  const center = () => {
    const r = boxRef.current?.getBoundingClientRect();
    return r ? { cx: r.left + r.width / 2, cy: r.top + r.height / 2 } : { cx: 0, cy: 0 };
  };

  function onPointerDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, next);
    if (pointers.current.size === 1) {
      setView((v) => clampView({ ...v, x: v.x + next.x - prev.x, y: v.y + next.y - prev.y }));
    } else if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      const { cx, cy } = center();
      const zoom = gesture.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / gesture.current.dist);
      setView((v) => zoomAround(v, zoom, (a.x + b.x) / 2 - cx, (a.y + b.y) / 2 - cy));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    const { cx, cy } = center();
    setView((v) => zoomAround(v, v.zoom * Math.exp(-e.deltaY / 400), e.clientX - cx, e.clientY - cy));
  }

  function done() {
    if (!img) return;
    const s = base * view.zoom;
    const side = size / s;
    const sx = img.naturalWidth / 2 - (size / 2 + view.x) / s;
    const sy = img.naturalHeight / 2 - (size / 2 + view.y) / s;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, side, side, 0, 0, OUT, OUT);
    onDone(canvas.toDataURL("image/jpeg", 0.88));
  }

  const s = base * view.zoom;

  return (
    <Dialog open fullScreen onClose={onCancel} slotProps={{ paper: { sx: { bgcolor: "#000", backgroundImage: "none", m: 0, width: "100%", height: "100%", maxWidth: "none", maxHeight: "none", borderRadius: 0, overflow: "hidden" } } }}>
      <Stack sx={{ height: "100%", color: "#fff" }}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", px: 1, pt: "calc(8px + env(safe-area-inset-top, 0px))" }}>
          <Button onClick={onCancel} sx={{ color: "#fff" }}>
            {t("Отмена", "Cancel")}
          </Button>
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{t("Фото профиля", "Profile photo")}</Typography>
          <Button onClick={done} disabled={!img} sx={{ color: "#fff", fontWeight: 700 }}>
            {t("Готово", "Done")}
          </Button>
        </Stack>

        {/* Фото за кругом видно приглушённым, но не залезает на шапку и ползунок. */}
        <Box sx={{ flex: 1, display: "grid", placeItems: "center", overflow: "hidden", position: "relative" }}>
          <Box
            ref={boxRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            sx={{ position: "relative", width: size, height: size, touchAction: "none", cursor: "grab", "&:active": { cursor: "grabbing" } }}
          >
            {img && (
              <Box
                component="img"
                src={src}
                alt=""
                draggable={false}
                sx={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: img.naturalWidth * s,
                  height: img.naturalHeight * s,
                  maxWidth: "none",
                  transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px))`,
                  userSelect: "none",
                  pointerEvents: "none",
                }}
              />
            )}
            {/* Затемнение вокруг круга и его контур. */}
            <Box sx={{ position: "absolute", inset: 0, borderRadius: "50%", boxShadow: "0 0 0 2000px rgba(0,0,0,0.62)", outline: "2px solid rgba(255,255,255,0.9)", pointerEvents: "none" }} />
          </Box>
        </Box>

        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", px: 3, pb: "calc(28px + env(safe-area-inset-bottom, 0px))" }}>
          <ZoomOutRoundedIcon sx={{ opacity: 0.7 }} />
          <Slider
            value={view.zoom}
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            onChange={(_, z) => setView((v) => zoomAround(v, z as number))}
            aria-label={t("Масштаб", "Zoom")}
            sx={{ color: "#fff" }}
          />
          <ZoomInRoundedIcon sx={{ opacity: 0.7 }} />
        </Stack>
        <Typography sx={{ textAlign: "center", fontSize: 13, opacity: 0.6, pb: 2, mt: -2 }}>
          {t("Двигай фото пальцем, масштаб — щипком", "Drag to move, pinch to zoom")}
        </Typography>
      </Stack>
    </Dialog>
  );
}
