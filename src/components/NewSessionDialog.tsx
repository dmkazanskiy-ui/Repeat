import { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import DirectionsRunIcon from "@mui/icons-material/DirectionsRun";
import SelfImprovementIcon from "@mui/icons-material/SelfImprovement";
import { CARDIO_LABELS } from "../lib/types";
import type { CardioKind, SessionKind } from "../lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (kind: SessionKind, cardioKind: CardioKind | null) => void;
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

const CARDIO_KINDS = Object.keys(CARDIO_LABELS) as CardioKind[];

export default function NewSessionDialog({ open, onClose, onCreate }: Props) {
  // Кардио — единственный тип со вторым шагом; остальные создаются сразу,
  // чтобы не заставлять жать «Далее» там, где выбор уже сделан.
  const [pickingCardio, setPickingCardio] = useState(false);

  function close() {
    setPickingCardio(false);
    onClose();
  }

  return (
    <Dialog open={open} onClose={close} fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        {pickingCardio ? "Какое кардио?" : "Новая тренировка"}
      </DialogTitle>
      <DialogContent sx={{ pb: 3 }}>
        {pickingCardio ? (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 1,
            }}
          >
            {CARDIO_KINDS.map((kind) => (
              <Button
                key={kind}
                variant="outlined"
                onClick={() => {
                  onCreate("cardio", kind);
                  close();
                }}
              >
                {CARDIO_LABELS[kind]}
              </Button>
            ))}
          </Box>
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
                  onCreate(item.kind, null);
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
