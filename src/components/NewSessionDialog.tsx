import { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import DirectionsRunIcon from "@mui/icons-material/DirectionsRun";
import SelfImprovementIcon from "@mui/icons-material/SelfImprovement";
import { CARDIO_LABELS } from "../lib/types";
import type { CardioKind, SessionKind } from "../lib/types";

interface Props {
  open: boolean;
  /** Свои виды кардио, заведённые пользователем. */
  cardioKinds: string[];
  onClose: () => void;
  onCreate: (
    kind: SessionKind,
    cardioKind: CardioKind | null,
    cardioCustom: string | null,
  ) => void;
  onAddCardioKind: (name: string) => void;
}

const KINDS: Array<{
  kind: SessionKind;
  label: string;
  hint: string;
  icon: React.ReactNode;
}> = [
  {
    kind: "strength",
    label: "Силовая в зале",
    hint: "Упражнения, подходы, веса",
    icon: <FitnessCenterIcon />,
  },
  {
    kind: "cardio",
    label: "Кардио",
    hint: "Бег, вел, плавание и другое",
    icon: <DirectionsRunIcon />,
  },
  {
    kind: "mobility",
    label: "Мобилити",
    hint: "Растяжка, суставная работа",
    icon: <SelfImprovementIcon />,
  },
];

const BASE_KINDS = Object.keys(CARDIO_LABELS) as CardioKind[];

export default function NewSessionDialog({
  open,
  cardioKinds,
  onClose,
  onCreate,
  onAddCardioKind,
}: Props) {
  // Кардио — единственный тип со вторым шагом; остальные создаются сразу,
  // чтобы не заставлять жать «Далее» там, где выбор уже сделан.
  const [pickingCardio, setPickingCardio] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  function close() {
    setPickingCardio(false);
    setAdding(false);
    setName("");
    onClose();
  }

  function submitCustom() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAddCardioKind(trimmed);
    onCreate("cardio", null, trimmed);
    close();
  }

  return (
    <Dialog open={open} onClose={close} fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        {adding
          ? "Свой вид кардио"
          : pickingCardio
            ? "Какое кардио?"
            : "Новая тренировка"}
      </DialogTitle>
      <DialogContent sx={{ pb: 3 }}>
        {adding ? (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Название"
              placeholder="Гребля, сайкл, лыжи…"
              value={name}
              autoFocus
              fullWidth
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitCustom();
              }}
            />
            <Stack direction="row" spacing={1}>
              <Button fullWidth onClick={() => setAdding(false)}>
                Назад
              </Button>
              <Button fullWidth variant="contained" onClick={submitCustom}>
                Создать
              </Button>
            </Stack>
          </Stack>
        ) : pickingCardio ? (
          <>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 1,
              }}
            >
              {BASE_KINDS.map((kind) => (
                <Button
                  key={kind}
                  variant="outlined"
                  onClick={() => {
                    onCreate("cardio", kind, null);
                    close();
                  }}
                >
                  {CARDIO_LABELS[kind]}
                </Button>
              ))}
              {cardioKinds.map((custom) => (
                <Button
                  key={custom}
                  variant="outlined"
                  onClick={() => {
                    onCreate("cardio", null, custom);
                    close();
                  }}
                >
                  {custom}
                </Button>
              ))}
            </Box>
            <Button fullWidth onClick={() => setAdding(true)} sx={{ mt: 1.5 }}>
              + Свой вид
            </Button>
          </>
        ) : (
          <Stack spacing={1}>
            {KINDS.map((item) => (
              <Button
                key={item.kind}
                variant="outlined"
                startIcon={item.icon}
                onClick={() => {
                  if (item.kind === "cardio") {
                    setPickingCardio(true);
                    return;
                  }
                  onCreate(item.kind, null, null);
                  close();
                }}
                sx={{ justifyContent: "flex-start", px: 2, py: 1.5 }}
              >
                <Box sx={{ textAlign: "left", ml: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {item.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {item.hint}
                  </Typography>
                </Box>
              </Button>
            ))}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
