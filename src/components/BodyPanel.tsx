import { Card, Tile } from "../ui";
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
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Add as AddIcon } from "../ui/icons";
import { Close as CloseIcon } from "../ui/icons";
import NumberField from "./NumberField";
import StatCard from "./StatCard";
import { newBodyEntry } from "../lib/store";
import { addDays, formatDate, today } from "../lib/format";
import { BODY_METRICS } from "../lib/types";
import type { BodyEntry } from "../lib/types";
import { L, useLang, useT } from "../lib/i18n";

interface Props {
  bodyEntries: BodyEntry[];
  onChangeBody: (entries: BodyEntry[]) => void;
  /** Сразу открыть форму нового замера. */
  autoAdd?: boolean;
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

const WEIGHT_RANGES = [
  { key: "1m", get label() { return L("Месяц", "Month"); } },
  { key: "3m", get label() { return L("3 мес", "3 mo"); } },
  { key: "1y", get label() { return L("Год", "Year"); } },
  { key: "all", get label() { return L("Всё", "All"); } },
];
const WEIGHT_RANGES_DAYS: Record<string, number | null> = { "1m": 30, "3m": 90, "1y": 365, all: null };

function sortByDate<T extends { date: string }>(items: T[], desc = false): T[] {
  return [...items].sort((a, b) =>
    a.date === b.date ? 0 : (a.date < b.date) === desc ? 1 : -1,
  );
}

/**
 * Вкладка «Тело» в аналитике: вес и замеры. Раньше всё
 * это жило в профиле и разрасталось там, выдавливая настройки и цель.
 */
export default function BodyPanel({ bodyEntries, onChangeBody, autoAdd = false }: Props) {
  const lang = useLang();
  const t = useT();
  const [editing, setEditing] = useState<BodyEntry | null>(() => (autoAdd ? newBodyEntry(today()) : null));

  const asc = useMemo(() => sortByDate(bodyEntries), [bodyEntries]);

  const weightPoints = asc
    .filter((e) => e.weightKg != null)
    .map((e) => ({ label: formatDate(e.date), value: e.weightKg as number }));

  const [range, setRange] = useState("all");
  const days = WEIGHT_RANGES_DAYS[range];
  const cutoff = days ? addDays(today(), -days) : "0000-00-00";
  const rangeWeights = asc
    .filter((e) => e.weightKg != null && e.date >= cutoff)
    .map((e) => ({ label: formatDate(e.date), value: e.weightKg as number }));

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

  return (
    <Box>
      {/* Вес + замеры одним блоком */}
      <Card>
        {weightPoints.length > 0 ? (
          <StatCard
            label={t("Вес", "Weight")}
            value={rangeWeights.length ? rangeWeights[rangeWeights.length - 1].value : null}
            format={(v) => `${v.toFixed(1).replace(".", t(",", "."))} ${t("кг", "kg")}`}
            delta={rangeWeights.length >= 2 ? rangeWeights[rangeWeights.length - 1].value - rangeWeights[0].value : null}
            deltaSuffix={` ${t("кг", "kg")}`}
            upIsGood={false}
            values={rangeWeights.map((p) => p.value)}
            firstLabel={rangeWeights[0]?.label}
            lastLabel={rangeWeights[rangeWeights.length - 1]?.label}
            ranges={WEIGHT_RANGES}
            range={range}
            onRange={setRange}
          />
        ) : (
          <>
            <Typography variant="subtitle2" color="text.secondary">
              {t("Вес", "Weight")}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              {t("Добавь замер — появится график веса.", "Add a measurement to see your weight chart.")}
            </Typography>
          </>
        )}

        <Divider sx={{ my: 2 }} />

        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          {t("Замеры", "Measurements")}
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1 }}>
          {BODY_METRICS.filter((m) => m.key !== "weightKg").map((m) => {
            const value = latest(m.key);
            return (
              <Tile key={m.key} sx={{ textAlign: "center" }}>
                <Typography sx={{ fontSize: 18, fontWeight: 800 }}>
                  {value != null ? String(value).replace(".", t(",", ".")) : "—"}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                  {metricLabel(m.key, m.label)}
                </Typography>
              </Tile>
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
      </Card>

      {/* История замеров */}
      {bodyEntries.length > 0 && (
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          {sortByDate(bodyEntries, true).map((entry) => (
            <Card
              key={entry.id}
             
              role="button"
              tabIndex={0}
              onClick={() => setEditing(entry)}
              sx={{ cursor: "pointer", display: "flex", alignItems: "center" }}
            >
              <Typography variant="body2" sx={{ flex: 1 }}>
                {formatDate(entry.date)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {entry.weightKg != null
                  ? `${String(entry.weightKg).replace(".", ",")} ${t("кг", "kg")}`
                  : t("замер", "measurement")}
              </Typography>
            </Card>
          ))}
        </Stack>
      )}


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
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1.5 }}>
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

