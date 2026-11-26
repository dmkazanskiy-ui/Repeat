// Фото к своей тренировке. Выбранные фото сначала ложатся в черновик —
// превью с крестиками, ничего не отправлено; на сервер (и в ленту) уходят
// только по кнопке «Опубликовать». У опубликованного — крестик на фото и
// подтверждение удаления: так случайное фото не уйдёт и не пропадёт.
import { useRef, useState } from "react";
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Typography } from "@mui/material";
import AddPhotoAlternateRoundedIcon from "@mui/icons-material/AddPhotoAlternateRounded";
import { Card, radius } from "../../ui";
import { CloseRounded } from "../../ui/icons";
import PhotoCarousel from "./PhotoCarousel";
import { deletePhoto, photoUrl, uploadPhoto } from "../../lib/social";
import { fileToScaledDataUrl } from "../../lib/image";
import { useAccount } from "../../lib/auth";
import { newId } from "../../lib/id";
import { haptic } from "../../lib/telegram";
import type { WorkoutPhoto } from "../../lib/types";
import { useT } from "../../lib/i18n";

const MAX = 10;

interface Draft {
  id: string;
  data: string;
  w: number;
  h: number;
}

function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/** Круглый крестик поверх фото: заметный на любом снимке, 32 px — удобно пальцем. */
function CloseBadge({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <IconButton
      size="small"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      sx={{
        position: "absolute",
        top: 6,
        right: 6,
        width: 32,
        height: 32,
        bgcolor: "rgba(0,0,0,0.55)",
        color: "#fff",
        backdropFilter: "blur(6px)",
        "&:hover": { bgcolor: "rgba(0,0,0,0.7)" },
      }}
    >
      <CloseRounded sx={{ fontSize: 18 }} />
    </IconButton>
  );
}

