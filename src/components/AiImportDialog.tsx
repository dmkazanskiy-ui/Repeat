// «Вставить от ИИ»: ответ Claude/ChatGPT (или .json-файл) → предпросмотр →
// импорт. Тот же диалог показывает то, что ИИ прислал через API/MCP во
// «входящие»: ничего не записывается без подтверждения человека.
import { useMemo, useRef, useState } from "react";
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Radio, RadioGroup, Typography } from "@mui/material";
import { overlappingPlans } from "../lib/plan";
import { ContentPasteRounded } from "../ui/icons";
import { radius } from "../ui";
import { prepareImport, type ImportTarget, type PreparedImport } from "../lib/aiFormat";
import { formatDate } from "../lib/format";
import { haptic } from "../lib/telegram";
import { useT } from "../lib/i18n";
import type { InboxItem } from "../lib/types";

interface Props {
  inboxItem: InboxItem | null;
  ctx: ImportTarget;
  /** replacePlanIds — пересекающиеся по датам планы, которые человек решил заменить. */
  onApply: (prep: PreparedImport, archiveProgramIds: string[], replacePlanIds: string[]) => Promise<void> | void;
  onClose: () => void;
}

export default function AiImportDialog({ inboxItem, ctx, onApply, onClose }: Props) {
  const t = useT();
  const [text, setText] = useState("");
  const [archive, setArchive] = useState<string[]>([]);
  const [mode, setMode] = useState<"replace" | "add">("replace");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<PreparedImport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Контекст фиксируем на открытии: после импорта предпросмотр не должен «обнулиться».
  const ctxRef = useRef(ctx);

  const source = inboxItem?.source ?? (text ? t("вставка", "paste") : null);
  const result = useMemo(() => {
    const input = inboxItem ? inboxItem.payload : text;
    if (!inboxItem && !text.trim()) return null;
    return prepareImport(input, { ...ctxRef.current, source });
  }, [inboxItem, text, source]);
  const prep = result?.ok ? result.prep : null;
  const nothingNew =
    prep != null && !prep.program && !prep.plan && prep.planned.length === 0 && prep.sessions.length === 0 && prep.links.length === 0;
  // Новый план на те же даты, что и активный, — спросить: заменить или рядом.
  const overlaps = prep?.kind === "plan" && prep.plan && prep.range ? overlappingPlans(ctxRef.current.plans, prep.range.start, prep.range.end, prep.plan.id) : [];
  const replaced = mode === "replace" ? overlaps : [];
  const replacedPrograms = new Set(replaced.map((p) => p.programId).filter(Boolean) as string[]);
  const oldPrograms = prep?.program ? ctxRef.current.programs.filter((p) => !p.archivedAt && !replacedPrograms.has(p.id)) : [];

  async function paste() {
    try {
      setText(await navigator.clipboard.readText());
    } catch {
      /* без доступа к буферу — вставят руками */
    }
  }

  async function readFile(file: File) {
    setText(await file.text());
  }

  async function apply() {
    if (!prep) return;
    setBusy(true);
    try {
      await onApply(prep, archive.filter((id) => !replacedPrograms.has(id)), replaced.map((p) => p.id));
      haptic("success");
      setDone(prep);
    } finally {
      setBusy(false);
    }
  }

  const title = inboxItem
    ? `${inboxItem.source ?? "ИИ"} ${inboxItem.type === "plan" ? t("прислал план", "sent a plan") : t("прислал тренировки", "sent workouts")}`
    : t("Вставить от ИИ", "Paste from AI");

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {done ? (
          <Alert severity="success">
            {done.kind === "plan"
              ? t(
                  `План «${done.title}» добавлен. Карточки — на экране дня, копия данных до импорта сохранена на устройстве.`,
                  `Plan "${done.title}" added. Cards are on the day screen; a copy of your data was saved first.`,
                )
              : t(`Добавлено тренировок: ${done.sessions.length}.`, `Workouts added: ${done.sessions.length}.`)}
          </Alert>
        ) : (
          <>
            {inboxItem?.note && (
              <Typography variant="body2" sx={{ mb: 1.5 }}>
                {inboxItem.note}
              </Typography>
            )}
            {!inboxItem && (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  {t(
                    "Вставь ответ Claude или ChatGPT целиком — JSON найдётся сам. Ничего не удаляется, повторная вставка не задваивает.",
                    "Paste the whole Claude or ChatGPT answer — the JSON is found automatically. Nothing is deleted; pasting twice adds nothing.",
                  )}
                </Typography>
                <Box sx={{ display: "flex", gap: 1, mb: 1.5 }}>
                  <Button fullWidth variant="outlined" startIcon={<ContentPasteRounded />} onClick={paste}>
                    {t("Из буфера", "Paste")}
                  </Button>
                  <Button fullWidth variant="outlined" onClick={() => fileRef.current?.click()}>
                    {t("Файл .json", "JSON file")}
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".json,.txt,.md,application/json,text/plain"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void readFile(f);
                      e.target.value = "";
                    }}
                  />
                </Box>
                <Box
                  component="textarea"
                  value={text}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
                  placeholder={t("…или вставь текст сюда", "…or paste the text here")}
                  aria-label={t("Ответ ИИ", "AI answer")}
                  sx={{
                    width: "100%",
                    height: 110,
                    p: 1.5,
                    borderRadius: radius.tile,
                    border: 0,
                    bgcolor: "action.hover",
                    color: "text.primary",
                    font: "inherit",
                    fontSize: 13,
                    resize: "vertical",
                    outline: "none",
                  }}
                />
              </>
            )}

            {result && !result.ok && (
              <Alert severity="error" sx={{ mt: 1.5 }}>
                {result.error}
              </Alert>
            )}

            {prep && (
              <Box sx={{ mt: 1.5, p: 1.5, borderRadius: radius.tile, bgcolor: "action.hover", display: "grid", gap: 0.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {prep.title}
                  {prep.range ? ` · ${formatDate(prep.range.start)} – ${formatDate(prep.range.end)}` : ""}
                </Typography>
                {prep.kind === "plan" ? (
                  <>
                    {prep.counts.workouts > 0 && (
                      <Line>
                        {prep.program
                          ? t(`Новая программа «${prep.program.name}»: ${prep.counts.workouts} трен., ${prep.counts.exercises} упр.`, `New program "${prep.program.name}": ${prep.counts.workouts} workouts, ${prep.counts.exercises} exercises`)
                          : t("Программа уже создана прошлым импортом", "Program already created earlier")}
                      </Line>
                    )}
                    <Line>
                      {t("Карточек плана", "Plan cards")}: +{prep.counts.plannedNew}
                      {prep.counts.plannedUpdated ? `, ${t("обновится", "updated")} ${prep.counts.plannedUpdated}` : ""}
                      {prep.counts.plannedKept ? `, ${t("уже есть", "already here")} ${prep.counts.plannedKept}` : ""}
                    </Line>
                  </>
                ) : (
                  <>
                    <Line>
                      {t("Тренировок", "Workouts")}: +{prep.sessions.length}
                      {prep.counts.sessionsKnown ? `, ${t("уже есть", "already here")} ${prep.counts.sessionsKnown}` : ""}
                      {prep.sessions.some((s) => !s.endedAt) ? ` · ${t("будущие — в календаре", "future ones go to the calendar")}` : ""}
                    </Line>
                    {prep.links.length > 0 && <Line>{t(`Закроют карточек плана: ${prep.links.length}`, `Will close plan cards: ${prep.links.length}`)}</Line>}
                  </>
                )}
                {prep.newExercises.length > 0 && (
                  <Line>
                    {t("Новые свои упражнения", "New custom exercises")}: {prep.newExercises.map((e) => e.name).join(", ")}
                  </Line>
                )}
                {prep.warnings.slice(0, 5).map((w) => (
                  <Typography key={w} variant="caption" color="warning.main">
                    {w}
                  </Typography>
                ))}
              </Box>
            )}

            {overlaps.length > 0 && (
              <Box sx={{ mt: 1.5, p: 1.5, borderRadius: radius.tile, bgcolor: "action.hover" }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {t(
                    `Даты пересекаются с планом «${overlaps.map((p) => p.name).join("», «")}». Заменить существующий план или добавить рядом?`,
                    `Dates overlap with "${overlaps.map((p) => p.name).join('", "')}". Replace the existing plan or add alongside?`,
                  )}
                </Typography>
                <RadioGroup value={mode} onChange={(e) => setMode(e.target.value as "replace" | "add")}>
                  <FormControlLabel
                    value="replace"
                    control={<Radio size="small" />}
                    label={<Typography variant="body2">{t("Заменить — старый план и его программа уйдут в архив", "Replace — the old plan and its program are archived")}</Typography>}
                  />
                  <FormControlLabel
                    value="add"
                    control={<Radio size="small" />}
                    label={<Typography variant="body2">{t("Добавить рядом — карточки обоих планов будут в календаре", "Add alongside — both plans' cards stay in the calendar")}</Typography>}
                  />
                </RadioGroup>
              </Box>
            )}

            {oldPrograms.length > 0 && (
              <Box sx={{ mt: 1 }}>
                {oldPrograms.map((p) => (
                  <FormControlLabel
                    key={p.id}
                    control={
                      <Checkbox
                        size="small"
                        checked={archive.includes(p.id)}
                        onChange={(e) => setArchive((a) => (e.target.checked ? [...a, p.id] : a.filter((x) => x !== p.id)))}
                      />
                    }
                    label={<Typography variant="body2">{t(`Убрать «${p.name}» в архив`, `Archive "${p.name}"`)}</Typography>}
                  />
                ))}
              </Box>
            )}

            {nothingNew && (
              <Alert severity="info" sx={{ mt: 1.5 }}>
                {t("Всё это уже есть — добавлять нечего.", "All of this is already here.")}
              </Alert>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        {done ? (
          <Button onClick={onClose}>{t("Готово", "Done")}</Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy} color="inherit">
              {inboxItem ? t("Отклонить", "Decline") : t("Отмена", "Cancel")}
            </Button>
            <Button variant="contained" onClick={apply} disabled={!prep || nothingNew || busy}>
              {t("Импортировать", "Import")}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return <Typography variant="body2">{children}</Typography>;
}
