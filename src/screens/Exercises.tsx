import { useState } from "react";
import { newId } from "../lib/id";
import { MUSCLE_LABELS } from "../lib/exercises";
import type { Exercise, MuscleGroup, TrackingType } from "../lib/types";
import "./Exercises.css";

interface Props {
  exercises: Exercise[];
  onChange: (exercises: Exercise[]) => void;
  onBack: () => void;
  onOpen: (id: string) => void;
}

const GROUPS = Object.keys(MUSCLE_LABELS) as MuscleGroup[];

const TRACKING_LABELS: Record<TrackingType, string> = {
  weight_reps: "Вес × повторы",
  bodyweight_reps: "Свой вес",
  time: "Время",
  distance: "Дистанция",
};

export default function Exercises({ exercises, onChange, onBack, onOpen }: Props) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState<MuscleGroup>("chest");
  const [tracking, setTracking] = useState<TrackingType>("weight_reps");

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onChange([
      ...exercises,
      {
        id: newId(),
        name: trimmed,
        aliases: [trimmed.toLowerCase()],
        muscleGroup: group,
        trackingType: tracking,
      },
    ]);
    setName("");
  }

  function remove(id: string) {
    onChange(exercises.filter((e) => e.id !== id));
  }

  // Группируем по мышцам — так справочник читается, а не превращается
  // в простыню из двадцати строк.
  const byGroup = GROUPS.map((key) => ({
    key,
    items: exercises.filter((e) => e.muscleGroup === key),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="app">
      <header className="screen__head">
        <button className="link" type="button" onClick={onBack}>
          ← Назад
        </button>
      </header>

      <h1 className="screen__title">Упражнения</h1>

      <section className="add">
        <input
          className="add__input"
          value={name}
          placeholder="Название упражнения"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") add();
          }}
        />
        <div className="add__row">
          <select
            className="add__select"
            value={group}
            onChange={(event) => setGroup(event.target.value as MuscleGroup)}
          >
            {GROUPS.map((key) => (
              <option key={key} value={key}>
                {MUSCLE_LABELS[key]}
              </option>
            ))}
          </select>
          <select
            className="add__select"
            value={tracking}
            onChange={(event) => setTracking(event.target.value as TrackingType)}
          >
            {(Object.keys(TRACKING_LABELS) as TrackingType[]).map((key) => (
              <option key={key} value={key}>
                {TRACKING_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn--ghost" type="button" onClick={add}>
          Добавить
        </button>
      </section>

      {byGroup.map((section) => (
        <section key={section.key} className="group">
          <h2 className="group__title">{MUSCLE_LABELS[section.key]}</h2>
          <ul className="group__list">
            {section.items.map((exercise) => (
              <li key={exercise.id} className="group__item">
                <button
                  className="group__name"
                  type="button"
                  onClick={() => onOpen(exercise.id)}
                >
                  {exercise.name}
                  <span className="group__tracking">
                    {TRACKING_LABELS[exercise.trackingType]}
                  </span>
                </button>
                <button
                  className="group__remove"
                  type="button"
                  aria-label="Удалить упражнение"
                  onClick={() => remove(exercise.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
