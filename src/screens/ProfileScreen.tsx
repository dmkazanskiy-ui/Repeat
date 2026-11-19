import { setGlobalUnit, unitLabel, useGlobalUnit } from "../lib/units";
import type { WeightUnit } from "../lib/units";
import { useState } from "react";
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
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import MoodPad from "../components/MoodPad";
import BackupPanel from "../components/BackupPanel";
import type { BackupData } from "../lib/backup";
import type { Exercise } from "../lib/types";
import { newRecoveryEntry } from "../lib/store";
import { today } from "../lib/format";
import { moodReading, recoveryAverage } from "../lib/types";
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
import { applyTextScale, loadTextScale } from "../lib/a11y";
import type { TextScale } from "../lib/a11y";
import { loadThemePref, MODE, resolveMode, saveThemePref } from "../lib/themeMode";
import type { ThemePref } from "../lib/themeMode";
import type { RecoveryEntry, TrainingProgram } from "../lib/types";
import { ink } from "../lib/themeMode";

interface Props {
  recovery: RecoveryEntry[];
  programs: TrainingProgram[];
  focusGoal: FocusGoal | null;
  onOpenPrograms: () => void;
  onChangeRecovery: (entries: RecoveryEntry[]) => void;
  onChangeFocusGoal: (goal: FocusGoal | null) => void;
  onChangeLang: (lang: Lang) => void;
  /** Снимок данных для выгрузки истории и восстановление из вставки. */
  backupData: BackupData;
  allExercises: Exercise[];
  onRestore: (next: BackupData) => void;
}

const RECOVERY_BLUE = ink("#38bdf8");
const PROGRAM_AMBER = ink("#f59e0b");

/** EN-подписи (локально, чтобы не тянуть lang через весь lib). */
const GOAL_EN: Record<FocusGoal, string> = {
  strength: "Build strength",
  muscle: "Gain muscle",
  endurance: "Get fitter",
  weight_loss: "Lose weight",
};
export default function ProfileScreen({
  recovery,
  programs,
  focusGoal,
  onOpenPrograms,
  onChangeRecovery,
  onChangeFocusGoal,
  onChangeLang,
  backupData,
  allExercises,
  onRestore,
}: Props) {
  const lang = useLang();
  const t = useT();
  const activeProgram = programs.find((p) => !p.archivedAt) ?? null;
  const [checkin, setCheckin] = useState<RecoveryEntry | null>(null);
  // Настройки таймера отдыха: устройство, не аккаунт — держим в localStorage.
  const [restOn, setRestOn] = useState(loadRestEnabled);
  const [textScale, setTextScale] = useState<TextScale>(loadTextScale);
  const [themePref, setThemePref] = useState<ThemePref>(loadThemePref);
  const weightUnit = useGlobalUnit();
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
              role="button"
              tabIndex={0}
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
        role="button"
        tabIndex={0}
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

      {/* Самочувствие */}
      <Typography variant="h2" sx={{ mt: 4, mb: 1.5 }}>
        {t("Самочувствие", "How you feel")}
      </Typography>
      <Paper
        variant="outlined"
        role="button"
        tabIndex={0}
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
              color: ink("#a78bfa"),
              backgroundImage: `linear-gradient(135deg, ${alpha(ink("#a78bfa"), 0.28)}, ${alpha(ink("#a78bfa"), 0.08)})`,
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
                sx={{ minWidth: 44, minHeight: 36, px: 1, fontWeight: 700 }}
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
                sx={{ minWidth: 44, minHeight: 36, px: 1, fontWeight: 700 }}
              >
                +15
              </Button>
            </Stack>
          </>
        )}
        <Divider sx={{ my: 1.5 }} />
        {/* Тема: «Авто» — как в Telegram/системе. Смена перезапускает приложение. */}
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            {t("Тема", "Theme")}
          </Typography>
          <ToggleButtonGroup
            value={themePref}
            exclusive
            size="small"
            onChange={(_, v: ThemePref | null) => {
              if (v == null || v === themePref) return;
              setThemePref(v);
              saveThemePref(v);
              if (resolveMode(v) !== MODE) window.location.reload();
            }}
            aria-label={t("Тема", "Theme")}
          >
            {(["auto", "light", "dark"] as const).map((v) => (
              <ToggleButton key={v} value={v} sx={{ minHeight: 36, px: 1.25, textTransform: "none", fontSize: 13 }}>
                {{ auto: t("Авто", "Auto"), light: t("Светлая", "Light"), dark: t("Тёмная", "Dark") }[v]}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Stack>
        {/* Единицы веса: в данных всегда кг, это только показ и ввод. У упражнения
            может быть своя единица — выбирается прямо в поле веса подхода. */}
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            {t("Единицы веса", "Weight units")}
          </Typography>
          <ToggleButtonGroup
            value={weightUnit}
            exclusive
            size="small"
            onChange={(_, v: WeightUnit | null) => {
              if (v) setGlobalUnit(v);
            }}
            aria-label={t("Единицы веса", "Weight units")}
          >
            {(["kg", "lb"] as const).map((v) => (
              <ToggleButton key={v} value={v} sx={{ minWidth: 44, minHeight: 36, px: 1.25, textTransform: "none", fontSize: 13 }}>
                {unitLabel(v)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Stack>
        {/* Размер интерфейса: Telegram не берёт системный размер шрифта iPhone. */}
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            {t("Размер текста", "Text size")}
          </Typography>
          <ToggleButtonGroup
            value={textScale}
            exclusive
            size="small"
            onChange={(_, v: TextScale | null) => {
              if (v == null) return;
              setTextScale(v);
              applyTextScale(v);
            }}
            aria-label={t("Размер текста", "Text size")}
          >
            {([100, 115, 130] as const).map((v, i) => (
              <ToggleButton
                key={v}
                value={v}
                aria-label={[t("Обычный", "Default"), t("Крупный", "Large"), t("Очень крупный", "Extra large")][i]}
                sx={{ minWidth: 44, minHeight: 36, textTransform: "none", fontSize: [13, 15, 17][i], fontWeight: 700 }}
              >
                {t("А", "A")}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Stack>
      </Paper>

      <BackupPanel data={backupData} allExercises={allExercises} onRestore={onRestore} />

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
            px: 1.5,
            minHeight: 32,
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
          color={ink("#4ade80")}
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