export default function WorkoutPhotos({ photos, onChange }: { photos: WorkoutPhoto[]; onChange: (next: WorkoutPhoto[]) => void }) {
  const t = useT();
  const { authed } = useAccount();
  const [draft, setDraft] = useState<Draft[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [confirm, setConfirm] = useState<WorkoutPhoto | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const latest = useRef(photos);
  latest.current = photos;
  const room = MAX - photos.length - draft.length;

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setPreparing(true);
    const list = [...files].slice(0, Math.max(0, room));
    const next: Draft[] = [];
    for (const file of list) {
      try {
        // ~1600 px по длинной стороне — чётко на любом телефоне и не тяжело.
        const data = await fileToScaledDataUrl(file, 1600, 0.82);
        const { w, h } = await imageSize(data);
        next.push({ id: newId(), data, w, h });
      } catch {
        setError(t("Какое-то фото не открылось", "A photo couldn't be opened"));
      }
    }
    if (files.length > list.length) setError(t(`Можно до ${MAX} фото`, `Up to ${MAX} photos`));
    setDraft((d) => [...d, ...next]);
    setPreparing(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function publish() {
    if (!draft.length) return;
    setError(null);
    setUploading({ done: 0, total: draft.length });
    const left: Draft[] = [];
    for (const d of draft) {
      try {
        const ph = await uploadPhoto(d.data, d.w, d.h);
        onChange([...latest.current, ph]);
      } catch {
        left.push(d);
      }
      setUploading((u) => (u ? { ...u, done: u.done + 1 } : u));
    }
    setUploading(null);
    setDraft(left);
    if (left.length) setError(t("Часть фото не отправилась — попробуй ещё раз", "Some photos failed — try again"));
    else haptic("success");
  }

  function remove(ph: WorkoutPhoto) {
    void deletePhoto(ph.id);
    onChange(photos.filter((p) => p.id !== ph.id));
    setIndex(0);
    setConfirm(null);
  }

  const input = <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void pick(e.target.files)} />;
  const busy = preparing || uploading != null;

  // Черновик: превью с крестиками и кнопка «Опубликовать».
  const draftBlock = draft.length > 0 && (
    <Card sx={{ mt: photos.length ? 1.5 : 0 }}>
      <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{t("Новые фото", "New photos")}</Typography>
      <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1.25 }}>
        {t("Ещё не отправлены. Проверь и опубликуй — они появятся в ленте вместе с тренировкой.", "Not sent yet. Check and publish — they'll appear in the feed with the workout.")}
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 0.75 }}>
        {draft.map((d) => (
          <Box key={d.id} sx={{ position: "relative", aspectRatio: "1", borderRadius: radius.tile, overflow: "hidden", bgcolor: "action.hover" }}>
            <Box component="img" src={d.data} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: uploading ? 0.6 : 1 }} />
            {!uploading && <CloseBadge label={t("Убрать фото", "Remove photo")} onClick={() => setDraft((x) => x.filter((y) => y.id !== d.id))} />}
          </Box>
        ))}
      </Box>
      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
        <Button
          variant="contained"
          disabled={busy}
          onClick={() => void publish()}
          startIcon={uploading ? <CircularProgress size={14} color="inherit" /> : undefined}
          sx={{ flex: 1 }}
        >
          {uploading ? t(`Отправляю ${uploading.done + 1} из ${uploading.total}…`, `Sending ${uploading.done + 1} of ${uploading.total}…`) : t(`Опубликовать (${draft.length})`, `Publish (${draft.length})`)}
        </Button>
        <Button color="inherit" disabled={busy} onClick={() => setDraft([])} sx={{ color: "text.secondary" }}>
          {t("Отмена", "Cancel")}
        </Button>
      </Stack>
    </Card>
  );

  const errorLine = error && <Typography sx={{ fontSize: 12, color: "error.main", mt: 0.75 }}>{error}</Typography>;

  if (photos.length === 0) {
    return (
      <Box sx={{ mb: 1.5 }}>
        {draft.length === 0 ? (
          <Card sx={{ p: 0, overflow: "hidden" }}>
            <Box
              component="button"
              disabled={!authed || busy}
              onClick={() => fileRef.current?.click()}
              sx={{ width: "100%", display: "flex", alignItems: "center", gap: 1.5, p: 2, border: 0, bgcolor: "transparent", cursor: authed ? "pointer" : "default", fontFamily: "inherit", textAlign: "left", color: "text.primary" }}
            >
              <Box sx={{ width: 40, height: 40, borderRadius: radius.icon, bgcolor: "action.hover", display: "grid", placeItems: "center", flex: "none" }}>
                {preparing ? <CircularProgress size={18} /> : <AddPhotoAlternateRoundedIcon sx={{ fontSize: 22 }} />}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{t("Добавить фото", "Add photos")}</Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                  {!authed
                    ? t("Нужен вход через Telegram", "Sign in with Telegram first")
                    : t("До 10 штук · перед публикацией покажем превью", "Up to 10 · you'll see a preview before publishing")}
                </Typography>
              </Box>
            </Box>
          </Card>
        ) : (
          draftBlock
        )}
        {draft.length > 0 && room > 0 && (
          <Button size="small" startIcon={<AddPhotoAlternateRoundedIcon />} disabled={busy} onClick={() => fileRef.current?.click()} sx={{ mt: 1 }}>
            {t("Добавить ещё", "Add more")}
          </Button>
        )}
        {errorLine}
        {input}
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 1.5 }}>
      <Box sx={{ position: "relative" }}>
        <PhotoCarousel photos={photos} rounded={radius.card} onIndex={setIndex} />
        {photos[index] && <CloseBadge label={t("Удалить это фото", "Delete this photo")} onClick={() => setConfirm(photos[index])} />}
      </Box>
      <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: "center" }}>
        <Button size="small" startIcon={preparing ? <CircularProgress size={14} /> : <AddPhotoAlternateRoundedIcon />} disabled={busy || room <= 0} onClick={() => fileRef.current?.click()}>
          {t("Ещё фото", "More photos")}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          {photos.length} / {MAX}
        </Typography>
      </Stack>
      {draftBlock}
      {errorLine}
      {input}

      <Dialog open={confirm != null} onClose={() => setConfirm(null)}>
        <DialogTitle>{t("Удалить фото?", "Delete photo?")}</DialogTitle>
        <DialogContent>
          {confirm && (
            <Box component="img" src={photoUrl(confirm.id)} alt="" sx={{ width: "100%", maxHeight: 240, objectFit: "cover", borderRadius: radius.tile, display: "block", mb: 1.5 }} />
          )}
          <Typography variant="body2" color="text.secondary">
            {t("Оно пропадёт из тренировки и из ленты. Вернуть не получится.", "It will be removed from the workout and the feed. This can't be undone.")}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setConfirm(null)}>
            {t("Отмена", "Cancel")}
          </Button>
          <Button color="error" variant="contained" onClick={() => confirm && remove(confirm)}>
            {t("Удалить", "Delete")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
