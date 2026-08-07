import { Box, Button, Chip, Collapse, IconButton, Paper, Stack, Typography } from "@mui/material";
import { alpha, createTheme, ThemeProvider, useTheme } from "@mui/material/styles";
import { useMemo, useState } from "react";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import MoodPad from "../components/MoodPad";
import BodyMap from "../components/analytics/BodyMap";
import { sessionMuscleLoads } from "../lib/analytics";
import EditIcon from "@mui/icons-material/Edit";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { ActivityIcon } from "../lib/icons";
import {
  formatDateFull,
  formatDistance,
  formatDuration,
  formatPace,
  formatVolume,
  formatWeight,
} from "../lib/format";
import {
  MOOD_CONTEXTS,
  SESSION_LABELS,
  activityIcon,
  activityLabel,
  exerciseName,
  exerciseVolume,
  groupExercises,
  moodContextFor,
  moodReading,
  sessionDurationSec,
  sessionSetCount,
  sessionVolume,
} from "../lib/types";
import { typeColor } from "../lib/activityColors";
import { useT } from "../lib/i18n";
import type { Exercise, Session, WorkoutSet } from "../lib/types";

function sessionTitle(session: Session): string {
  return session.title || activityLabel(session) || SESSION_LABELS[session.kind];
}

interface Props {
  session: Session;
  exercises: Exercise[];
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopyToClipboard: () => void;
  onChange: (session: Session) => void;
}

/** Подход текстом: «80×5», дропы дописываются стрелкой «→70×6». */
function setText(set: WorkoutSet): string {
  const main = `${formatWeight(set.weight)}×${set.reps ?? "—"}`;
  const drops = (set.drops ?? [])
    .map((d) => `→${formatWeight(d.weight)}×${d.reps ?? "—"}`)
    .join("");
  return main + drops;
}

