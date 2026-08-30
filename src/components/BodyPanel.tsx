import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import NumberField from "./NumberField";
import MiniChart from "./MiniChart";
import { newBodyEntry } from "../lib/store";
import { formatDate, today } from "../lib/format";
import { BODY_METRICS } from "../lib/types";
import type { BodyEntry, ProgressPhoto } from "../lib/types";
import { useLang, useT } from "../lib/i18n";

interface Props {
  bodyEntries: BodyEntry[];
  photos: ProgressPhoto[];
  onChangeBody: (entries: BodyEntry[]) => void;
  onOpenPhotos: () => void;
}

/** EN-подписи (локально, чтобы не тянуть lang через весь lib). */
const METRIC_EN: Record<string, string> = {
  weightKg: "Weight",
  chest: "Chest",
  waist: "Waist",
  hips: "Hips",
  biceps: "Biceps",
  thigh: "Thigh",
  neck: "Neck",
};

function sortByDate<T extends { date: string }>(items: T[], desc = false): T[] {
  return [...items].sort((a, b) =>
    a.date === b.date ? 0 : (a.date < b.date) === desc ? 1 : -1,
  );
}

/**
 * Вкладка «Тело» в аналитике: вес, замеры и вход в галерею фото. Раньше всё
 * это жило в профиле и разрасталось там, выдавливая настройки и цель.
 */
export default function BodyPanel({ bodyEntries, photos, onChangeBody, onOpenPhotos }: Props) {
  const lang = useLang();
  const t = useT();
  const [editing, setEditing] = useState<BodyEntry | null>(null);

  const asc = useMemo(() => sortByDate(bodyEntries), [bodyEntries]);

  const weightPoints = asc
    .filter((e) => e.weightKg != null)
    .map((e) => ({ label: formatDate(e.date), value: e.weightKg as number }));

  const currentWeight = weightPoints.at(-1)?.value ?? null;
  const prevWeight = weightPoints.at(-2)?.value ?? null;
  const weightDelta =
    currentWeight != null && prevWeight != null ? currentWeight - prevWeight : null;

  function latest(key: keyof BodyEntry): number | null {
    for (const e of sortByDate(bodyEntries, true)) {
      const v = e[key];
      if (typeof v === "number") return v;
    }
    return null;
  }

  function saveEntry(entry: BodyEntry) {
    const exists = bodyEntries.some((e) => e.id === entry.id);
    onChangeBody(
      exists ? bodyEntries.map((e) => (e.id === entry.id ? entry : e)) : [...bodyEntries, entry],
    );
    setEditing(null);
  }

  const metricLabel = (key: string, ru: string) => (lang === "en" ? (METRIC_EN[key] ?? ru) : ru);
  const recentPhotos = sortByDate(photos, true).slice(0, 4);

  return (
    <Box>
      {/* Вес + замеры одним блоком */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ flex: 1 }}>
            {t("Вес", "Weight")}
          </Typography>
          {currentWeight != null && (
            <>
              <Typography sx={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
                {String(currentWeight).replace(".", ",")} {t("кг", "kg")}
              </Typography>
              {weightDelta != null && weightDelta !== 0 && (
                <Typography
                  variant="caption"
                  sx={{ color: weightDelta < 0 ? "primary.main" : "text.secondary", fontWeight: 700 }}
                >
                  {weightDelta > 0 ? "+" : ""}
                  {String(Number(weightDelta.toFixed(1))).replace(".", ",")}
                </Typography>
              )}
            </>
          )}
        </Stack>
        {weightPoints.length > 0 ? (
          <Box sx={{ mt: 1 }}>
            <MiniChart
              points={weightPoints}
              format={(v) => String(Number(v.toFixed(1))).replace(".", ",")}
            />
          </Box>
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            {t("Добавь замер — появится график веса.", "Add a measurement to see your weight chart.")}
          </Typography>
        )}

        <Divider sx={{ my: 2 }} />

        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          {t("Замеры", "Measurements")}
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>
          {BODY_METRICS.filter((m) => m.key !== "weightKg").map((m) => {
            const value = latest(m.key);
            return (
              <Box key={m.key} sx={{ p: 1.25, borderRadius: 2, bgcolor: "action.hover", textAlign: "center" }}>
                <Typography sx={{ fontSize: 18, fontWeight: 800 }}>
                  {value != null ? String(value).replace(".", t(",", ".")) : "—"}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                  {metricLabel(m.key, m.label)}
                </Typography>
              </Box>
            );
          })}
        </Box>

        <Button
          fullWidth
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setEditing(newBodyEntry(today()))}
          sx={{ mt: 2 }}
        >
          {t("Добавить замер", "Add measurement")}
        </Button>
      </Paper>

      {/* История замеров */}
      {bodyEntries.length > 0 && (
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          {sortByDate(bodyEntries, true).map((entry) => (
            <Paper
              key={entry.id}
              variant="outlined"
              onClick={() => setEditing(entry)}
              sx={{ p: 1.5, borderRadius: 2, cursor: "pointer", display: "flex", alignItems: "center" }}
            >
              <Typography variant="body2" sx={{ flex: 1 }}>
                {formatDate(entry.date)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {entry.weightKg != null
                  ? `${String(entry.weightKg).replace(".", ",")} ${t("кг", "kg")}`
                  : t("замер", "measurement")}
              </Typography>
            </Paper>
          ))}
        </Stack>
      )}


      {/* Фото — карточкой: весь склад живёт на своём экране */}
      <Typography variant="h2" sx={{ mt: 4, mb: 1.5 }}>
        {t("Фото прогресса", "Progress photos")}
      </Typography>
      <Paper
        variant="outlined"
        onClick={onOpenPhotos}
        sx={{
          p: 1.5,
          borderRadius: 2,
          cursor: "pointer",
          borderColor: alpha("#4ade80", 0.3),
          backgroundImage: `linear-gradient(100deg, ${alpha("#4ade80", 0.08)}, transparent 72%)`,
        }}
      >
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: 2,
              flexShrink: 0,
              display: "grid",
              placeItems: "center",
              color: "primary.main",
              backgroundImage: `linear-gradient(135deg, ${alpha("#4ade80", 0.28)}, ${alpha("#4ade80", 0.08)})`,
            }}
          >
            <PhotoCameraIcon fontSize="small" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {photos.length > 0
                ? `${photos.length} ${t("фото", "photos")}`
                : t("Снимай, чтобы видеть путь", "Shoot to see the change")}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {photos.length > 0
                ? t("Вся галерея и сравнение", "Full gallery and comparison")
                : t("Фото показывает то, чего не видят весы", "Photos show what the scale can't")}
            </Typography>
          </Box>
          <ChevronRightRoundedIcon sx={{ color: "text.secondary" }} />
        </Stack>

        {recentPhotos.length > 0 && (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0.5, mt: 1.5 }}>
            {recentPhotos.map((photo) => (
              <Box
                key={photo.id}
                component="img"
                src={photo.thumb ?? photo.dataUrl}
                alt={formatDate(photo.date)}
                loading="lazy"
                sx={{ width: "100%", aspectRatio: "3 / 4", objectFit: "cover", borderRadius: 1.5 }}
              />
            ))}
          </Box>
        )}
      </Paper>

      <MeasurementDialog
        entry={editing}
        onClose={() => setEditing(null)}
        onSave={saveEntry}
        onDelete={
          editing && bodyEntries.some((e) => e.id === editing.id)
            ? () => {
                onChangeBody(bodyEntries.filter((e) => e.id !== editing.id));
                setEditing(null);
              }
            : undefined
        }
      />
    </Box>
  );
}

