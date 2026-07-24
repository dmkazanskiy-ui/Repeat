import { Box, Button, Chip, IconButton, Paper, Stack, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EditIcon from "@mui/icons-material/Edit";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { ActivityIcon } from "../lib/icons";
import { sessionTitle } from "./CalendarScreen";
import {
  formatDateFull,
  formatDistance,
  formatDuration,
  formatPace,
  formatVolume,
  formatWeight,
} from "../lib/format";
import {
  activityIcon,
  exerciseVolume,
  groupExercises,
  sessionDurationSec,
  sessionSetCount,
  sessionVolume,
} from "../lib/types";
import type { Exercise, Session, WorkoutSet } from "../lib/types";

interface Props {
  session: Session;
  exercises: Exercise[];
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopyToClipboard: () => void;
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
}: Props) {
  const duration = sessionDurationSec(session);

  return (
    <Box sx={{ pb: 6 }}>
      <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: "center" }}>
        <IconButton onClick={onBack} edge="start" aria-label="Назад">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {formatDateFull(session.date)}
          {session.time ? ` · ${session.time}` : ""}
        </Typography>
        <Chip label="Завершена" size="small" color="primary" variant="outlined" />
      </Stack>

      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 2 }}>
        <Box sx={{ color: "primary.main" }}>
          <ActivityIcon icon={activityIcon(session)} fontSize="large" />
        </Box>
        <Box>
          <Typography variant="h1">{sessionTitle(session)}</Typography>
          {(duration != null || session.avgHr != null) && (
            <Typography variant="body2" color="text.secondary">
              {[
                duration != null ? formatDuration(duration) : null,
                session.avgHr != null ? `${session.avgHr} уд/мин` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Typography>
          )}
        </Box>
      </Stack>

      {session.kind === "strength" && session.exercises.length > 0 && (
        <>
          <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: "baseline" }}>
            <Typography variant="subtitle2">
              Тоннаж {formatVolume(sessionVolume(session))}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              · {sessionSetCount(session)} подх.
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
                    label="Супер-сет"
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
                          {exercise?.name ?? "Упражнение"}
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
        </>
      )}

      {session.kind === "cardio" && session.cardio && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" spacing={3}>
            <ViewStat
              label="Дистанция"
              value={formatDistance(session.cardio.distanceM, session.cardioKind)}
            />
            <ViewStat label="Время" value={formatDuration(session.cardio.durationSec)} />
            <ViewStat
              label="Темп"
              value={formatPace(
                session.cardio.distanceM,
                session.cardio.durationSec,
                session.cardioKind,
              )}
            />
          </Stack>
          {session.cardio.avgHr != null && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              Средний пульс {session.cardio.avgHr}
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
        Редактировать
      </Button>
      <Button
        fullWidth
        variant="outlined"
        startIcon={<ContentCopyIcon />}
        onClick={onCopyToClipboard}
        sx={{ mt: 1 }}
      >
        Скопировать тренировку
      </Button>
      <Button fullWidth color="error" onClick={onDelete} sx={{ mt: 1 }}>
        Удалить тренировку
      </Button>
    </Box>
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
