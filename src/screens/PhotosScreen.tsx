import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import FavoriteBorderRoundedIcon from "@mui/icons-material/FavoriteBorderRounded";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Counter from "yet-another-react-lightbox/plugins/counter";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/counter.css";
import { deletePhotoFull, loadPhotoFull, savePhotoFull } from "../lib/store";
import { fileToPhoto } from "../lib/image";
import { newId } from "../lib/id";
import {
  daysBetween,
  formatDate,
  formatWeight,
  monthTitle,
  parseDateKey,
  today,
} from "../lib/format";
import { PHOTO_POSES, PHOTO_POSE_LABELS } from "../lib/types";
import type { BodyEntry, PhotoPose, ProgressPhoto } from "../lib/types";
import { useT } from "../lib/i18n";

interface Props {
  photos: ProgressPhoto[];
  /** Замеры — чтобы под кадром показать вес того периода. */
  bodyEntries: BodyEntry[];
  onChangePhotos: (photos: ProgressPhoto[]) => void;
  onBack: () => void;
}

const POSE_KEY = "repeat_last_pose";

function loadLastPose(): PhotoPose {
  try {
    const value = localStorage.getItem(POSE_KEY);
    if (value === "front" || value === "side" || value === "back") return value;
  } catch {
    /* ignore */
  }
  return "front";
}

function saveLastPose(pose: PhotoPose): void {
  try {
    localStorage.setItem(POSE_KEY, pose);
  } catch {
    /* ignore */
  }
}

function sortByDate<T extends { date: string }>(items: T[], desc = false): T[] {
  return [...items].sort((a, b) =>
    a.date === b.date ? 0 : (a.date < b.date) === desc ? 1 : -1,
  );
}

/**
 * Весь склад фото отдельным экраном: в профиле он разрастался и выдавливал
 * всё остальное. Здесь — лента по месяцам, фильтр по ракурсу и просмотрщик.
 */