function MeasurementDialog({
  entry,
  onClose,
  onSave,
  onDelete,
}: {
  entry: BodyEntry | null;
  onClose: () => void;
  onSave: (entry: BodyEntry) => void;
  onDelete?: () => void;
}) {
  const lang = useLang();
  const t = useT();
  const [draft, setDraft] = useState<BodyEntry | null>(entry);

  if (entry && draft?.id !== entry.id) setDraft(entry);
  if (!draft) return <Dialog open={false} onClose={onClose} />;

  return (
    <Dialog open={Boolean(entry)} onClose={onClose} fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        {t("Замер", "Measurement")}
        <IconButton onClick={onClose} sx={{ position: "absolute", right: 8, top: 8 }} aria-label={t("Закрыть", "Close")}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <TextField
          type="date"
          label={t("Дата", "Date")}
          fullWidth
          value={draft.date}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          sx={{ mb: 2, mt: 1 }}
        />
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          {BODY_METRICS.map((m) => (
            <NumberField
              key={m.key}
              label={`${lang === "en" ? (METRIC_EN[m.key] ?? m.label) : m.label}, ${m.unit === "кг" ? t("кг", "kg") : t("см", "cm")}`}
              value={draft[m.key] as number | null}
              onChange={(value) => setDraft({ ...draft, [m.key]: value })}
            />
          ))}
        </Box>
        <TextField
          label={t("Заметка", "Note")}
          fullWidth
          multiline
          minRows={2}
          value={draft.notes ?? ""}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value || null })}
          sx={{ mt: 2 }}
        />
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between", px: 3, pb: 2 }}>
        {onDelete ? (
          <Button color="error" onClick={onDelete}>
            {t("Удалить", "Delete")}
          </Button>
        ) : (
          <span />
        )}
        <Button variant="contained" onClick={() => onSave(draft)}>
          {t("Сохранить", "Save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

