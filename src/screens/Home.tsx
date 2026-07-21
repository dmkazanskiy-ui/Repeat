import { nextSplitDay, splitDay } from "../lib/split";
import { formatRelative } from "../lib/format";
import { totalVolume } from "../lib/e1rm";
import type { Exercise, SplitCode, Workout } from "../lib/types";
import "./Home.css";

interface Props {
  workouts: Workout[];
  exercises: Exercise[];
  active: Workout | null;
  onStart: (code: SplitCode) => void;
  onResume: (id: string) => void;
  onOpenHistory: () => void;
  onOpenExercises: () => void;
}

function workoutVolume(workout: Workout): number {
  return workout.exercises.reduce(
    (sum, exercise) => sum + totalVolume(exercise.sets),
    0,
  );
}

export default function Home({
  workouts,
  active,
  onStart,
  onResume,
  onOpenHistory,
  onOpenExercises,
}: Props) {
  const next = nextSplitDay(workouts);
  const done = workouts.filter((w) => w.status === "done");
  const recent = [...done]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 3);

  // Тоннаж за последние 7 дней — единственная цифра, которая уже
  // что-то значит на второй тренировке. Остальная аналитика позже.
  const weekVolume = done
    .filter((w) => {
      const diff =
        (Date.now() - new Date(w.date).getTime()) / 86_400_000;
      return diff <= 7;
    })
    .reduce((sum, w) => sum + workoutVolume(w), 0);

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__logo">Repeat</h1>
        <button className="link" type="button" onClick={onOpenExercises}>
          Упражнения
        </button>
      </header>

      {active ? (
        <section className="card card--active">
          <p className="card__label">Тренировка идёт</p>
          <p className="card__code">День {active.splitDayCode}</p>
          <p className="card__title">{splitDay(active.splitDayCode).title}</p>
          <button
            className="btn btn--primary"
            type="button"
            onClick={() => onResume(active.id)}
          >
            Продолжить
          </button>
        </section>
      ) : (
        <section className="card">
          <p className="card__label">Следующая тренировка</p>
          <p className="card__code">День {next.code}</p>
          <p className="card__title">{next.title}</p>
          <button
            className="btn btn--primary"
            type="button"
            onClick={() => onStart(next.code)}
          >
            Начать
          </button>
        </section>
      )}

      {done.length > 0 && (
        <p className="week">
          За неделю: <strong>{Math.round(weekVolume).toLocaleString("ru")} кг</strong> тоннажа
        </p>
      )}

      <section className="recent">
        <div className="recent__head">
          <h2 className="recent__title">Последние</h2>
          {done.length > 3 && (
            <button className="link" type="button" onClick={onOpenHistory}>
              Вся история
            </button>
          )}
        </div>

        {recent.length === 0 ? (
          <p className="empty">
            История пуста. Первая тренировка откроет цикл — дальше приложение
            само подставит веса из прошлого раза.
          </p>
        ) : (
          <ul className="recent__list">
            {recent.map((workout) => (
              <li key={workout.id} className="recent__item">
                <button
                  className="recent__btn"
                  type="button"
                  onClick={() => onResume(workout.id)}
                >
                  <span className="recent__day">{workout.splitDayCode}</span>
                  <span className="recent__meta">
                    <span>{splitDay(workout.splitDayCode).title}</span>
                    <span className="recent__sub">
                      {formatRelative(workout.date)} ·{" "}
                      {Math.round(workoutVolume(workout)).toLocaleString("ru")} кг
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
