import { splitDay } from "../lib/split";
import { formatDate } from "../lib/format";
import { totalVolume } from "../lib/e1rm";
import { exerciseName } from "../lib/exercises";
import type { Exercise, Workout } from "../lib/types";
import "./History.css";

interface Props {
  workouts: Workout[];
  exercises: Exercise[];
  onBack: () => void;
  onOpen: (id: string) => void;
}

export default function History({ workouts, exercises, onBack, onOpen }: Props) {
  const done = workouts
    .filter((w) => w.status === "done")
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="app">
      <header className="screen__head">
        <button className="link" type="button" onClick={onBack}>
          ← Назад
        </button>
      </header>

      <h1 className="screen__title">История</h1>

      {done.length === 0 ? (
        <p className="empty">Завершённых тренировок пока нет.</p>
      ) : (
        <ul className="hist">
          {done.map((workout) => {
            const volume = workout.exercises.reduce(
              (sum, e) => sum + totalVolume(e.sets),
              0,
            );
            const names = workout.exercises
              .map((e) => exerciseName(exercises, e.exerciseId))
              .join(" · ");

            return (
              <li key={workout.id}>
                <button
                  className="hist__item"
                  type="button"
                  onClick={() => onOpen(workout.id)}
                >
                  <div className="hist__top">
                    <span className="hist__day">
                      День {workout.splitDayCode} — {splitDay(workout.splitDayCode).title}
                    </span>
                    <span className="hist__date">{formatDate(workout.date)}</span>
                  </div>
                  <p className="hist__names">{names}</p>
                  <p className="hist__volume">
                    {Math.round(volume).toLocaleString("ru")} кг тоннажа
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
