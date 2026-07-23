import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import MiniChart from "./MiniChart";
import { formatDate } from "../lib/format";
import type { TrainedExercise } from "../lib/analytics";

interface Props {
  exercise: TrainedExercise | null;
  onClose: () => void;
}

/** Карточка упражнения: график расчётного максимума (e1RM) по датам. */
export default function ExerciseProgressDialog({ exercise, onClose }: Props) {
  const points =
    exercise?.points.map((p) => ({
      label: formatDate(p.date),
      value: p.e1rm,
    })) ?? [];

  const first = exercise?.points[0]?.e1rm ?? 0;
  const last = exercise?.points[exercise.points.length - 1]?.e1rm ?? 0;
  const delta = last - first;

  return (
    <Dialog open={Boolean(exercise)} onClose={onClose} fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        {exercise?.name}
        <IconButton
          onClick={onClose}
          sx={{ position: "absolute", right: 8, top: 8 }}
          aria-label="Закрыть"
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="text.secondary">
          Расчётный разовый максимум, кг
        </Typography>
        <MiniChart points={points} format={(v) => `${Math.round(v)}`} />

        <Stack direction="row" spacing={3} sx={{ mt: 2 }}>
          <Stat label="Лучший" value={`${Math.round(exercise?.best ?? 0)} кг`} />
          <Stat label="Текущий" value={`${Math.round(last)} кг`} />
          {exercise && exercise.points.length > 1 && (
            <Stat
              label="Динамика"
              value={`${delta >= 0 ? "+" : ""}${Math.round(delta)} кг`}
              accent={delta >= 0}
            />
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block" }}
      >
        {label}
      </Typography>
      <Typography
        variant="subtitle1"
        sx={{ fontWeight: 700, color: accent ? "primary.main" : "text.primary" }}
      >
        {value}
      </Typography>
    </div>
  );
}
