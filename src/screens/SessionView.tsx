import { tr } from "../ui";
import { Card, IconBadge } from "../ui";
import { globalUnit, unitFor, unitLabel } from "../lib/units";
import type { ExerciseUnits, WeightUnit } from "../lib/units";
import { Box, Button, Chip, Collapse, IconButton, Stack, Typography } from "@mui/material";
import { createTheme, ThemeProvider, useTheme } from "@mui/material/styles";
import { useMemo, useState } from "react";
import { ArrowBack as ArrowBackIcon } from "../ui/icons";
import { ExpandMoreRounded as ExpandMoreRoundedIcon } from "../ui/icons";
import MoodPad from "../components/MoodPad";
import BodyMap from "../components/analytics/BodyMap";
import { sessionMuscleLoads } from "../lib/analytics";
import { Edit as EditIcon } from "../ui/icons";
import WorkoutActions from "../components/WorkoutActions";
import WorkoutPhotos from "../components/social/WorkoutPhotos";
import TodoList from "../components/TodoList";
import ActivityDetail from "../components/ActivityDetail";
import { clock } from "../lib/activityDetail";
import { ActivityIcon } from "../lib/icons";
import {
  formatDateFull,
  formatDistance,
  formatDuration,
  formatCalories,
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
  sessionAvgHr,
  sessionDurationSec,
  sessionSetCount,
  sessionVolume,
} from "../lib/types";
import { typeColor } from "../lib/activityColors";
import { useT } from "../lib/i18n";
import { cardioProfile, formatRate, rateLabel } from "../lib/cardioProfiles";
import { isCaloriesEstimate, sessionCalories } from "../lib/calories";
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
  onCopyTo?: (date: string) => void;
  onChange: (session: Session) => void;
  /** Свои единицы веса упражнений (тренажёры в фунтах). */
  exerciseUnits?: ExerciseUnits;
}

/** Подход текстом: «80×5», дропы дописываются стрелкой «→70×6». */
function setText(set: WorkoutSet, unit: WeightUnit): string {
  const main = `${formatWeight(set.weight, unit)}×${set.reps ?? "—"}`;
  const drops = (set.drops ?? [])
    .map((d) => `→${formatWeight(d.weight, unit)}×${d.reps ?? "—"}`)
    .join("");
  return main + drops;
}

