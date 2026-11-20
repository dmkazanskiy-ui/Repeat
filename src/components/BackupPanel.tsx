import { Card, IconBadge, radius } from "../ui";
import { useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { IosShareRounded as IosShareRoundedIcon } from "../ui/icons";
import { ContentPasteRounded as ContentPasteRoundedIcon } from "../ui/icons";
import { ChevronRightRounded as ChevronRightRoundedIcon } from "../ui/icons";
import { DeleteForeverRounded as DeleteForeverRoundedIcon } from "../ui/icons";
import {
  PERIOD_LABELS,
  buildExport,
  parseExport,
  periodStart,
  planMerge,
} from "../lib/backup";
import type { BackupData, BackupPeriod, MergePlan } from "../lib/backup";
import { today } from "../lib/format";
import { L, useT } from "../lib/i18n";
import { haptic } from "../lib/telegram";
import { deleteAccount, syncAvailable, useSyncState } from "../lib/sync";
import type { Exercise } from "../lib/types";
import { ink } from "../lib/themeMode";

const PERIODS: BackupPeriod[] = ["day", "week", "month", "all"];

function sizeLabel(text: string): string {
  const kb = new TextEncoder().encode(text).length / 1024;
  return kb < 1024
    ? `${Math.max(1, Math.round(kb))} ${L("КБ", "KB")}`
    : `${(kb / 1024).toFixed(1)} ${L("МБ", "MB")}`;
}

/** Строка-кнопка в стиле профиля: плашка-иконка с градиентом и шеврон. */
function Row({
  color,
  icon,
  title,
  sub,
  onClick,
}: {
  color: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        p: 0,
        py: 0.5,
        border: "none",
        bgcolor: "transparent",
        color: "text.primary",
        textAlign: "left",
        fontFamily: "inherit",
        cursor: "pointer",
      }}
    >
      <IconBadge color={color}>
        {icon}
      </IconBadge>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {sub}
        </Typography>
      </Box>
      <ChevronRightRoundedIcon sx={{ color: "text.secondary" }} />
    </Box>
  );
}

/**
 * «Выгрузить историю» / «Вставить историю». Текст выгрузки: читаемая сводка
 * (для Claude) + точный JSON-блок (для восстановления). Переносится через
 * буфер обмена — работает и во встроенном браузере Telegram.
 */
export default function BackupPanel({
  data,
  allExercises,
  onRestore,
}: {
  data: BackupData;
  allExercises: Exercise[];
  onRestore: (next: BackupData) => void;
}) {
  const t = useT();
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <Typography variant="h2" sx={{ mt: 3, mb: 1.5 }}>
        {t("История", "History")}
      </Typography>
      <SyncLine />
      <Card>
        <Stack spacing={1}>
          <Row
            color={ink("#4ade80")}
            icon={<IosShareRoundedIcon fontSize="small" />}
            title={t("Выгрузить историю", "Export history")}
            sub={t("Текстом: для переноса и для разбора в Claude", "As text: to move it or have Claude review it")}
            onClick={() => setExportOpen(true)}
          />
          <Row
            color={ink("#38bdf8")}
            icon={<ContentPasteRoundedIcon fontSize="small" />}
            title={t("Вставить историю", "Import history")}
            sub={t("Восстановить из выгрузки — без дублей", "Restore from an export — no duplicates")}
            onClick={() => setImportOpen(true)}
          />
        </Stack>
      </Card>

      <Card sx={{ mt: 1.5 }}>
        <Row
          color={ink("#f87171")}
          icon={<DeleteForeverRoundedIcon fontSize="small" />}
          title={t("Удалить аккаунт", "Delete account")}
          sub={t("Все данные с сервера и с этого устройства", "All data on the server and this device")}
          onClick={() => setDeleteOpen(true)}
        />
      </Card>

      {deleteOpen && <DeleteDialog onClose={() => setDeleteOpen(false)} />}
      {exportOpen && (
        <ExportDialog data={data} allExercises={allExercises} onClose={() => setExportOpen(false)} />
      )}
      {importOpen && (
        <ImportDialog current={data} onRestore={onRestore} onClose={() => setImportOpen(false)} />
      )}
    </>
  );
}

