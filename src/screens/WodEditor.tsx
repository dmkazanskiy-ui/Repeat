import { useMemo } from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, createTheme, ThemeProvider, useTheme } from "@mui/material/styles";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import EmojiEventsOutlinedIcon from "@mui/icons-material/EmojiEventsOutlined";
import NumberField from "../components/NumberField";
import MoodPad from "../components/MoodPad";
import { ActivityIcon } from "../lib/icons";
import { TYPE_COLOR } from "../lib/activityColors";
import { formatDate, formatDateFull } from "../lib/format";
import { useT } from "../lib/i18n";
import { MOOD_CONTEXTS, WOD_SCORE_LABELS, moodReading } from "../lib/types";
import type { Session, WodData, WodScore } from "../lib/types";
import { findWodPreset } from "../lib/wod/catalog";
import { formatWodResult, wodAttempts, wodBest, wodKey, wodName, wodScheme } from "../lib/analytics";

interface Props {
  session: Session;
  /** Все сессии — нужны для истории попыток этого же задания. */
  sessions: Session[];
  onChange: (session: Session) => void;
  onDelete: () => void;
  onBack: () => void;
}

/** Секунды ↔ поля «мин» и «сек» — вводить mm:ss одним полем неудобно. */
function splitTime(sec: number | null | undefined): { min: number | null; s: number | null } {
  if (sec == null) return { min: null, s: null };
  return { min: Math.floor(sec / 60), s: sec % 60 };
}

/**
 * Экран задания (кроссфит-WOD, HYROX-гонка или станция). Упражнений и тоннажа
 * здесь нет — есть схема и один сравнимый результат, поэтому экран свой, лёгкий,
 * как у восстановления. Внизу — история попыток этого же задания и лучший
 * результат: ради этого сравнения всё и делается.
 */