export default function SessionView({
  session,
  exercises,
  onBack,
  onEdit,
  onDelete,
  onCopyTo,
  onChange,
  exerciseUnits,
}: Props) {
  const t = useT();
  const duration = sessionDurationSec(session);
  const profile = cardioProfile(session.cardioKind);
  const kcal = sessionCalories(session);
  // Мелкие показатели вида — строкой под крупными.
  const cardio = session.cardio;
  const cardioExtras = [
    cardio?.inclineDeg != null ? `${t("Наклон", "Incline")} ${cardio.inclineDeg}°` : null,
    cardio?.resistance != null ? `${t("Уровень", "Resistance")} ${cardio.resistance}` : null,
    cardio?.powerW != null ? `${cardio.powerW} ${t("Вт", "W")}` : null,
    cardio?.floors != null ? `${t("Этажи", "Floors")} ${cardio.floors}` : null,
  ].filter((x): x is string => x != null);
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
        <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0 }}>
          {formatDateFull(session.date)}
          {session.time ? ` · ${session.time}` : ""}
        </Typography>
        <Button size="small" startIcon={<EditIcon sx={{ fontSize: 16 }} />} onClick={onEdit}>
          {t("Изменить", "Edit")}
        </Button>
        <WorkoutActions onCopyTo={onCopyTo} onDelete={onDelete} feedHidden={session.feedHidden} onToggleFeed={() => onChange({ ...session, feedHidden: !session.feedHidden })} />
      </Stack>

      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 2 }}>
        <IconBadge color={color} size={48}>
          <ActivityIcon icon={activityIcon(session)} fontSize="medium" />
        </IconBadge>
        <Box>
          <Typography variant="h1">{sessionTitle(session)}</Typography>
          {(duration != null || sessionAvgHr(session) != null) && (
            <Typography variant="body2" color="text.secondary">
              {[
                duration != null ? (session.source ? clock(duration) : formatDuration(duration)) : null,
                sessionAvgHr(session) != null ? `${sessionAvgHr(session)} ${t("уд/мин", "bpm")}` : null,
                session.autoEnded ? t("завершена автоматически", "closed automatically") : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Typography>
          )}
        </Box>
      </Stack>

      {/* Фото после тренировки — как в Strava. */}
      <WorkoutPhotos photos={session.photos ?? []} onChange={(photos) => onChange({ ...session, photos })} />

      {/* Самочувствие после — точка на 2D-карте (оси под контекст). У
          восстановления «Как зашло» живёт в своём редакторе. */}
      <Card sx={{ p: 0, mb: 2, overflow: "hidden" }}>
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
              {session.mood ? moodReading(moodCtx, session.mood) : t("отметь самочувствие", "rate how you feel")}
            </Typography>
          </Box>
          {session.mood && (
            <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: "primary.main", flexShrink: 0 }} />
          )}
          <ExpandMoreRoundedIcon
            sx={{ color: "text.secondary", transition: tr("transform"), transform: moodOpen ? "rotate(180deg)" : "none" }}
          />
        </Box>
        <Collapse in={moodOpen}>
          <Box sx={{ px: 1.75, pb: 1.75 }}>
          <MoodPad
            value={session.mood ?? null}
            onChange={(m) => onChange({ ...session, mood: m })}
            yLabels={moodCfg.y}
            xLabels={moodCfg.x}
            color={color}
          />
          </Box>
        </Collapse>
      </Card>

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
                    <Card key={item.id} sx={{ p: 1.5, mb: isSuper ? 1 : 1.5 }}>
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
                          .map((s) => setText(s, unitFor(item.exerciseId, exerciseUnits)))
                          .join(" · ") || "—"}
                        {item.sets.some((s) => s.weight != null) && unitFor(item.exerciseId, exerciseUnits) !== globalUnit()
                          ? ` ${unitLabel(unitFor(item.exerciseId, exerciseUnits))}`
                          : ""}
                      </Typography>
                    </Card>
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

      {/* С подробностями часов сводку показывает ActivityDetail — без дубля. */}
      {session.kind === "cardio" && session.cardio && !session.source?.detail && (
        <Card sx={{ mb: 2 }}>
          {/* Крупно — то, что важно этому виду: у степпера дистанции нет,
              у ходьбы вместо темпа скорость. */}
          <Stack direction="row" spacing={3} sx={{ flexWrap: "wrap", rowGap: 1.5 }}>
            {profile.distance && (
              <ViewStat
                label={t("Дистанция", "Distance")}
                value={formatDistance(session.cardio.distanceM, session.cardioKind)}
              />
            )}
            <ViewStat
              label={session.source ? t("Активное время", "Active time") : t("Время", "Time")}
              value={session.source ? clock(session.cardio.durationSec) : formatDuration(session.cardio.durationSec)}
            />
            {session.stats?.elapsedSec != null && <ViewStat label={t("Полное время", "Elapsed")} value={clock(session.stats.elapsedSec)} />}
            {profile.rate && (
              <ViewStat
                label={rateLabel(profile.rate) ?? ""}
                value={formatRate(
                  profile.rate,
                  session.cardio.distanceM,
                  session.cardio.durationSec,
                )}
              />
            )}
            {kcal != null && (
              <ViewStat
                label={t("Калории", "Calories")}
                value={`${isCaloriesEstimate(session) ? "≈ " : ""}${formatCalories(kcal)}`}
              />
            )}
          </Stack>
          {cardioExtras.length > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              {cardioExtras.join(" · ")}
            </Typography>
          )}
          {session.source && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.25 }}>
              {session.source.provider.toUpperCase()}
              {session.source.detail === "streams" ? t(" · графики и маршрут ниже", " · charts and route below") : session.source.detail ? t(" · подробности ниже", " · details below") : t(" · подробности ещё не загружены", " · details not loaded yet")}
            </Typography>
          )}
        </Card>
      )}

      {session.source?.detail && <ActivityDetail session={session} />}

      {(session.todos?.length ?? 0) > 0 && (
        <Box sx={{ mb: 2 }}>
          <TodoList items={session.todos!} onChange={(todos) => onChange({ ...session, todos })} />
        </Box>
      )}

      {session.notes && (
        <Card sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
            {session.notes}
          </Typography>
        </Card>
      )}

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
