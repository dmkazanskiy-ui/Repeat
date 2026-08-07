import {
  Box,
  Button,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, createTheme, ThemeProvider, useTheme } from "@mui/material/styles";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import { useMemo } from "react";
import NumberField from "../components/NumberField";
import MoodPad from "../components/MoodPad";
import { ActivityIcon } from "../lib/icons";
import { TYPE_COLOR } from "../lib/activityColors";
import { formatDateFull } from "../lib/format";
import { L, useT } from "../lib/i18n";
import { MOOD_CONTEXTS, activityIcon, moodReading } from "../lib/types";
import type { RecoveryData, RecoveryType, Session } from "../lib/types";
import {
  RECOVERY_CATEGORIES,
  RECOVERY_CATEGORY_OF,
  RECOVERY_LABELS,
  proceduresOf,
} from "../lib/recovery/catalog";

interface Props {
  session: Session;
  onChange: (session: Session) => void;
  onDelete: () => void;
  onBack: () => void;
}

/**
 * Лёгкий редактор записи восстановления: у неё нет упражнений и таймера
 * тренировки, поэтому это отдельный экран — процедура, длительность и заметка.
 */
export default function RecoveryEditor({
  session,
  onChange,
  onDelete,
  onBack,
}: Props) {
  const t = useT();
  const data: RecoveryData = session.recovery ?? { type: "full_rest" };
  // Акцент экрана — цвет восстановления (голубой), как у карточек этого типа.
  const theme = useTheme();
  const color = TYPE_COLOR.recovery;
  const editorTheme = useMemo(
    () =>
      createTheme(theme, {
        palette: { primary: theme.palette.augmentColor({ color: { main: color } }) },
      }),
    [theme, color],
  );

  function patch(next: Partial<RecoveryData>) {
    onChange({ ...session, recovery: { ...data, ...next } });
  }

  return (
    <ThemeProvider theme={editorTheme}>
    <Box sx={{ pb: 6 }}>
      <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: "center" }}>
        <IconButton onClick={onBack} edge="start" aria-label={t("Назад", "Back")}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {formatDateFull(session.date)}
        </Typography>
        <TextField
          type="time"
          variant="standard"
          value={session.time ?? ""}
          onChange={(event) =>
            onChange({ ...session, time: event.target.value || null })
          }
          slotProps={{ input: { disableUnderline: true } }}
          sx={{ width: 68, "& input": { textAlign: "right", fontSize: 14 } }}
        />
      </Stack>

      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: 3 }}>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: 2,
            display: "grid",
            placeItems: "center",
            color,
            backgroundImage: `linear-gradient(135deg, ${alpha(color, 0.28)}, ${alpha(color, 0.08)})`,
            flexShrink: 0,
          }}
        >
          <ActivityIcon icon={activityIcon(session)} fontSize="medium" />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {RECOVERY_LABELS[data.type]}
        </Typography>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Stack spacing={2}>
          <TextField
            select
            fullWidth
            label={t("Процедура", "Procedure")}
            value={data.type}
            onChange={(event) => patch({ type: event.target.value as RecoveryType })}
          >
            {RECOVERY_CATEGORIES.map((cat) => [
              <MenuItem key={cat.category} disabled sx={{ opacity: 0.6 }}>
                {cat.label}
              </MenuItem>,
              ...proceduresOf(cat.category).map((proc) => (
                <MenuItem key={proc.type} value={proc.type} sx={{ pl: 3 }}>
                  {proc.label}
                </MenuItem>
              )),
            ])}
          </TextField>

          {/* У «Дня отдыха» длительности нет — это целый день без нагрузки. */}
          {data.type !== "full_rest" && (
            <NumberField
              fullWidth
              integer
              label={t("Длительность, мин", "Duration, min")}
              placeholder="—"
              value={data.durationMin ?? null}
              onChange={(value) => patch({ durationMin: value })}
            />
          )}

          <Box>
            <Typography variant="body2" color="text.secondary">
              {t("Как зашло?", "How was it?")}{" "}
              {session.mood ? (
                <Typography component="span" variant="caption" sx={{ color }}>
                  {moodReading("recovery", session.mood)}
                </Typography>
              ) : (
                <Typography component="span" variant="caption" color="text.secondary">
                  {t("— отметь точку", "— mark a point")}
                </Typography>
              )}
            </Typography>
            <MoodPad
              value={session.mood ?? null}
              onChange={(m) => onChange({ ...session, mood: m })}
              yLabels={MOOD_CONTEXTS.recovery.y}
              xLabels={MOOD_CONTEXTS.recovery.x}
              color={color}
            />
          </Box>

          <TextField
            fullWidth
            multiline
            minRows={2}
            label={t("Заметка", "Note")}
            placeholder={t("Как прошло, ощущения…", "How it went, sensations…")}
            value={data.note ?? ""}
            onChange={(event) => patch({ note: event.target.value || null })}
          />
        </Stack>
      </Paper>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: 1.5, px: 0.5 }}
      >
        {categoryHint(data.type)}
      </Typography>

      <Button fullWidth variant="contained" onClick={onBack} sx={{ mt: 3 }}>
        {t("Готово", "Done")}
      </Button>
      <Button
        fullWidth
        color="error"
        startIcon={<DeleteOutlineIcon />}
        onClick={onDelete}
        sx={{ mt: 1 }}
      >
        {t("Удалить запись", "Delete entry")}
      </Button>
    </Box>
    </ThemeProvider>
  );
}

/** Короткая честная подпись — без обещаний, что процедура «восстановила». */
function categoryHint(type: RecoveryType): string {
  const category = RECOVERY_CATEGORY_OF[type];
  if (category === "rest") return L("Отдых зачтётся как день без тренировочной нагрузки.", "Rest counts as a day without training load.");
  return L("Запись восстановления. В тренировочный объём и рекорды не идёт.", "Recovery entry. Not counted in training volume or records.");
}