export default function PhotosScreen({
  photos,
  bodyEntries,
  onChangePhotos,
  onBack,
}: Props) {
  const t = useT();
  // Открытый кадр — индексом в текущей выборке: лайтбокс листает соседей.
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  // Полные кадры грузим по требованию: текущий и соседние.
  const [fulls, setFulls] = useState<Record<string, string>>({});
  const [poseFilter, setPoseFilter] = useState<PhotoPose | null>(null);
  // Ракурс спрашиваем сразу после загрузки, по умолчанию — прошлый выбранный.
  const [posingIds, setPosingIds] = useState<string[] | null>(null);
  const [lastPose, setLastPose] = useState<PhotoPose>(loadLastPose);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addPhotos(files: FileList) {
    const added: ProgressPhoto[] = [];
    for (const file of Array.from(files)) {
      const { full, thumb } = await fileToPhoto(file);
      const id = newId();
      // Полный кадр — отдельным ключом, в списке только превью.
      await savePhotoFull(id, full);
      added.push({ id, date: today(), pose: lastPose, thumb });
    }
    onChangePhotos([...photos, ...added]);
    // Ракурс можно поправить сразу после загрузки — спрашиваем один раз на пачку.
    if (added.length > 0) setPosingIds(added.map((p) => p.id));
  }

  function setPose(ids: string[], pose: PhotoPose) {
    setLastPose(pose);
    saveLastPose(pose);
    onChangePhotos(photos.map((p) => (ids.includes(p.id) ? { ...p, pose } : p)));
  }

  function removePhoto(id: string) {
    void deletePhotoFull(id);
    onChangePhotos(photos.filter((p) => p.id !== id));
  }

  /** Вес ближайшего замера к дате кадра (±7 дней) — контекст для сравнения. */
  function weightNear(date: string): { value: number; exact: boolean } | null {
    let best: { value: number; diff: number } | null = null;
    for (const entry of bodyEntries) {
      if (entry.weightKg == null) continue;
      const diff = Math.abs(daysBetween(entry.date, date));
      if (diff > 7) continue;
      if (!best || diff < best.diff) best = { value: entry.weightKg, diff };
    }
    return best ? { value: best.value, exact: best.diff === 0 } : null;
  }

  const photosDesc = useMemo(() => sortByDate(photos, true), [photos]);
  const shown = useMemo(
    () => (poseFilter ? photosDesc.filter((p) => p.pose === poseFilter) : photosDesc),
    [photosDesc, poseFilter],
  );
  // Группируем по месяцам: лента перестаёт быть бесконечной сеткой.
  const byMonth = shown.reduce<Array<{ key: string; title: string; items: ProgressPhoto[] }>>(
    (acc, photo) => {
      const key = photo.date.slice(0, 7);
      const last = acc[acc.length - 1];
      if (last && last.key === key) last.items.push(photo);
      else acc.push({ key, title: monthTitle(parseDateKey(photo.date)), items: [photo] });
      return acc;
    },
    [],
  );
  // Пока полный кадр не подгружен, лайтбокс показывает превью — без пустых мест.
  const slides = shown.map((photo) => ({
    src: fulls[photo.id] ?? photo.thumb ?? photo.dataUrl ?? "",
    alt: formatDate(photo.date),
  }));

  useEffect(() => {
    if (viewIndex == null) return;
    // Текущий кадр и соседи — чтобы свайп не упирался в загрузку.
    const wanted = [viewIndex - 1, viewIndex, viewIndex + 1]
      .map((i) => shown[i])
      .filter((p): p is ProgressPhoto => Boolean(p) && !fulls[p.id]);
    if (wanted.length === 0) return;
    let alive = true;
    void Promise.all(
      wanted.map(async (photo) => [photo.id, await loadPhotoFull(photo.id)] as const),
    ).then((loaded) => {
      if (!alive) return;
      setFulls((prev) => {
        const next = { ...prev };
        for (const [id, full] of loaded) if (full) next[id] = full;
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [viewIndex, shown, fulls]);

  return (
    <Box sx={{ pb: 6 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
        <IconButton onClick={onBack} edge="start" aria-label={t("Назад", "Back")}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h1" sx={{ flex: 1 }}>
          {t("Фото прогресса", "Progress photos")}
        </Typography>
        {photos.length > 0 && (
          <IconButton
            color="primary"
            onClick={() => fileRef.current?.click()}
            aria-label={t("Добавить фото", "Add photo")}
          >
            <PhotoCameraIcon />
          </IconButton>
        )}
      </Stack>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) void addPhotos(e.target.files);
          e.target.value = "";
        }}
      />

      {photos.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, textAlign: "center" }}>
          <Box
            sx={{
              width: 52,
              height: 52,
              mx: "auto",
              mb: 1.5,
              borderRadius: 2,
              display: "grid",
              placeItems: "center",
              color: "primary.main",
              backgroundImage: `linear-gradient(135deg, ${alpha("#4ade80", 0.28)}, ${alpha("#4ade80", 0.08)})`,
            }}
          >
            <PhotoCameraIcon />
          </Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
            {t("Снимай, чтобы видеть путь", "Shoot to see the change")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t(
              "Фото показывает то, чего не видят весы: осанку, рельеф, объёмы. Снимай раз в пару недель — и прогресс станет очевидным, даже когда цифры стоят.",
              "Photos show what the scale can't: posture, definition, volume. Shoot every couple of weeks — progress becomes obvious even when the numbers stall.",
            )}
          </Typography>
          <Button variant="contained" startIcon={<PhotoCameraIcon />} onClick={() => fileRef.current?.click()}>
            {t("Добавить первое фото", "Add your first photo")}
          </Button>
        </Paper>
      ) : (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            <FavoriteBorderRoundedIcon sx={{ fontSize: 13, verticalAlign: "-2px", mr: 0.5 }} />
            {t(
              "Видно то, что не покажут весы. Снимай раз в пару недель.",
              "It shows what the scale won't. Shoot every couple of weeks.",
            )}
          </Typography>
          {/* Фильтр по ракурсу: сравнивать имеет смысл одинаковые кадры */}
          <Box sx={{ display: "flex", gap: 0.75, overflowX: "auto", pb: 1.5, mx: -0.5, px: 0.5 }}>
            <Chip
              size="small"
              label={`${t("Все", "All")} · ${photos.length}`}
              color={poseFilter === null ? "primary" : "default"}
              variant={poseFilter === null ? "filled" : "outlined"}
              onClick={() => setPoseFilter(null)}
            />
            {PHOTO_POSES.map((pose) => {
              const count = photos.filter((p) => p.pose === pose).length;
              if (count === 0) return null;
              return (
                <Chip
                  key={pose}
                  size="small"
                  label={`${PHOTO_POSE_LABELS[pose]} · ${count}`}
                  color={poseFilter === pose ? "primary" : "default"}
                  variant={poseFilter === pose ? "filled" : "outlined"}
                  onClick={() => setPoseFilter(poseFilter === pose ? null : pose)}
                  sx={{ flexShrink: 0 }}
                />
              );
            })}
          </Box>

          {/* Лента по месяцам, а не бесконечная сетка */}
          {byMonth.map((month) => (
            <Box key={month.key} sx={{ mb: 2 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mb: 0.75, textTransform: "capitalize" }}
              >
                {month.title} · {month.items.length}
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0.5 }}>
                {month.items.map((photo) => (
                  <Box
                    key={photo.id}
                    component="button"
                    onClick={() => setViewIndex(shown.indexOf(photo))}
                    sx={{
                      position: "relative",
                      aspectRatio: "3 / 4",
                      p: 0,
                      border: "none",
                      borderRadius: 2,
                      overflow: "hidden",
                      cursor: "pointer",
                      bgcolor: "background.paper",
                    }}
                  >
                    <Box
                      component="img"
                      src={photo.thumb ?? photo.dataUrl}
                      alt={formatDate(photo.date)}
                      loading="lazy"
                      sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    <Typography
                      variant="caption"
                      sx={{
                        position: "absolute",
                        left: 4,
                        bottom: 4,
                        px: 0.5,
                        borderRadius: 1,
                        bgcolor: "rgba(0,0,0,0.55)",
                        color: "#fff",
                      }}
                    >
                      {formatDate(photo.date)}
                    </Typography>
                    {photo.pose && (
                      <Typography
                        variant="caption"
                        sx={{
                          position: "absolute",
                          right: 4,
                          top: 4,
                          px: 0.5,
                          borderRadius: 1,
                          bgcolor: "rgba(0,0,0,0.55)",
                          color: "#fff",
                          fontSize: 10,
                        }}
                      >
                        {PHOTO_POSE_LABELS[photo.pose]}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </>
      )}

      {/* Просмотр: свайп между кадрами, зум, действия внизу */}
      <Lightbox
        open={viewIndex != null}
        index={viewIndex ?? 0}
        close={() => setViewIndex(null)}
        slides={slides}
        plugins={[Zoom, Counter]}
        // Лупу не показываем: зум делается щипком и двойным тапом, кнопка лишняя.
        toolbar={{ buttons: ["close"] }}
        carousel={{ finite: true }}
        controller={{ closeOnBackdropClick: true }}
        on={{ view: ({ index }) => setViewIndex(index) }}
        styles={{ container: { backgroundColor: "rgba(0,0,0,.92)" } }}
        render={{
          // Кнопки зума плагин добавляет сам — гасим их рендером.
          buttonZoom: () => null,
          // Действия рисуем один раз поверх лайтбокса — по активному кадру.
          controls: () => {
            const photo = viewIndex != null ? shown[viewIndex] : null;
            if (!photo) return null;
            const weight = weightNear(photo.date);
            return (
              <Box
                sx={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 3,
                  p: 1.5,
                  pb: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
                  background: "linear-gradient(transparent, rgba(0,0,0,.75) 40%)",
                  pointerEvents: "none",
                }}
              >
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center", mb: 1, pointerEvents: "auto" }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ color: "#fff", fontWeight: 700 }}>
                      {formatDate(photo.date)}
                    </Typography>
                    {weight && (
                      <Typography variant="caption" sx={{ color: "rgba(255,255,255,.7)" }}>
                        {weight.exact ? "" : "≈ "}
                        {formatWeight(weight.value)} {t("кг", "kg")}
                      </Typography>
                    )}
                  </Box>
                  <Button
                    size="small"
                    color="error"
                    startIcon={<DeleteOutlineIcon />}
                    onClick={() => {
                      removePhoto(photo.id);
                      // Список сдвинулся: закрываем, если кадров больше нет.
                      setViewIndex(shown.length > 1 ? Math.max(0, (viewIndex ?? 1) - 1) : null);
                    }}
                  >
                    {t("Удалить", "Delete")}
                  </Button>
                </Stack>
                <Stack direction="row" spacing={0.75} sx={{ pointerEvents: "auto" }}>
                  {PHOTO_POSES.map((pose) => (
                    <Chip
                      key={pose}
                      size="small"
                      label={PHOTO_POSE_LABELS[pose]}
                      color={photo.pose === pose ? "primary" : "default"}
                      variant={photo.pose === pose ? "filled" : "outlined"}
                      onClick={() => setPose([photo.id], pose)}
                      sx={
                        photo.pose === pose
                          ? undefined
                          : { color: "#fff", borderColor: "rgba(255,255,255,.5)" }
                      }
                    />
                  ))}
                </Stack>
              </Box>
            );
          },
        }}
      />

      {/* Ракурс спрашиваем сразу после загрузки — иначе сравнение потом не собрать */}
      <Dialog open={Boolean(posingIds)} onClose={() => setPosingIds(null)} fullWidth>
        <DialogTitle sx={{ pb: 1 }}>{t("Какой это ракурс?", "Which angle is this?")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t(
              "Нужно, чтобы потом сравнивать одинаковые кадры между собой.",
              "Needed so you can compare like with like later on.",
            )}
          </Typography>
          <Stack direction="row" spacing={1}>
            {PHOTO_POSES.map((pose) => (
              <Button
                key={pose}
                fullWidth
                variant={lastPose === pose ? "contained" : "outlined"}
                onClick={() => {
                  if (posingIds) setPose(posingIds, pose);
                  setPosingIds(null);
                }}
              >
                {PHOTO_POSE_LABELS[pose]}
              </Button>
            ))}
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
