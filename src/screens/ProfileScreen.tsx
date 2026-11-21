import { motion, tr } from "../ui";
import { Card, IconBadge, radius } from "../ui";
import { setGlobalUnit, unitLabel, useGlobalUnit } from "../lib/units";
import { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { Add as AddIcon } from "../ui/icons";
import { Close as CloseIcon } from "../ui/icons";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import { ChevronRightRounded as ChevronRightRoundedIcon } from "../ui/icons";
import MoodPad from "../components/MoodPad";
import AccountCard from "../components/AccountCard";
import { DeleteDialog, ExportDialog, ImportDialog, useSyncText } from "../components/BackupPanel";
import { Settings as SettingsIcon } from "../ui/icons";
import StackPanel, { type StackPage } from "../ui/StackPanel";
import type { BackupData } from "../lib/backup";
import type { Exercise } from "../lib/types";
import { newRecoveryEntry } from "../lib/store";
import { today } from "../lib/format";
import { moodReading, recoveryAverage } from "../lib/types";
import { ActivityIcon } from "../lib/icons";
import { FOCUS_GOALS } from "../lib/workoutBuilder";
import type { FocusGoal } from "../lib/workoutBuilder";
import {
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
  onOpenAdmin: () => void;
  onOpenSocialProfile: () => void;
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
  onOpenAdmin,
  onOpenSocialProfile,
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
  // Настройки — отдельная шторка, открывается круглой кнопкой в шапке.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const sync = useSyncText();

  function toggleRest(on: boolean) {
    setRestOn(on);
    saveRestEnabled(on);
  }


  const todayCheckin = recovery.find((e) => e.date === today()) ?? null;

  function saveCheckin(entry: RecoveryEntry) {
    const exists = recovery.some((e) => e.id === entry.id);
    onChangeRecovery(
      exists ? recovery.map((e) => (e.id === entry.id ? entry : e)) : [...recovery, entry],
    );
    setCheckin(null);
  }

  const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  const themeLabel = { auto: t("Авто", "Auto"), light: t("Светлая", "Light"), dark: t("Тёмная", "Dark") };
  const scaleLabel: Record<TextScale, string> = { 100: t("Обычный", "Default"), 115: t("Крупный", "Large"), 130: t("Очень крупный", "Extra large") };
  const restChoices = [45, 60, 90, 120, 150, 180, 240];
  if (!restChoices.includes(restSec)) restChoices.push(restSec);
  restChoices.sort((x, y) => x - y);
  const settingsPages: Record<string, StackPage> = {
    settings: {
      title: t("Настройки", "Settings"),
      sections: [
        {
          rows: [
            { id: "rest", label: t("Таймер отдыха", "Rest timer"), detail: restOn ? clock(restSec) : t("выкл.", "off"), to: "rest" },
            { id: "theme", label: t("Тема", "Theme"), detail: themeLabel[themePref], to: "theme" },
            { id: "units", label: t("Единицы веса", "Weight units"), detail: unitLabel(weightUnit), to: "units" },
            { id: "text", label: t("Размер текста", "Text size"), detail: scaleLabel[textScale], to: "text" },
            { id: "lang", label: t("Язык", "Language"), detail: lang === "ru" ? "Русский" : "English", to: "lang" },
          ],
        },
        {
          title: t("История", "History"),
          rows: [
            { id: "export", label: t("Выгрузить историю", "Export history"), onSelect: () => setExportOpen(true) },
            { id: "import", label: t("Вставить историю", "Import history"), onSelect: () => setImportOpen(true) },
          ],
          footer: sync.text,
        },
        {
          rows: [{ id: "delete", label: t("Удалить аккаунт", "Delete account"), tone: "danger", onSelect: () => setDeleteOpen(true) }],
          footer: t("Все данные с сервера и с этого устройства.", "All data on the server and this device."),
        },
      ],
    },
    lang: {
      title: t("Язык", "Language"),
      sections: [
        {
          rows: (["ru", "en"] as const).map((l) => ({
            id: `lang-${l}`,
            label: l === "ru" ? "Русский" : "English",
            selected: lang === l,
            onSelect: () => onChangeLang(l),
          })),
        },
      ],
    },
    rest: {
      title: t("Таймер отдыха", "Rest timer"),
      sections: [
        {
          rows: [{ id: "rest-on", label: t("Показывать таймер", "Show timer"), checked: restOn, onSelect: () => toggleRest(!restOn) }],
          footer: t("Появляется, когда отмечаешь подход выполненным.", "Shows up when you tick a set as done."),
        },
        ...(restOn
          ? [
              {
                title: t("Отдых по умолчанию", "Default rest"),
                rows: restChoices.map((sec) => ({
                  id: `rest-${sec}`,
                  label: clock(sec),
                  selected: sec === restSec,
                  onSelect: () => {
                    setRestSec(sec);
                    saveRestSec(sec);
                  },
                })),
                footer: t("Во время тренировки время можно поправить кнопками −15 и +15 с.", "During a workout adjust it with −15 and +15 s."),
              },
            ]
          : []),
      ],
    },
    theme: {
      title: t("Тема", "Theme"),
      sections: [
        {
          rows: (["auto", "light", "dark"] as const).map((v) => ({
            id: `theme-${v}`,
            label: themeLabel[v],
            selected: themePref === v,
            onSelect: () => {
              if (v === themePref) return;
              setThemePref(v);
              saveThemePref(v);
              if (resolveMode(v) !== MODE) window.location.reload();
            },
          })),
          footer: t("«Авто» — как в Telegram. Смена темы перезапускает приложение.", "Auto follows Telegram. Changing the theme restarts the app."),
        },
      ],
    },
    units: {
      title: t("Единицы веса", "Weight units"),
      sections: [
        {
          rows: (["kg", "lb"] as const).map((v) => ({
            id: `unit-${v}`,
            label: v === "kg" ? t("Килограммы", "Kilograms") : t("Фунты", "Pounds"),
            detail: unitLabel(v),
            selected: weightUnit === v,
            onSelect: () => setGlobalUnit(v),
          })),
          footer: t("У отдельного упражнения можно выбрать свою единицу прямо в поле веса.", "An exercise can have its own unit — pick it in the weight field."),
        },
      ],
    },
    text: {
      title: t("Размер текста", "Text size"),
      sections: [
        {
          rows: ([100, 115, 130] as const).map((v) => ({
            id: `text-${v}`,
            label: scaleLabel[v],
            selected: textScale === v,
            onSelect: () => {
              setTextScale(v);
              applyTextScale(v);
            },
          })),
          footer: t("Telegram не берёт системный размер шрифта, поэтому он настраивается здесь.", "Telegram ignores the system font size, so set it here."),
        },
      ],
    },
  };

  return (
    <Box sx={{ pb: 10 }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Typography variant="h1">{t("Профиль", "Profile")}</Typography>
        <IconButton
          onClick={() => setSettingsOpen(true)}
          aria-label={t("Настройки", "Settings")}
          sx={{ width: 40, height: 40, borderRadius: "50%", bgcolor: "action.hover", color: "text.primary" }}
        >
          <SettingsIcon sx={{ fontSize: 22 }} />
        </IconButton>
      </Stack>

      {/* Аккаунт Telegram: вход в браузере, выход, админка */}
      <AccountCard onOpenAdmin={onOpenAdmin} onOpenSocialProfile={onOpenSocialProfile} />

      {/* Цель — влияет на подбор «Тренером» */}
      <Typography variant="h2" sx={{ mb: 1.5 }}>
        {t("Моя цель", "My goal")}
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1, mb: 3 }}>
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
                p: 1.5,
                borderRadius: radius.tile,
                cursor: "pointer",
                bgcolor: active ? "action.selected" : "action.hover",
                boxShadow: active ? `inset 0 0 0 1.5px ${alpha(g.color, 0.6)}` : "none",
                transition: `${tr("background-color", motion.fast, "ease")}, ${tr("box-shadow", motion.fast, "ease")}`,
              }}
            >
              <IconBadge color={g.color}>
                <ActivityIcon icon={g.icon} fontSize="small" />
              </IconBadge>
              <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.25, minWidth: 0, hyphens: "auto", overflowWrap: "anywhere" }}>
                {lang === "en" ? GOAL_EN[g.goal] : g.label}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {/* Программа */}
      <Card
        role="button"
        tabIndex={0}
        onClick={onOpenPrograms}
        sx={{
          mb: 3,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          borderColor: "divider" }}
      >
        <IconBadge color={PROGRAM_AMBER}>
          <FitnessCenterIcon fontSize="small" />
        </IconBadge>
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
      </Card>

      {/* Самочувствие */}
      <Typography variant="h2" sx={{ mt: 3, mb: 1.5 }}>
        {t("Самочувствие", "How you feel")}
      </Typography>
      <Card
        role="button"
        tabIndex={0}
        onClick={() => setCheckin(todayCheckin ?? newRecoveryEntry(today()))}
        sx={{
          cursor: "pointer",
          borderColor: "divider" }}
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
      </Card>

      {/* Настройки — шторка с вложенными страницами (Stack Panel) */}
      <Dialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        fullWidth
        slotProps={{ paper: { sx: { overflow: "hidden" } } }}
      >
        <StackPanel root="settings" pages={settingsPages} bare onClose={() => setSettingsOpen(false)} closeLabel={t("Готово", "Done")} />
      </Dialog>
      {exportOpen && <ExportDialog data={backupData} allExercises={allExercises} onClose={() => setExportOpen(false)} />}
      {importOpen && <ImportDialog current={backupData} onRestore={onRestore} onClose={() => setImportOpen(false)} />}
      {deleteOpen && <DeleteDialog onClose={() => setDeleteOpen(false)} />}

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
          slotProps={{ inputLabel: { shrink: true } }}
          label={t("Дата", "Date")}
          fullWidth
          value={draft.date}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          sx={{ mb: 2, mt: 1 }}
        />
        <Typography variant="body2" color="text.secondary">
          {t("Где ты сейчас по энергии и настроению?", "Where are you on energy and mood right now?")}
        </Typography>
        <MoodPad
          value={draft.mood ?? null}
          onChange={(m) => setDraft({ ...draft, mood: m })}
          yLabels={yLabels}
          xLabels={xLabels}
          color={ink("#4ade80")}
          yTitle={t("Энергия", "Energy")}
          xTitle={t("Настроение", "Mood")}
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