export default function SessionView({
  session,
  exercises,
  onBack,
  onEdit,
  onDelete,
  onCopyToClipboard,
  onChange,
}: Props) {
  const t = useT();
  const duration = sessionDurationSec(session);
  const moodCtx = moodContextFor(session.kind);
  const moodCfg = MOOD_CONTEXTS[moodCtx];
  const [moodOpen, setMoodOpen] = useState(false);
  // Карта мышц за эту сессию (только силовая) — где нагрузка была выше/ниже.
  const bodyLoads = useMemo(
    () => (session.kind === "strength" ? sessionMuscleLoads(session, exercises) : []),
    [session, exercises],
  );
  // Акцент экрана — цвет типа активности, как на карточке этой тренировки.
  const theme = useTheme();
  const color = typeColor(session.kind);
  const editorTheme = useMemo(
    () =>
      createTheme(theme, {
        palette: { primary: theme.palette.augmentColor({ color: { main: color } }) },
      }),
    [theme, color],
  );

  return (
    <ThemeProvider theme={editorTheme}>
    <Box sx={{ pb: 6 }}>
      <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: "center" }}>
        <IconButton onClick={onBack} edge="start" aria-label={t("Назад", "Back")}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {formatDateFull(session.date)}
          {session.time ? ` · ${session.time}` : ""}
        </Typography>
        <Chip label={t("Завершена", "Completed")} size="small" color="primary" variant="outlined" />
      </Stack>

      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 2 }}>
        <Box
          sx={{
            width: 52,
            height: 52,
            borderRadius: 2,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            color,
            backgroundImage: `linear-gradient(135deg, ${alpha(color, 0.28)}, ${alpha(color, 0.08)})`,
          }}
        >
          <ActivityIcon icon={activityIcon(session)} fontSize="medium" />
        </Box>
        <Box>
          <Typography variant="h1">{sessionTitle(session)}</Typography>
          {(duration != null || session.avgHr != null) && (
            <Typography variant="body2" color="text.secondary">
              {[
                duration != null ? formatDuration(duration) : null,
                session.avgHr != null ? `${session.avgHr} ${t("уд/мин", "bpm")}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Typography>
          )}
        </Box>
      </Stack>

      {/* Самочувствие после — точка на 2D-карте (оси под контекст). У
          восстановления «Как зашло» живёт в своём редакторе. */}
      <Paper variant="outlined" sx={{ borderRadius: 2, mb: 2, overflow: "hidden" }}>
        <Box
          component="button"
          onClick={() => setMoodOpen((v) => !v)}
          sx={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 1,
            p: 1.75,
            border: "none",
            bgcolor: "transparent",
            cursor: "pointer",
            fontFamily: "inherit",
            color: "text.primary",
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <Typography variant="subtitle2">{t("Как ты после?", "How do you feel?")}</Typography>
            <Typography variant="caption" color="text.secondary">
              {session.mood ? moodReading(moodCtx, session.mood) : t("отметь точку на карте", "mark a point on the map")}
            </Typography>
          </Box>
          {session.mood && (
            <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: "primary.main", flexShrink: 0 }} />
          )}
          <ExpandMoreRoundedIcon
            sx={{ color: "text.secondary", transition: "transform .2s", transform: moodOpen ? "rotate(180deg)" : "none" }}
          />
        </Box>
        <Collapse in={moodOpen}>
          <MoodPad
            value={session.mood ?? null}
            onChange={(m) => onChange({ ...session, mood: m })}
            yLabels={moodCfg.y}
            xLabels={moodCfg.x}
            color={color}
          />
        </Collapse>
      </Paper>

      {session.kind === "strength" && session.exercises.length > 0 && (
        <>
          <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: "baseline" }}>
            <Typography variant="subtitle2">
              {t("Тоннаж", "Tonnage")} {formatVolume(sessionVolume(session))}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              · {sessionSetCount(session)} {t("подх.", "sets")}
            </Typography>
          </Stack>

          {groupExercises(session.exercises).map((group) => {
            const isSuper = group.length > 1;
            return (
              <Box
                key={group[0].id}
                sx={
                  isSuper
                    ? { mb: 1.5, pl: 1, borderLeft: "3px solid", borderColor: "primary.main" }
                    : { mb: 1.5 }
                }
              >
                {isSuper && (
                  <Chip
                    label={t("Супер-сет", "Superset")}
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ mb: 0.5 }}
                  />
                )}
                {group.map((item) => {
                  const exercise = exercises.find((e) => e.id === item.exerciseId);
                  const volume = exerciseVolume(item);
                  return (
                    <Paper key={item.id} variant="outlined" sx={{ p: 1.5, mb: isSuper ? 1 : 1.5 }}>
                      <Stack direction="row" sx={{ mb: 0.5, alignItems: "baseline" }}>
                        <Typography variant="subtitle2" sx={{ flex: 1 }}>
                          {exerciseName(exercise)}
                        </Typography>
                        {volume > 0 && (
                          <Typography variant="caption" color="text.secondary">
                            {formatVolume(volume)}
                          </Typography>
                        )}
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {item.sets
                          .filter((s) => s.weight != null || s.reps != null)
                          .map(setText)
                          .join(" · ") || "—"}
                      </Typography>
                    </Paper>
                  );
                })}
              </Box>
            );
          })}

          {bodyLoads.length > 0 && (
            <Box sx={{ mt: 1, mb: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t("Нагрузка по мышцам", "Muscle load")}
              </Typography>
              <BodyMap loads={bodyLoads} />
            </Box>
          )}
        </>
      )}

      {session.kind === "cardio" && session.cardio && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" spacing={3}>
            <ViewStat
              label={t("Дистанция", "Distance")}
              value={formatDistance(session.cardio.distanceM, session.cardioKind)}
            />
            <ViewStat label={t("Время", "Time")} value={formatDuration(session.cardio.durationSec)} />
            <ViewStat
              label={t("Темп", "Pace")}
              value={formatPace(
                session.cardio.distanceM,
                session.cardio.durationSec,
                session.cardioKind,
              )}
            />
          </Stack>
          {(session.cardio.avgHr != null || session.cardio.inclineDeg != null) && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              {[
                session.cardio.avgHr != null ? `${t("Средний пульс", "Avg HR")} ${session.cardio.avgHr}` : null,
                session.cardio.inclineDeg != null ? `${t("Наклон", "Incline")} ${session.cardio.inclineDeg}°` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Typography>
          )}
        </Paper>
      )}

      {session.notes && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
            {session.notes}
          </Typography>
        </Paper>
      )}

      <Button
        fullWidth
        variant="contained"
        startIcon={<EditIcon />}
        onClick={onEdit}
        sx={{ mt: 1 }}
      >
        {t("Редактировать", "Edit")}
      </Button>
      <Button
        fullWidth
        variant="outlined"
        startIcon={<ContentCopyIcon />}
        onClick={onCopyToClipboard}
        sx={{ mt: 1 }}
      >
        {t("Скопировать тренировку", "Copy workout")}
      </Button>
      <Button fullWidth color="error" onClick={onDelete} sx={{ mt: 1 }}>
        {t("Удалить тренировку", "Delete workout")}
      </Button>
    </Box>
    </ThemeProvider>
  );
}

function ViewStat({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {label}
      </Typography>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        {value}
      </Typography>
    </Box>
  );
}
