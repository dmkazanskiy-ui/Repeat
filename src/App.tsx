import { useCallback, useEffect, useState } from "react";
import { load, saveExercises, saveWorkouts, buildWorkout } from "./lib/store";
import type { Exercise, SplitCode, Workout } from "./lib/types";
import Home from "./screens/Home";
import WorkoutScreen from "./screens/Workout";
import History from "./screens/History";
import ExerciseDetail from "./screens/ExerciseDetail";
import Exercises from "./screens/Exercises";
import "./App.css";

type Screen =
  | { name: "home" }
  | { name: "workout"; id: string }
  | { name: "history" }
  | { name: "exercise"; id: string }
  | { name: "exercises" };

export default function App() {
  const [ready, setReady] = useState(false);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [screen, setScreen] = useState<Screen>({ name: "home" });

  useEffect(() => {
    load().then((data) => {
      setWorkouts(data.workouts);
      setExercises(data.exercises);
      setReady(true);
    });
  }, []);

  // Пишем в хранилище на каждое изменение: тренировка может оборваться
  // в любой момент — телефон сел, Telegram свернулся, сеть пропала.
  const commitWorkouts = useCallback((next: Workout[]) => {
    setWorkouts(next);
    void saveWorkouts(next);
  }, []);

  const commitExercises = useCallback((next: Exercise[]) => {
    setExercises(next);
    void saveExercises(next);
  }, []);

  const updateWorkout = useCallback(
    (updated: Workout) => {
      commitWorkouts(
        workouts.map((w) => (w.id === updated.id ? updated : w)),
      );
    },
    [workouts, commitWorkouts],
  );

  const startWorkout = useCallback(
    (code: SplitCode) => {
      const workout = buildWorkout(code, exercises, workouts);
      commitWorkouts([...workouts, workout]);
      setScreen({ name: "workout", id: workout.id });
    },
    [exercises, workouts, commitWorkouts],
  );

  const deleteWorkout = useCallback(
    (id: string) => {
      commitWorkouts(workouts.filter((w) => w.id !== id));
      setScreen({ name: "home" });
    },
    [workouts, commitWorkouts],
  );

  if (!ready) return <div className="app" />;

  const active = workouts.find((w) => w.status === "in_progress") ?? null;

  switch (screen.name) {
    case "workout": {
      const workout = workouts.find((w) => w.id === screen.id);
      if (!workout) {
        setScreen({ name: "home" });
        return <div className="app" />;
      }
      return (
        <WorkoutScreen
          workout={workout}
          exercises={exercises}
          workouts={workouts}
          onChange={updateWorkout}
          onDelete={() => deleteWorkout(workout.id)}
          onBack={() => setScreen({ name: "home" })}
          onOpenExercise={(id) => setScreen({ name: "exercise", id })}
        />
      );
    }

    case "history":
      return (
        <History
          workouts={workouts}
          exercises={exercises}
          onBack={() => setScreen({ name: "home" })}
          onOpen={(id) => setScreen({ name: "workout", id })}
        />
      );

    case "exercise":
      return (
        <ExerciseDetail
          exerciseId={screen.id}
          exercises={exercises}
          workouts={workouts}
          onBack={() => setScreen({ name: "home" })}
        />
      );

    case "exercises":
      return (
        <Exercises
          exercises={exercises}
          onChange={commitExercises}
          onBack={() => setScreen({ name: "home" })}
          onOpen={(id) => setScreen({ name: "exercise", id })}
        />
      );

    default:
      return (
        <Home
          workouts={workouts}
          exercises={exercises}
          active={active}
          onStart={startWorkout}
          onResume={(id) => setScreen({ name: "workout", id })}
          onOpenHistory={() => setScreen({ name: "history" })}
          onOpenExercises={() => setScreen({ name: "exercises" })}
        />
      );
  }
}
