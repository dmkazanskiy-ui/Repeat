import { useMemo, useRef, useState } from "react";
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
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import CloseIcon from "@mui/icons-material/Close";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import FavoriteBorderRoundedIcon from "@mui/icons-material/FavoriteBorderRounded";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import NumberField from "../components/NumberField";
import MiniChart from "../components/MiniChart";
import MoodPad from "../components/MoodPad";
import { newBodyEntry, newRecoveryEntry } from "../lib/store";
import { fileToScaledDataUrl } from "../lib/image";
import { newId } from "../lib/id";
import { formatDate, today } from "../lib/format";
import { BODY_METRICS, moodReading, recoveryAverage } from "../lib/types";
import { ActivityIcon } from "../lib/icons";
import { FOCUS_GOALS } from "../lib/workoutBuilder";
import type { FocusGoal } from "../lib/workoutBuilder";
import {
  clampRestSec,
  loadRestEnabled,
  loadRestSec,
  saveRestEnabled,
  saveRestSec,
} from "../lib/restTimer";
import { useLang, useT } from "../lib/i18n";
import type { Lang } from "../lib/i18n";
import type {
  BodyEntry,
  ProgressPhoto,
  RecoveryEntry,
  TrainingProgram,
} from "../lib/types";

interface Props {
  bodyEntries: BodyEntry[];
  photos: ProgressPhoto[];
  recovery: RecoveryEntry[];
  programs: TrainingProgram[];
  focusGoal: FocusGoal | null;
  onOpenPrograms: () => void;
  onChangeBody: (entries: BodyEntry[]) => void;
  onChangePhotos: (photos: ProgressPhoto[]) => void;
  onChangeRecovery: (entries: RecoveryEntry[]) => void;
  onChangeFocusGoal: (goal: FocusGoal | null) => void;
  onChangeLang: (lang: Lang) => void;
}

const RECOVERY_BLUE = "#38bdf8";
const PROGRAM_AMBER = "#f59e0b";

/** EN-подписи (локально, чтобы не тянуть lang через весь lib). */
const GOAL_EN: Record<FocusGoal, string> = {
  strength: "Build strength",
  muscle: "Gain muscle",
  endurance: "Get fitter",
  weight_loss: "Lose weight",
};
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

