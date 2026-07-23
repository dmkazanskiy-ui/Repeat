import { useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import CloseIcon from "@mui/icons-material/Close";
import NumberField from "../components/NumberField";
import MiniChart from "../components/MiniChart";
import { newBodyEntry, newRecoveryEntry } from "../lib/store";
import { fileToScaledDataUrl } from "../lib/image";
import { newId } from "../lib/id";
import { formatDate, today } from "../lib/format";
import { BODY_METRICS, RECOVERY_METRICS, recoveryAverage } from "../lib/types";
import type { BodyEntry, ProgressPhoto, RecoveryEntry } from "../lib/types";

interface Props {
  bodyEntries: BodyEntry[];
  photos: ProgressPhoto[];
  recovery: RecoveryEntry[];
  onChangeBody: (entries: BodyEntry[]) => void;
  onChangePhotos: (photos: ProgressPhoto[]) => void;
  onChangeRecovery: (entries: RecoveryEntry[]) => void;
}

function sortByDate<T extends { date: string }>(items: T[], desc = false): T[] {
  return [...items].sort((a, b) =>
    a.date === b.date ? 0 : (a.date < b.date) === desc ? 1 : -1,
  );
}

export default function ProfileScreen({
  bodyEntries,
  photos,
  recovery,
  onChangeBody,
  onChangePhotos,
  onChangeRecovery,
}: Props) {
  const [editing, setEditing] = useState<BodyEntry | null>(null);
  const [checkin, setCheckin] = useState<RecoveryEntry | null>(null);
  const [viewPhoto, setViewPhoto] = useState<ProgressPhoto | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const todayCheckin = recovery.find((e) => e.date === today()) ?? null;

  function saveCheckin(entry: RecoveryEntry) {
    const exists = recovery.some((e) => e.id === entry.id);
    onChangeRecovery(
      exists ? recovery.map((e) => (e.id === entry.id ? entry : e)) : [...recovery, entry],
    );
    setCheckin(null);
  }

  const asc = useMemo(() => sortByDate(bodyEntries), [bodyEntries]);

  const weightPoints = asc
    .filter((e) => e.weightKg != null)
    .map((e) => ({ label: formatDate(e.date), value: e.weightKg as number }));

  const currentWeight = weightPoints.at(-1)?.value ?? null;
  const prevWeight = weightPoints.at(-2)?.value ?? null;
  const weightDelta =
    currentWeight != null && prevWeight != null
      ? currentWeight - prevWeight
      : null;

  /** Последнее заполненное значение каждой метрики — сводка «как сейчас». */
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
      exists
        ? bodyEntries.map((e) => (e.id === entry.id ? entry : e))
        : [...bodyEntries, entry],
    );
    setEditing(null);
  }

  async function addPhotos(files: FileList) {
    const added: ProgressPhoto[] = [];
    for (const file of Array.from(files)) {
      const dataUrl = await fileToScaledDataUrl(file);
      added.push({ id: newId(), date: today(), dataUrl });
    }
    onChangePhotos([...photos, ...added]);
  }

  const photosDesc = sortByDate(photos, true);

  return (
    <Box sx={{ pb: 10 }}>
      <Typography variant="h1" sx={{ mb: 2 }}>
        Профиль
      </Typography>

      {/* Вес */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", mb: 1 }}>
          <Typography variant="h2">Вес</Typography>
          {currentWeight != null && (
            <>
              <Typography variant="h2" sx={{ ml: "auto" }}>
                {String(currentWeight).replace(".", ",")} кг
              </Typography>
              {weightDelta != null && weightDelta !== 0 && (
                <Typography
                  variant="caption"
                  sx={{ color: weightDelta < 0 ? "primary.main" : "text.secondary" }}
                >
                  {weightDelta > 0 ? "+" : ""}
                  {String(Number(weightDelta.toFixed(1))).replace(".", ",")}
                </Typography>
              )}
            </>
          )}
        </Stack>
        <MiniChart
          points={weightPoints}
          format={(v) => String(Number(v.toFixed(1))).replace(".", ",")}
        />
      </Paper>

      {/* Замеры — последние значения */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1,
          mb: 2,
        }}
      >
        {BODY_METRICS.filter((m) => m.key !== "weightKg").map((m) => {
          const value = latest(m.key);
          return (
            <Paper
              key={m.key}
              variant="outlined"
              sx={{ p: 1.5, borderRadius: 2, textAlign: "center" }}
            >
              <Typography variant="h2" sx={{ fontWeight: 700 }}>
                {value != null ? String(value).replace(".", ",") : "—"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {m.label}
              </Typography>
            </Paper>
          );
        })}
      </Box>

      <Button
        fullWidth
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={() => setEditing(newBodyEntry(today()))}
      >
        Добавить замер
      </Button>

      {/* Список замеров */}
      {bodyEntries.length > 0 && (
        <Stack spacing={1} sx={{ mt: 2 }}>
          {sortByDate(bodyEntries, true).map((entry) => (
            <Paper
              key={entry.id}
              variant="outlined"
              onClick={() => setEditing(entry)}
              sx={{
                p: 1.5,
                borderRadius: 1,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              <Typography variant="body2" sx={{ flex: 1 }}>
                {formatDate(entry.date)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {entry.weightKg != null
                  ? `${String(entry.weightKg).replace(".", ",")} кг`
                  : "замер"}
              </Typography>
            </Paper>
          ))}
        </Stack>
      )}

      {/* Самочувствие — субъективный чек-ин */}
      <Typography variant="h2" sx={{ mt: 4, mb: 1.5 }}>
        Самочувствие
      </Typography>
      <Paper
        variant="outlined"
        onClick={() => setCheckin(todayCheckin ?? newRecoveryEntry(today()))}
        sx={{ p: 2, borderRadius: 2, cursor: "pointer" }}
      >
        {todayCheckin && recoveryAverage(todayCheckin) != null ? (
          <>
            <Stack direction="row" sx={{ alignItems: "baseline" }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
                {recoveryAverage(todayCheckin)!.toFixed(1).replace(".", ",")} из 5
              </Typography>
              <Typography variant="caption" color="text.secondary">
                сегодня · изменить
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {RECOVERY_METRICS.map(
                (m) => `${m.label} ${todayCheckin[m.key] ?? "—"}`,
              ).join(" · ")}
            </Typography>
          </>
        ) : (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <AddIcon color="primary" fontSize="small" />
            <Typography variant="body2" color="primary">
              Отметить самочувствие сегодня
            </Typography>
          </Stack>
        )}
      </Paper>

      {/* Фото прогресса */}
      <Stack
        direction="row"
        sx={{ mt: 4, mb: 1.5, alignItems: "center", justifyContent: "space-between" }}
      >
        <Typography variant="h2">Фото прогресса</Typography>
        <IconButton
          color="primary"
          onClick={() => fileRef.current?.click()}
          aria-label="Добавить фото"
        >
          <PhotoCameraIcon />
        </IconButton>
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
        <Typography variant="body2" color="text.secondary">
          Снимай себя раз в пару недель — потом видно, как меняешься.
        </Typography>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 0.5,
          }}
        >
          {photosDesc.map((photo) => (
            <Box
              key={photo.id}
              component="button"
              onClick={() => setViewPhoto(photo)}
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
                src={photo.dataUrl}
                alt={formatDate(photo.date)}
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
            </Box>
          ))}
        </Box>
      )}

      {/* Диалог замера */}
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

      <RecoveryDialog
        entry={checkin}
        onClose={() => setCheckin(null)}
        onSave={saveCheckin}
        onDelete={
          checkin && recovery.some((e) => e.id === checkin.id)
            ? () => {
                onChangeRecovery(recovery.filter((e) => e.id !== checkin.id));
                setCheckin(null);
              }
            : undefined
        }
      />

      {/* Просмотр фото */}
      <Dialog open={Boolean(viewPhoto)} onClose={() => setViewPhoto(null)} fullWidth>
        {viewPhoto && (
          <>
            <Box
              component="img"
              src={viewPhoto.dataUrl}
              alt={formatDate(viewPhoto.date)}
              sx={{ width: "100%", display: "block" }}
            />
            <DialogActions sx={{ justifyContent: "space-between" }}>
              <Typography variant="body2" color="text.secondary" sx={{ pl: 1 }}>
                {formatDate(viewPhoto.date)}
              </Typography>
              <Button
                color="error"
                startIcon={<DeleteOutlineIcon />}
                onClick={() => {
                  onChangePhotos(photos.filter((p) => p.id !== viewPhoto.id));
                  setViewPhoto(null);
                }}
              >
                Удалить
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
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
  const [draft, setDraft] = useState<BodyEntry | null>(entry);

  // Синхронизируем черновик при каждом открытии новой записи.
  if (entry && draft?.id !== entry.id) setDraft(entry);

  if (!draft) return <Dialog open={false} onClose={onClose} />;

  return (
    <Dialog open={Boolean(entry)} onClose={onClose} fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Замер
        <IconButton
          onClick={onClose}
          sx={{ position: "absolute", right: 8, top: 8 }}
          aria-label="Закрыть"
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <TextField
          type="date"
          label="Дата"
          fullWidth
          value={draft.date}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          sx={{ mb: 2, mt: 1 }}
        />
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          {BODY_METRICS.map((m) => (
            <NumberField
              key={m.key}
              label={`${m.label}, ${m.unit}`}
              value={draft[m.key] as number | null}
              onChange={(value) => setDraft({ ...draft, [m.key]: value })}
            />
          ))}
        </Box>
        <TextField
          label="Заметка"
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
            Удалить
          </Button>
        ) : (
          <span />
        )}
        <Button variant="contained" onClick={() => onSave(draft)}>
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ScoreSelector({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <Stack direction="row" spacing={1}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Box
          key={n}
          component="button"
          onClick={() => onChange(value === n ? null : n)}
          sx={{
            flex: 1,
            py: 1,
            borderRadius: 2,
            border: "1px solid",
            borderColor: value === n ? "primary.main" : "divider",
            bgcolor: value === n ? "primary.main" : "transparent",
            color: value === n ? "primary.contrastText" : "text.primary",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          {n}
        </Box>
      ))}
    </Stack>
  );
}

function RecoveryDialog({
  entry,
  onClose,
  onSave,
  onDelete,
}: {
  entry: RecoveryEntry | null;
  onClose: () => void;
  onSave: (entry: RecoveryEntry) => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState<RecoveryEntry | null>(entry);
  if (entry && draft?.id !== entry.id) setDraft(entry);
  if (!draft) return <Dialog open={false} onClose={onClose} />;

  return (
    <Dialog open={Boolean(entry)} onClose={onClose} fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Самочувствие
        <IconButton
          onClick={onClose}
          sx={{ position: "absolute", right: 8, top: 8 }}
          aria-label="Закрыть"
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <TextField
          type="date"
          label="Дата"
          fullWidth
          value={draft.date}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          sx={{ mb: 2, mt: 1 }}
        />
        <Stack spacing={2}>
          {RECOVERY_METRICS.map((m) => (
            <Box key={m.key}>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                {m.label}
              </Typography>
              <ScoreSelector
                value={draft[m.key] as number | null}
                onChange={(v) => setDraft({ ...draft, [m.key]: v })}
              />
            </Box>
          ))}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
          1 — плохо, 5 — отлично. Свежесть: 1 забиты, 5 свежие.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between", px: 3, pb: 2 }}>
        {onDelete ? (
          <Button color="error" onClick={onDelete}>
            Удалить
          </Button>
        ) : (
          <span />
        )}
        <Button variant="contained" onClick={() => onSave(draft)}>
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  );
}
