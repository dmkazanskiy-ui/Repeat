// Фото к своей тренировке: добавить (сразу несколько), листать, убрать текущее.
import { useRef, useState } from "react";
import { Box, Button, CircularProgress, IconButton, Stack, Typography } from "@mui/material";
import AddPhotoAlternateRoundedIcon from "@mui/icons-material/AddPhotoAlternateRounded";
import { Card, radius } from "../../ui";
import { DeleteOutlined as DeleteOutlineIcon } from "../../ui/icons";
import PhotoCarousel from "./PhotoCarousel";
import { deletePhoto, uploadPhoto } from "../../lib/social";
import { fileToScaledDataUrl } from "../../lib/image";
import { useAccount } from "../../lib/auth";
import type { WorkoutPhoto } from "../../lib/types";
import { useT } from "../../lib/i18n";

const MAX = 10;

function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export default function WorkoutPhotos({ photos, onChange }: { photos: WorkoutPhoto[]; onChange: (next: WorkoutPhoto[]) => void }) {
  const t = useT();
  const { authed } = useAccount();
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState(false);
  const [index, setIndex] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const latest = useRef(photos);
  latest.current = photos;

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError(false);
    const list = [...files].slice(0, MAX - photos.length);
    setBusy(list.length);
    for (const file of list) {
      try {
        // ~1600 px по длинной стороне — чётко на любом телефоне и не тяжело.
        const data = await fileToScaledDataUrl(file, 1600, 0.82);
        const { w, h } = await imageSize(data);
        const ph = await uploadPhoto(data, w, h);
        onChange([...latest.current, ph]);
      } catch {
        setError(true);
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeCurrent() {
    const ph = photos[index];
    if (!ph) return;
    void deletePhoto(ph.id);
    onChange(photos.filter((p) => p.id !== ph.id));
    setIndex(0);
  }

  const input = <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void add(e.target.files)} />;

  if (photos.length === 0) {
    return (
      <Card sx={{ mb: 1.5, p: 0, overflow: "hidden" }}>
        <Box
          component="button"
          disabled={!authed || busy > 0}
          onClick={() => fileRef.current?.click()}
          sx={{ width: "100%", display: "flex", alignItems: "center", gap: 1.5, p: 2, border: 0, bgcolor: "transparent", cursor: authed ? "pointer" : "default", fontFamily: "inherit", textAlign: "left", color: "text.primary" }}
        >
          <Box sx={{ width: 40, height: 40, borderRadius: radius.icon, bgcolor: "action.hover", display: "grid", placeItems: "center", flex: "none" }}>
            {busy ? <CircularProgress size={18} /> : <AddPhotoAlternateRoundedIcon sx={{ fontSize: 22 }} />}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{t("Добавить фото", "Add photos")}</Typography>
            <Typography sx={{ fontSize: 12, color: error ? "error.main" : "text.secondary" }}>
              {!authed
                ? t("Нужен вход через Telegram", "Sign in with Telegram first")
                : error
                  ? t("Не получилось загрузить — попробуй ещё", "Upload failed — try again")
                  : t("До 10 штук · видны в ленте, если тренировка там", "Up to 10 · shown in the feed if the workout is there")}
            </Typography>
          </Box>
        </Box>
        {input}
      </Card>
    );
  }

  return (
    <Box sx={{ mb: 1.5 }}>
      <PhotoCarousel photos={photos} rounded={radius.card} onIndex={setIndex} />
      <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: "center" }}>
        <Button size="small" startIcon={busy ? <CircularProgress size={14} /> : <AddPhotoAlternateRoundedIcon />} disabled={busy > 0 || photos.length >= MAX} onClick={() => fileRef.current?.click()}>
          {t("Ещё фото", "More photos")}
        </Button>
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={removeCurrent} aria-label={t("Убрать это фото", "Remove this photo")} sx={{ color: "text.secondary" }}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Stack>
      {error && (
        <Typography sx={{ fontSize: 12, color: "error.main" }}>{t("Часть фото не загрузилась", "Some photos failed to upload")}</Typography>
      )}
      {input}
    </Box>
  );
}