export default function ProfileScreen({
  bodyEntries,
  photos,
  recovery,
  programs,
  focusGoal,
  onOpenPrograms,
  onChangeBody,
  onChangePhotos,
  onChangeRecovery,
  onChangeFocusGoal,
  onChangeLang,
}: Props) {
  const lang = useLang();
  const t = useT();
  const activeProgram = programs.find((p) => !p.archivedAt) ?? null;
  const [editing, setEditing] = useState<BodyEntry | null>(null);
  const [checkin, setCheckin] = useState<RecoveryEntry | null>(null);
  const [viewPhoto, setViewPhoto] = useState<ProgressPhoto | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Настройки таймера отдыха: устройство, не аккаунт — держим в localStorage.
  const [restOn, setRestOn] = useState(loadRestEnabled);
  const [restSec, setRestSec] = useState(loadRestSec);

  function toggleRest(on: boolean) {
    setRestOn(on);
    saveRestEnabled(on);
  }

  function changeRestSec(delta: number) {
    const next = clampRestSec(restSec + delta);
    setRestSec(next);
    saveRestSec(next);
  }

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

  async function addPhotos(files: FileList) {
    const added: ProgressPhoto[] = [];
    for (const file of Array.from(files)) {
      const dataUrl = await fileToScaledDataUrl(file);
      added.push({ id: newId(), date: today(), dataUrl });
    }
    onChangePhotos([...photos, ...added]);
  }

  const photosDesc = sortByDate(photos, true);
  const metricLabel = (key: string, ru: string) => (lang === "en" ? (METRIC_EN[key] ?? ru) : ru);

  return (
    <Box sx={{ pb: 10 }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Typography variant="h1">{t("Профиль", "Profile")}</Typography>
        <LangToggle lang={lang} onChange={onChangeLang} />
      </Stack>

      {/* Цель — влияет на подбор «Тренером» */}
      <Typography variant="h2" sx={{ mb: 1 }}>
        {t("Моя цель", "My goal")}
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1, mb: 3 }}>
        {FOCUS_GOALS.map((g) => {
          const active = focusGoal === g.goal;
          return (
            <Box
              key={g.goal}
              onClick={() => onChangeFocusGoal(active ? null : g.goal)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.25,
                p: 1.25,
                borderRadius: 2,
                cursor: "pointer",
                border: "1px solid",
                borderColor: active ? alpha(g.color, 0.5) : "divider",
                backgroundImage: active
                  ? `linear-gradient(100deg, ${alpha(g.color, 0.12)}, transparent 72%)`
                  : "none",
              }}
            >
              <Box
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: 2,
                  flexShrink: 0,
                  display: "grid",
                  placeItems: "center",
                  color: g.color,
                  backgroundImage: `linear-gradient(135deg, ${alpha(g.color, 0.28)}, ${alpha(g.color, 0.08)})`,
                }}
              >
                <ActivityIcon icon={g.icon} fontSize="small" />
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                {lang === "en" ? GOAL_EN[g.goal] : g.label}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {/* Программа */}
      <Paper
        variant="outlined"
        onClick={onOpenPrograms}
        sx={{
          p: 1.5,
          mb: 3,
          borderRadius: 2,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          borderColor: alpha(PROGRAM_AMBER, 0.25),
          borderLeft: `3px solid ${PROGRAM_AMBER}`,
          backgroundImage: `linear-gradient(100deg, ${alpha(PROGRAM_AMBER, 0.1)}, transparent 72%)`,
        }}
      >
        <Box
          sx={{
            width: 42,
            height: 42,
            borderRadius: 2,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            color: PROGRAM_AMBER,
            backgroundImage: `linear-gradient(135deg, ${alpha(PROGRAM_AMBER, 0.28)}, ${alpha(PROGRAM_AMBER, 0.08)})`,
          }}
        >
          <FitnessCenterIcon fontSize="small" />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {t("Программа", "Program")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {activeProgram
              ? `${activeProgram.name} · ${t("сплит", "split")} ${activeProgram.workouts.length} ${t("дн.", activeProgram.workouts.length === 1 ? "day" : "days")}`
              : t("Собери сплит A/B/C/D", "Build an A/B/C/D split")}
          </Typography>
        </Box>
        <ChevronRightRoundedIcon sx={{ color: "text.secondary" }} />
      </Paper>

      {/* Тело: вес + замеры + кнопка — единый блок */}
      <Typography variant="h2" sx={{ mb: 1.5 }}>
        {t("Тело", "Body")}
      </Typography>
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

      {/* Самочувствие */}
      <Typography variant="h2" sx={{ mt: 4, mb: 1.5 }}>
        {t("Самочувствие", "How you feel")}
      </Typography>
      <Paper
        variant="outlined"
        onClick={() => setCheckin(todayCheckin ?? newRecoveryEntry(today()))}
        sx={{
          p: 2,
          borderRadius: 2,
          cursor: "pointer",
          borderColor: alpha(RECOVERY_BLUE, 0.25),
          borderLeft: `3px solid ${RECOVERY_BLUE}`,
          backgroundImage: `linear-gradient(100deg, ${alpha(RECOVERY_BLUE, 0.1)}, transparent 72%)`,
        }}
      >
        {todayCheckin && recoveryAverage(todayCheckin) != null ? (
          <>
            <Stack direction="row" sx={{ alignItems: "baseline" }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>
                {recoveryAverage(todayCheckin)!.toFixed(1).replace(".", ",")} {t("из 5", "of 5")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("сегодня · изменить", "today · edit")}
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {todayCheckin.mood
                ? t(moodReading("daily", todayCheckin.mood), "energy & mood noted")
                : t("отмечено", "noted")}
            </Typography>
          </>
        ) : (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", color: RECOVERY_BLUE }}>
            <AddIcon fontSize="small" />
            <Typography variant="body2">
              {t("Отметить самочувствие сегодня", "Log how you feel today")}
            </Typography>
          </Stack>
        )}
      </Paper>

      {/* Фото прогресса — с акцентом «зачем» */}
      <Stack direction="row" sx={{ mt: 4, mb: 1.5, alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="h2">{t("Фото прогресса", "Progress photos")}</Typography>
        {photos.length > 0 && (
          <IconButton color="primary" onClick={() => fileRef.current?.click()} aria-label={t("Добавить фото", "Add photo")}>
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
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0.5 }}>
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
        </>
      )}

      {/* Настройки — пока только таймер отдыха между подходами */}
      <Typography variant="h2" sx={{ mt: 4, mb: 1.5 }}>
        {t("Настройки", "Settings")}
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: 2,
              flexShrink: 0,
              display: "grid",
              placeItems: "center",
              color: "#a78bfa",
              backgroundImage: `linear-gradient(135deg, ${alpha("#a78bfa", 0.28)}, ${alpha("#a78bfa", 0.08)})`,
            }}
          >
            <TimerOutlinedIcon fontSize="small" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {t("Таймер отдыха", "Rest timer")}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t(
                "Появляется, когда отмечаешь подход выполненным",
                "Shows up when you tick a set as done",
              )}
            </Typography>
          </Box>
          <Switch
            checked={restOn}
            onChange={(event) => toggleRest(event.target.checked)}
            slotProps={{ input: { "aria-label": t("Таймер отдыха", "Rest timer") } }}
          />
        </Stack>
        {restOn && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                {t("Отдых по умолчанию", "Default rest")}
              </Typography>
              <Button
                size="small"
                variant="outlined"
                onClick={() => changeRestSec(-15)}
                sx={{ minWidth: 0, px: 1, fontWeight: 700 }}
              >
                −15
              </Button>
              <Typography
                sx={{ fontWeight: 800, minWidth: 56, textAlign: "center", fontVariantNumeric: "tabular-nums" }}
              >
                {`${Math.floor(restSec / 60)}:${String(restSec % 60).padStart(2, "0")}`}
              </Typography>
              <Button
                size="small"
                variant="outlined"
                onClick={() => changeRestSec(15)}
                sx={{ minWidth: 0, px: 1, fontWeight: 700 }}
              >
                +15
              </Button>
            </Stack>
          </>
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
                {t("Удалить", "Delete")}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}

function LangToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <Box sx={{ display: "flex", border: "1px solid", borderColor: "divider", borderRadius: 999, overflow: "hidden" }}>
      {(["ru", "en"] as const).map((l) => (
        <Box
          key={l}
          component="button"
          onClick={() => onChange(l)}
          sx={{
            px: 1.25,
            py: 0.5,
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 700,
            bgcolor: lang === l ? "primary.main" : "transparent",
            color: lang === l ? "primary.contrastText" : "text.secondary",
          }}
        >
          {l.toUpperCase()}
        </Box>
      ))}
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
  const t = useT();
  const [draft, setDraft] = useState<RecoveryEntry | null>(entry);
  if (entry && draft?.id !== entry.id) setDraft(entry);
  if (!draft) return <Dialog open={false} onClose={onClose} />;

  const yLabels: [string, string] = [t("Нет сил", "No energy"), t("Полон энергии", "Full of energy")];
  const xLabels: [string, string] = [t("Плохое настроение", "Bad mood"), t("Хорошее", "Good")];

  return (
    <Dialog open={Boolean(entry)} onClose={onClose} fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        {t("Самочувствие", "How you feel")}
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
        <Typography variant="body2" color="text.secondary">
          {t("Отметь точку: где ты сейчас по энергии и настроению.", "Mark the point: your energy and mood right now.")}
        </Typography>
        <MoodPad
          value={draft.mood ?? null}
          onChange={(m) => setDraft({ ...draft, mood: m })}
          yLabels={yLabels}
          xLabels={xLabels}
          color="#4ade80"
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