export default function WodEditor({
  session,
  sessions,
  onChange,
  onDelete,
  onBack,
}: Props) {
  const t = useT();
  const theme = useTheme();
  const color = TYPE_COLOR.wod;
  const editorTheme = useMemo(
    () =>
      createTheme(theme, {
        palette: { primary: theme.palette.augmentColor({ color: { main: color } }) },
      }),
    [theme, color],
  );

  const data: WodData = session.wod ?? { presetId: null, scheme: null, score: "for_time" };
  const preset = findWodPreset(data.presetId);
  const name = wodName(session);
  const time = splitTime(data.timeSec);

  // История этого же задания: прошлые попытки и лучшая из них.
  const key = wodKey(session);
  const history = useMemo(() => {
    if (!key) return [];
    return wodAttempts(sessions, key).filter((a) => a.sessionId !== session.id);
  }, [sessions, key, session.id]);
  const best = useMemo(() => wodBest(history), [history]);

  function patch(next: Partial<WodData>) {
    onChange({ ...session, wod: { ...data, ...next } });
  }

  function patchTime(next: { min?: number | null; s?: number | null }) {
    const min = next.min !== undefined ? next.min : time.min;
    const s = next.s !== undefined ? next.s : time.s;
    if (min == null && s == null) {
      patch({ timeSec: null });
      return;
    }
    patch({ timeSec: (min ?? 0) * 60 + (s ?? 0) });
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
            onChange={(event) => onChange({ ...session, time: event.target.value || null })}
            slotProps={{ input: { disableUnderline: true } }}
            sx={{ width: 68, "& input": { textAlign: "right", fontSize: 14 } }}
          />
        </Stack>

        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: 2 }}>
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
            <ActivityIcon icon={preset?.icon ?? "bolt"} fontSize="medium" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {preset ? (
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {name}
              </Typography>
            ) : (
              <TextField
                fullWidth
                variant="standard"
                placeholder={t("Название задания", "Workout name")}
                value={session.title ?? ""}
                onChange={(event) => onChange({ ...session, title: event.target.value || null })}
                slotProps={{ input: { disableUnderline: true } }}
                sx={{ "& input": { fontSize: 20, fontWeight: 700 } }}
              />
            )}
            <Typography variant="caption" color="text.secondary">
              {WOD_SCORE_LABELS[data.score]}
              {data.capSec ? ` · ${Math.round(data.capSec / 60)} ${t("мин", "min")}` : ""}
            </Typography>
          </Box>
        </Stack>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Stack spacing={2}>
            <TextField
              fullWidth
              multiline
              minRows={2}
              label={t("Схема", "Scheme")}
              placeholder={t("21-15-9 трастеры / подтягивания", "21-15-9 thrusters / pull-ups")}
              value={wodScheme(session)}
              onChange={(event) => patch({ scheme: event.target.value || null })}
            />

            {/* Тип результата: своё задание можно переключить, каталожное — нет. */}
            {!preset && (
              <Stack direction="row" spacing={1}>
                {(["for_time", "amrap", "emom"] as WodScore[]).map((score) => (
                  <Chip
                    key={score}
                    label={WOD_SCORE_LABELS[score]}
                    onClick={() => patch({ score })}
                    variant={data.score === score ? "filled" : "outlined"}
                    color={data.score === score ? "primary" : "default"}
                    size="small"
                  />
                ))}
              </Stack>
            )}

            <Divider />

            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {t("Результат", "Result")}
            </Typography>

            {data.score === "for_time" ? (
              <>
                <Stack direction="row" spacing={1}>
                  <NumberField
                    fullWidth
                    integer
                    label={t("Мин", "Min")}
                    value={time.min}
                    onChange={(value) => patchTime({ min: value })}
                  />
                  <NumberField
                    fullWidth
                    integer
                    label={t("Сек", "Sec")}
                    value={time.s}
                    onChange={(value) => patchTime({ s: value })}
                  />
                </Stack>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                    {t("Не уложился в лимит", "Didn't beat the cap")}
                  </Typography>
                  <Switch
                    checked={data.capped ?? false}
                    onChange={(event) => patch({ capped: event.target.checked })}
                  />
                </Stack>
              </>
            ) : (
              <Stack direction="row" spacing={1}>
                <NumberField
                  fullWidth
                  integer
                  label={t("Раунды", "Rounds")}
                  value={data.rounds ?? null}
                  onChange={(value) => patch({ rounds: value })}
                />
                <NumberField
                  fullWidth
                  integer
                  label={t("Повторы сверху", "Extra reps")}
                  value={data.reps ?? null}
                  onChange={(value) => patch({ reps: value })}
                />
              </Stack>
            )}

            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2">{t("Как предписано (Rx)", "As prescribed (Rx)")}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {t("Выключи, если масштабировал веса или движения", "Turn off if you scaled weights or movements")}
                </Typography>
              </Box>
              <Switch
                checked={data.rx ?? false}
                onChange={(event) => patch({ rx: event.target.checked })}
              />
            </Stack>

            <Box>
              <Typography variant="body2" color="text.secondary">
                {t("Как ты после?", "How do you feel?")}{" "}
                {session.mood ? (
                  <Typography component="span" variant="caption" sx={{ color }}>
                    {moodReading("strength", session.mood)}
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
                yLabels={MOOD_CONTEXTS.strength.y}
                xLabels={MOOD_CONTEXTS.strength.x}
                color={color}
              />
            </Box>

            <TextField
              fullWidth
              multiline
              minRows={2}
              label={t("Заметка", "Note")}
              placeholder={t("Что получилось, где встал…", "What worked, where you stalled…")}
              value={session.notes ?? ""}
              onChange={(event) => onChange({ ...session, notes: event.target.value || null })}
            />
          </Stack>
        </Paper>

        {/* Прошлые попытки этого же задания — то, ради чего каталог и нужен. */}
        {history.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
              <Typography variant="h2" sx={{ flex: 1 }}>
                {t("Прошлые попытки", "Past attempts")}
              </Typography>
              {best && (
                <Chip
                  size="small"
                  icon={<EmojiEventsOutlinedIcon sx={{ fontSize: 16 }} />}
                  label={`${t("лучший", "best")} ${formatWodResult(best)}`}
                  sx={{ bgcolor: alpha(color, 0.16), color, fontWeight: 700 }}
                />
              )}
            </Stack>
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
              <Stack spacing={0.75}>
                {[...history].reverse().slice(0, 8).map((attempt) => (
                  <Stack
                    key={attempt.sessionId}
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "baseline" }}
                  >
                    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 76 }}>
                      {formatDate(attempt.date)}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, flex: 1 }}>
                      {formatWodResult(attempt)}
                    </Typography>
                    {!attempt.rx && (
                      <Typography variant="caption" color="text.secondary">
                        {t("масштаб", "scaled")}
                      </Typography>
                    )}
                  </Stack>
                ))}
              </Stack>
            </Paper>
          </Box>
        )}

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
