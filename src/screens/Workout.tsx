import { useState } from "react";
import { splitDay } from "../lib/split";
import { formatDate, formatWeight } from "../lib/format";
import { addSet, addExercise } from "../lib/store";
import { findExercise, usesWeight, MUSCLE_LABELS } from "../lib/exercises";
import { totalVolume } from "../lib/e1rm";
import type {
  Exercise,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from "../lib/types";
import "./Workout.css";

interface Props {
  workout: Workout;
  exercises: Exercise[];
  workouts: Workout[];
  onChange: (workout: Workout) => void;
  onDelete: () => void;
  onBack: () => void;
  onOpenExercise: (id: string) => void;
}

const WEIGHT_STEP = 2.5;

/** Значение, которое встанет при подтверждении подхода «как запланировано». */
function effectiveWeight(set: WorkoutSet): number | null {
  return set.weight ?? set.targetWeight;
}

function effectiveReps(set: WorkoutSet): number | null {
  return set.reps ?? set.targetReps;
}

export default function WorkoutScreen({
  workout,
  exercises,
  onChange,
  onDelete,
  onBack,
  onOpenExercise,
}: Props) {
  const [picking, setPicking] = useState(false);

  const day = splitDay(workout.splitDayCode);
  const isDone = workout.status === "done";
  const volume = workout.exercises.reduce(
    (sum, e) => sum + totalVolume(e.sets),
    0,
  );
  const completedCount = workout.exercises.reduce(
    (n, e) => n + e.sets.filter((s) => s.completedAt).length,
    0,
  );

  function patchExercise(
    exerciseId: string,
    patch: (exercise: WorkoutExercise) => WorkoutExercise,
  ) {
    onChange({
      ...workout,
      exercises: workout.exercises.map((e) =>
        e.id === exerciseId ? patch(e) : e,
      ),
    });
  }

  function patchSet(
    exerciseId: string,
    setId: string,
    patch: (set: WorkoutSet) => WorkoutSet,
  ) {
    patchExercise(exerciseId, (exercise) => ({
      ...exercise,
      sets: exercise.sets.map((s) => (s.id === setId ? patch(s) : s)),
    }));
  }

  function toggleSet(exerciseId: string, set: WorkoutSet) {
    patchSet(exerciseId, set.id, (current) =>
      current.completedAt
        ? { ...current, completedAt: null }
        : {
            ...current,
            // Подтверждение «как в плане» — самый частый случай, поэтому
            // пустые поля берут значения из цели, а не требуют ввода.
            weight: effectiveWeight(current),
            reps: effectiveReps(current),
            completedAt: new Date().toISOString(),
          },
    );
  }

  function bump(
    exerciseId: string,
    set: WorkoutSet,
    field: "weight" | "reps",
    delta: number,
  ) {
    patchSet(exerciseId, set.id, (current) => {
      const base =
        field === "weight" ? effectiveWeight(current) : effectiveReps(current);
      const next = Math.max(0, (base ?? 0) + delta);
      return { ...current, [field]: next };
    });
  }

  function removeSet(exerciseId: string, setId: string) {
    patchExercise(exerciseId, (exercise) => ({
      ...exercise,
      sets: exercise.sets
        .filter((s) => s.id !== setId)
        .map((s, i) => ({ ...s, setIndex: i })),
    }));
  }

  function removeExercise(exerciseId: string) {
    onChange({
      ...workout,
      exercises: workout.exercises.filter((e) => e.id !== exerciseId),
    });
  }

  function finish() {
    onChange({ ...workout, status: "done" });
    onBack();
  }

  return (
    <div className="app">
      <header className="wk__head">
        <button className="link" type="button" onClick={onBack}>
          ← Назад
        </button>
        <span className="wk__date">{formatDate(workout.date)}</span>
      </header>

      <div className="wk__title">
        <h1 className="wk__day">День {workout.splitDayCode}</h1>
        <p className="wk__subtitle">{day.title}</p>
        <p className="wk__stats">
          {completedCount} подх. · {Math.round(volume).toLocaleString("ru")} кг
        </p>
      </div>

      {workout.exercises.map((item) => {
        const exercise = findExercise(exercises, item.exerciseId);
        const withWeight = usesWeight(exercise);

        return (
          <section key={item.id} className="ex">
            <div className="ex__head">
              <button
                className="ex__name"
                type="button"
                onClick={() => onOpenExercise(item.exerciseId)}
              >
                {exercise?.name ?? "Упражнение"}
              </button>
              <button
                className="ex__remove"
                type="button"
                aria-label="Убрать упражнение"
                onClick={() => removeExercise(item.id)}
              >
                ×
              </button>
            </div>
            {exercise && (
              <p className="ex__muscle">{MUSCLE_LABELS[exercise.muscleGroup]}</p>
            )}

            <ul className="sets">
              {item.sets.map((set) => {
                const weight = effectiveWeight(set);
                const reps = effectiveReps(set);
                const planned = set.weight == null && set.reps == null;

                return (
                  <li
                    key={set.id}
                    className={`set ${set.completedAt ? "set--done" : ""} ${
                      planned ? "set--planned" : ""
                    }`}
                  >
                    <span className="set__index">{set.setIndex + 1}</span>

                    {withWeight && (
                      <div className="stepper">
                        <button
                          type="button"
                          onClick={() => bump(item.id, set, "weight", -WEIGHT_STEP)}
                          aria-label="Меньше вес"
                        >
                          −
                        </button>
                        <span className="stepper__value">
                          {formatWeight(weight)}
                          <span className="stepper__unit">кг</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => bump(item.id, set, "weight", WEIGHT_STEP)}
                          aria-label="Больше вес"
                        >
                          +
                        </button>
                      </div>
                    )}

                    <div className="stepper">
                      <button
                        type="button"
                        onClick={() => bump(item.id, set, "reps", -1)}
                        aria-label="Меньше повторов"
                      >
                        −
                      </button>
                      <span className="stepper__value">
                        {reps ?? "—"}
                        <span className="stepper__unit">пвт</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => bump(item.id, set, "reps", 1)}
                        aria-label="Больше повторов"
                      >
                        +
                      </button>
                    </div>

                    <button
                      className="set__check"
                      type="button"
                      aria-label="Подход сделан"
                      onClick={() => toggleSet(item.id, set)}
                    >
                      ✓
                    </button>

                    <button
                      className="set__remove"
                      type="button"
                      aria-label="Убрать подход"
                      onClick={() => removeSet(item.id, set.id)}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>

            <button
              className="ex__add"
              type="button"
              onClick={() => patchExercise(item.id, addSet)}
            >
              + подход
            </button>
          </section>
        );
      })}

      <button
        className="btn btn--ghost"
        type="button"
        onClick={() => setPicking(true)}
      >
        + упражнение
      </button>

      {!isDone && (
        <button className="btn btn--primary wk__finish" type="button" onClick={finish}>
          Завершить тренировку
        </button>
      )}

      <button className="wk__delete" type="button" onClick={onDelete}>
        Удалить тренировку
      </button>

      {picking && (
        <div className="picker" role="dialog">
          <div className="picker__sheet">
            <div className="picker__head">
              <h2 className="picker__title">Добавить упражнение</h2>
              <button
                className="link"
                type="button"
                onClick={() => setPicking(false)}
              >
                Закрыть
              </button>
            </div>
            <ul className="picker__list">
              {exercises.map((exercise) => (
                <li key={exercise.id}>
                  <button
                    className="picker__item"
                    type="button"
                    onClick={() => {
                      onChange(addExercise(workout, exercise.id));
                      setPicking(false);
                    }}
                  >
                    <span>{exercise.name}</span>
                    <span className="picker__muscle">
                      {MUSCLE_LABELS[exercise.muscleGroup]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