/** Строка статуса синхронизации между устройствами. */
function SyncLine() {
  const t = useT();
  const s = useSyncState();
  const time = (ms: number) =>
    new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  let text: string;
  let color = "text.secondary";
  if (!syncAvailable()) {
    text = t("Синхронизация работает только внутри Telegram", "Sync works only inside Telegram");
  } else if (s.kind === "ok") {
    text = t(`Синхронизировано с сервером в ${time(s.last)}`, `Synced with the server at ${time(s.last)}`);
  } else if (s.kind === "error") {
    color = "warning.main";
    text =
      s.message === "auth"
        ? t("Сервер не принял вход — переоткрой приложение", "Server rejected sign-in — reopen the app")
        : s.message === "quota"
          ? t("Превышен лимит 10 МБ на сервере — новые данные остаются на устройстве", "Over the 10 MB server limit — new data stays on this device")
          : s.message === "rate"
            ? t("Слишком часто — синхронизируем чуть позже", "Too many requests — will sync a bit later")
            : t("Нет связи с сервером — данные сохранены на устройстве", "Can’t reach the server — data is saved on this device");
  } else {
    text = t("Синхронизация…", "Syncing…");
  }
  return (
    <Typography variant="caption" sx={{ display: "block", mb: 1, color }}>
      {text}
    </Typography>
  );
}

function DeleteDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(false);
    try {
      await deleteAccount();
      haptic("success");
      window.location.reload();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose}>
      <DialogTitle>{t("Удалить аккаунт?", "Delete account?")}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          {t(
            "Удалим все тренировки, замеры, программы и настройки — на сервере (вместе с резервными копиями) и на этом устройстве. Другие устройства очистятся при следующем открытии. Восстановить нельзя. Если хочешь сохранить историю, сначала сделай «Выгрузить историю».",
            "We’ll delete all workouts, measurements, programs and settings — on the server (including backups) and on this device. Other devices are cleared the next time they open. This can’t be undone. To keep your history, use “Export history” first.",
          )}
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {t(
              "Не получилось связаться с сервером — ничего не удалено. Попробуй ещё раз.",
              "Couldn’t reach the server — nothing was deleted. Try again.",
            )}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t("Отмена", "Cancel")}
        </Button>
        <Button color="error" variant="contained" onClick={confirm} disabled={busy}>
          {busy ? t("Удаляем…", "Deleting…") : t("Удалить навсегда", "Delete forever")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ExportDialog({
  data,
  allExercises,
  onClose,
}: {
  data: BackupData;
  allExercises: Exercise[];
  onClose: () => void;
}) {
  const t = useT();
  const [period, setPeriod] = useState<BackupPeriod>("all");
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const from = periodStart(period);
  const count = data.sessions.filter((s) => (from == null || s.date >= from) && s.date <= today()).length;
  const text = useMemo(() => buildExport(data, allExercises, period), [data, allExercises, period]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
      haptic("success");
    } catch {
      // Буфер недоступен — показываем текст, чтобы скопировать вручную.
      setStatus("manual");
      setTimeout(() => {
        areaRef.current?.focus();
        areaRef.current?.select();
      }, 50);
    }
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogTitle>{t("Выгрузить историю", "Export history")}</DialogTitle>
      <DialogContent>
        <ToggleButtonGroup
          value={period}
          exclusive
          fullWidth
          size="small"
          onChange={(_, v: BackupPeriod | null) => {
            if (v) {
              setPeriod(v);
              setStatus("idle");
            }
          }}
          sx={{ mb: 1.5 }}
        >
          {PERIODS.map((p) => (
            <ToggleButton key={p} value={p} sx={{ minHeight: 36, textTransform: "none" }}>
              {PERIOD_LABELS[p]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Typography variant="body2" color="text.secondary">
          {t("Тренировок", "Workouts")}: <b>{count}</b> · {t("размер", "size")} {sizeLabel(text)}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          {t(
            "Программы, свои упражнения и цель входят всегда. Для переезда выбирай «Всё время» и сохрани текст, например в «Избранное» Telegram — длинный текст он предложит отправить файлом.",
            "Programs, custom exercises and goal are always included. To move, choose “All time” and save the text, e.g. to Telegram Saved Messages — it will offer to send long text as a file.",
          )}
        </Typography>
        {status === "copied" && (
          <Alert severity="success" sx={{ mt: 1.5 }}>
            {t("Скопировано в буфер обмена", "Copied to clipboard")}
          </Alert>
        )}
        {status === "manual" && (
          <>
            <Alert severity="info" sx={{ mt: 1.5 }}>
              {t(
                "Буфер недоступен — выдели текст ниже и скопируй вручную.",
                "Clipboard unavailable — select the text below and copy it.",
              )}
            </Alert>
            <Box
              component="textarea"
              ref={areaRef}
              readOnly
              value={text}
              sx={{
                mt: 1,
                width: "100%",
                height: 160,
                p: 1.5,
                borderRadius: radius.tile,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "background.default",
                color: "text.primary",
                font: "inherit",
                fontSize: 12,
                resize: "vertical",
              }}
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("Закрыть", "Close")}</Button>
        <Button variant="contained" onClick={copy}>
          {t("Скопировать", "Copy")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ImportDialog({
  current,
  onRestore,
  onClose,
}: {
  current: BackupData;
  onRestore: (next: BackupData) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const [done, setDone] = useState(false);

  function check(value: string) {
    setText(value);
    setPlan(null);
    setError(null);
    if (!value.trim()) return;
    const res = parseExport(value);
    if (!res.ok) setError(res.error);
    else setPlan(planMerge(current, res.file.data));
  }

  async function pasteFromClipboard() {
    try {
      check(await navigator.clipboard.readText());
    } catch {
      setError(
        t(
          "Нет доступа к буферу — вставь текст в поле вручную (долгое нажатие → «Вставить»).",
          "No clipboard access — paste into the field manually (long press → Paste).",
        ),
      );
    }
  }

  function restore() {
    if (!plan) return;
    onRestore(plan.next);
    haptic("success");
    setDone(true);
  }

  const nothingNew =
    plan != null && Object.values(plan.added).every((n) => n === 0);

  return (
    <Dialog open onClose={onClose}>
      <DialogTitle>{t("Вставить историю", "Import history")}</DialogTitle>
      <DialogContent>
        {done && plan ? (
          <Alert severity="success">
            {t("Готово. Добавлено тренировок", "Done. Workouts added")}: {plan.added.sessions}
          </Alert>
        ) : (
          <>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<ContentPasteRoundedIcon />}
              onClick={pasteFromClipboard}
              sx={{ mb: 1.5 }}
            >
              {t("Вставить из буфера", "Paste from clipboard")}
            </Button>
            <Box
              component="textarea"
              value={text}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => check(e.target.value)}
              placeholder={t("…или вставь текст выгрузки сюда", "…or paste the export text here")}
              aria-label={t("Текст выгрузки", "Export text")}
              sx={{
                width: "100%",
                height: 120,
                p: 1.5,
                borderRadius: radius.tile,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "background.default",
                color: "text.primary",
                font: "inherit",
                fontSize: 13,
                resize: "vertical",
              }}
            />
            {error && (
              <Alert severity="error" sx={{ mt: 1.5 }}>
                {error}
              </Alert>
            )}
            {plan && (
              <Alert severity={nothingNew ? "info" : "success"} sx={{ mt: 1.5 }}>
                {nothingNew ? (
                  t("Всё из этой выгрузки уже есть — добавлять нечего.", "Everything from this export is already here.")
                ) : (
                  <>
                    {t("Будет добавлено", "Will add")}: {t("тренировок", "workouts")} {plan.added.sessions}
                    {plan.added.programs ? `, ${t("программ", "programs")} ${plan.added.programs}` : ""}
                    {plan.added.bodyEntries ? `, ${t("записей веса", "weight entries")} ${plan.added.bodyEntries}` : ""}
                    {plan.added.recovery ? `, ${t("чек-инов", "check-ins")} ${plan.added.recovery}` : ""}
                    {plan.added.customExercises ? `, ${t("своих упражнений", "custom exercises")} ${plan.added.customExercises}` : ""}
                    {plan.skipped ? `. ${t("Уже есть", "Already here")}: ${plan.skipped}` : ""}
                  </>
                )}
              </Alert>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{done ? t("Закрыть", "Close") : t("Отмена", "Cancel")}</Button>
        {!done && (
          <Button variant="contained" disabled={!plan || nothingNew} onClick={restore}>
            {t("Восстановить", "Restore")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
