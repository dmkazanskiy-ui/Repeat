import { bestE1rm, setVolume } from "../lib/e1rm";
import { findExercise, usesWeight, MUSCLE_LABELS } from "../lib/exercises";
import { formatDate, formatWeight } from "../lib/format";
import type { Exercise, Workout, WorkoutSet } from "../lib/types";
import "./ExerciseDetail.css";

interface Props {
  exerciseId: string;
  exercises: Exercise[];
  workouts: Workout[];
  onBack: () => void;
}

interface Session {
  date: string;
  sets: WorkoutSet[];
  best: number | null;
}

/** Все завершённые подходы этого упражнения, сгруппированные по тренировкам. */
function collectSessions(workouts: Workout[], exerciseId: string): Session[] {
  return workouts
    .filter((w) => w.status === "done")
    .flatMap((workout) =>
      workout.exercises
        .filter((e) => e.exerciseId === exerciseId)
        .map((e) => {
          const sets = e.sets.filter((s) => s.completedAt && !s.isWarmup);
          return { date: workout.date, sets, best: bestE1rm(sets) };
        }),
    )
    .filter((session) => session.sets.length > 0)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * Спарклайн расчётного максимума. Намеренно минимальный — без осей и
 * подписей: это индикатор направления, а не аналитический график.
 * Полноценные графики появятся на этапе аналитики (SPEC.md §8).
 */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;

  const width = 280;
  const height = 56;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      className="spark"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Динамика расчётного максимума"
    >
      <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="2" />
    </svg>
  );
}

export default function ExerciseDetail({
  exerciseId,
  exercises,
  workouts,
  onBack,
}: Props) {
  const exercise = findExercise(exercises, exerciseId);
  const sessions = collectSessions(workouts, exerciseId);
  const withWeight = usesWeight(exercise);

  const allSets = sessions.flatMap((s) => s.sets);
  const prWeight = allSets.reduce<number | null>(
    (best, set) =>
      set.weight != null && (best == null || set.weight > best) ? set.weight : best,
    null,
  );
  const prE1rm = bestE1rm(allSets);
  const prVolume = allSets.reduce((best, set) => Math.max(best, setVolume(set)), 0);
  const prReps = allSets.reduce<number | null>(
    (best, set) =>
      set.reps != null && (best == null || set.reps > best) ? set.reps : best,
    null,
  );
  const totalReps = allSets.reduce((sum, set) => sum + (set.reps ?? 0), 0);

  // Хронологический порядок — спарклайн читается слева направо.
  const trend = [...sessions]
    .reverse()
    .map((s) => s.best)
    .filter((value): value is number => value != null);

  return (
    <div className="app">
      <header className="screen__head">
        <button className="link" type="button" onClick={onBack}>
          ← Назад
        </button>
      </header>

      <h1 className="screen__title">{exercise?.name ?? "Упражнение"}</h1>
      {exercise && (
        <p className="det__muscle">{MUSCLE_LABELS[exercise.muscleGroup]}</p>
      )}

      {sessions.length === 0 ? (
        <p className="empty">
          Пока нет завершённых подходов. Отметь хотя бы один — появятся рекорды
          и динамика.
        </p>
      ) : (
        <>
          {trend.length >= 2 && (
            <section className="det__card">
              <p className="det__label">Расчётный максимум</p>
              <p className="det__big">{formatWeight(prE1rm)} кг</p>
              <Sparkline values={trend} />
            </section>
          )}

          {/* Для упражнений со своим весом вес и тоннаж всегда нули —
              показываем то, что для них осмысленно: повторы. */}
          <section className="prs">
            {withWeight ? (
              <>
                <div className="pr">
                  <span className="pr__label">Лучший вес</span>
                  <span className="pr__value">{formatWeight(prWeight)} кг</span>
                </div>
                <div className="pr">
                  <span className="pr__label">Лучший расчётный максимум</span>
                  <span className="pr__value">{formatWeight(prE1rm)} кг</span>
                </div>
                <div className="pr">
                  <span className="pr__label">Лучший объём за подход</span>
                  <span className="pr__value">
                    {Math.round(prVolume).toLocaleString("ru")} кг
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="pr">
                  <span className="pr__label">Лучший подход</span>
                  <span className="pr__value">{prReps ?? "—"} пвт</span>
                </div>
                <div className="pr">
                  <span className="pr__label">Всего повторов</span>
                  <span className="pr__value">{totalReps}</span>
                </div>
              </>
            )}
          </section>

          <h2 className="det__section">История</h2>
          <ul className="det__list">
            {sessions.map((session, index) => (
              <li key={`${session.date}-${index}`} className="det__item">
                <div className="det__row">
                  <span className="det__date">{formatDate(session.date)}</span>
                  {session.best != null && (
                    <span className="det__e1rm">
                      e1RM {formatWeight(session.best)} кг
                    </span>
                  )}
                </div>
                <p className="det__sets">
                  {session.sets
                    .map((set) =>
                      withWeight
                        ? `${formatWeight(set.weight)}×${set.reps ?? "—"}`
                        : `${set.reps ?? "—"} пвт`,
                    )
                    .join("   ")}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
