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
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import { ActivityIcon, ICON_KEYS } from "../lib/icons";
import type { IconKey } from "../lib/icons";
import {
  CARDIO_ICONS,
  CARDIO_LABELS,
  MOBILITY_ICONS,
  MOBILITY_LABELS,
} from "../lib/types";
import type {
  CardioKind,
  CustomActivity,
  MobilityKind,
  SessionKind,
  TrainingProgram,
} from "../lib/types";

export interface CreateOptions {
  cardioKind?: CardioKind | null;
  mobilityKind?: MobilityKind | null;
  customKind?: string | null;
  icon?: IconKey | null;
}

interface Props {
  open: boolean;
  cardioKinds: CustomActivity[];
  mobilityKinds: CustomActivity[];
  programs: TrainingProgram[];
  /** Скопированная тренировка — если есть, показываем «Вставить». */
  hasClipboard: boolean;
  onClose: () => void;
  onCreate: (kind: SessionKind, options: CreateOptions) => void;
  onAddCustom: (kind: "cardio" | "mobility", activity: CustomActivity) => void;
  /** Начать тренировку дня программы на выбранной дате. */
  onStartProgram: (program: TrainingProgram, workoutIndex: number) => void;
  onPaste: () => void;
}

const KINDS: Array<{
  kind: SessionKind;
  label: string;
  hint: string;
  icon: IconKey;
}> = [
  {
    kind: "strength",
    label: "Силовая в зале",
    hint: "Упражнения, подходы, веса",
    icon: "gym",
  },
  {
    kind: "cardio",
    label: "Кардио",
    hint: "Бег, вел, плавание и другое",
    icon: "run",
  },
  {
    kind: "mobility",
    label: "Мобилити",
    hint: "Йога, ЛФК, стретчинг, медитация",
    icon: "yoga",
  },
];

const CARDIO_KEYS = Object.keys(CARDIO_LABELS) as CardioKind[];
const MOBILITY_KEYS = Object.keys(MOBILITY_LABELS) as MobilityKind[];

type Step = "kind" | "program" | "cardio" | "mobility" | "custom";

export default function NewSessionDialog({
  open,
  cardioKinds,
  mobilityKinds,
  programs,
  hasClipboard,
  onClose,
  onCreate,
  onAddCustom,
  onStartProgram,
  onPaste,
}: Props) {
  const [step, setStep] = useState<Step>("kind");
  const activeProgram = programs.find((p) => !p.archivedAt) ?? null;
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<IconKey>("bolt");

  // Ветку запоминаем отдельно: шаг «custom» общий для кардио и мобилити.
  const [branch, setBranch] = useState<"cardio" | "mobility">("cardio");

  function close() {
    setStep("kind");
    setName("");
    setIcon("bolt");
    onClose();
  }

  function submitCustom() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAddCustom(branch, { name: trimmed, icon });
    onCreate(branch === "cardio" ? "cardio" : "mobility", {
      customKind: trimmed,
      icon,
    });
    close();
  }

  const title =
    step === "custom"
      ? branch === "cardio"
        ? "Свой вид кардио"
        : "Своё мобилити"
      : step === "cardio"
        ? "Какое кардио?"
        : step === "mobility"
          ? "Какое мобилити?"
          : step === "program"
            ? "Тренировка дня"
            : "Новая тренировка";

  function renderGrid(
    items: Array<{ label: string; icon: IconKey; onPick: () => void }>,
  ) {
    return (
      <Box
        sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1 }}
      >
        {items.map((item) => (
          <Button
            key={item.label}
            variant="outlined"
            startIcon={<ActivityIcon icon={item.icon} />}
            onClick={() => {
              item.onPick();
              close();
            }}
            sx={{ justifyContent: "flex-start", px: 1.5 }}
          >
            {item.label}
          </Button>
        ))}
      </Box>
    );
  }

  return (
    <Dialog open={open} onClose={close} fullWidth>
      <DialogTitle sx={{ pb: 1 }}>{title}</DialogTitle>
      <DialogContent sx={{ pb: 3 }}>
        {step === "custom" && (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Название"
              placeholder={
                branch === "cardio" ? "Гребля, сайкл, лыжи…" : "Цигун, пилатес…"
              }
              value={name}
              autoFocus
              fullWidth
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitCustom();
              }}
            />

            <Box>
              <Typography variant="caption" color="text.secondary">
                Иконка
              </Typography>
              <Box
                sx={{
                  mt: 1,
                  display: "grid",
                  gridTemplateColumns: "repeat(6, 1fr)",
                  gap: 0.5,
                }}
              >
                {ICON_KEYS.map((key) => (
                  <Box
                    key={key}
                    component="button"
                    onClick={() => setIcon(key)}
                    aria-label={key}
                    sx={{
                      aspectRatio: "1",
                      display: "grid",
                      placeItems: "center",
                      border: "1px solid",
                      borderColor: icon === key ? "primary.main" : "divider",
                      borderRadius: 1,
                      bgcolor: icon === key ? "primary.main" : "transparent",
                      color: icon === key ? "primary.contrastText" : "text.primary",
                      cursor: "pointer",
                    }}
                  >
                    <ActivityIcon icon={key} />
                  </Box>
                ))}
              </Box>
            </Box>

            <Stack direction="row" spacing={1}>
              <Button
                fullWidth
                onClick={() => setStep(branch === "cardio" ? "cardio" : "mobility")}
              >
                Назад
              </Button>
              <Button fullWidth variant="contained" onClick={submitCustom}>
                Создать
              </Button>
            </Stack>
          </Stack>
        )}

        {step === "cardio" && (
          <>
            {renderGrid([
              ...CARDIO_KEYS.map((kind) => ({
                label: CARDIO_LABELS[kind],
                icon: CARDIO_ICONS[kind],
                onPick: () => onCreate("cardio", { cardioKind: kind }),
              })),
              ...cardioKinds.map((custom) => ({
                label: custom.name,
                icon: custom.icon,
                onPick: () =>
                  onCreate("cardio", {
                    customKind: custom.name,
                    icon: custom.icon,
                  }),
              })),
            ])}
            <Button
              fullWidth
              onClick={() => {
                setBranch("cardio");
                setStep("custom");
              }}
              sx={{ mt: 1.5 }}
            >
              + Свой вид
            </Button>
          </>
        )}

        {step === "mobility" && (
          <>
            {renderGrid([
              ...MOBILITY_KEYS.map((kind) => ({
                label: MOBILITY_LABELS[kind],
                icon: MOBILITY_ICONS[kind],
                onPick: () => onCreate("mobility", { mobilityKind: kind }),
              })),
              ...mobilityKinds.map((custom) => ({
                label: custom.name,
                icon: custom.icon,
                onPick: () =>
                  onCreate("mobility", {
                    customKind: custom.name,
                    icon: custom.icon,
                  }),
              })),
            ])}
            <Button
              fullWidth
              onClick={() => {
                setBranch("mobility");
                setStep("custom");
              }}
              sx={{ mt: 1.5 }}
            >
              + Свой вид
            </Button>
          </>
        )}

        {step === "program" && activeProgram && (
          <Stack spacing={1}>
            <Typography variant="caption" color="text.secondary">
              {activeProgram.name} · круг {activeProgram.cycleNumber}
            </Typography>
            {[...activeProgram.workouts]
              .sort((a, b) => a.order - b.order)
              .map((workout, index) => (
                <Button
                  key={workout.id}
                  variant="outlined"
                  startIcon={<FitnessCenterIcon />}
                  onClick={() => {
                    onStartProgram(activeProgram, index);
                    close();
                  }}
                  sx={{
                    justifyContent: "flex-start",
                    px: 2,
                    py: 1.5,
                    borderColor:
                      index === activeProgram.currentWorkoutIndex
                        ? "primary.main"
                        : undefined,
                  }}
                >
                  <Box sx={{ textAlign: "left", ml: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {workout.name}
                      {index === activeProgram.currentWorkoutIndex ? " · следующая" : ""}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {workout.exercises.length === 0
                        ? "Пусто — добавь упражнения"
                        : `${workout.exercises.length} упр., веса подтянутся с прошлого раза`}
                    </Typography>
                  </Box>
                </Button>
              ))}
            <Button onClick={() => setStep("kind")} sx={{ mt: 0.5 }}>
              Назад
            </Button>
          </Stack>
        )}

        {step === "kind" && (
          <Stack spacing={1}>
            {activeProgram && (
              <Button
                variant="outlined"
                startIcon={<FitnessCenterIcon />}
                onClick={() => setStep("program")}
                sx={{ justifyContent: "flex-start", px: 2, py: 1.5 }}
              >
                <Box sx={{ textAlign: "left", ml: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Программа
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Тренировка дня из твоего сплита
                  </Typography>
                </Box>
              </Button>
            )}
            {KINDS.map((item) => (
              <Button
                key={item.kind}
                variant="outlined"
                startIcon={<ActivityIcon icon={item.icon} />}
                onClick={() => {
                  if (item.kind === "cardio") return setStep("cardio");
                  if (item.kind === "mobility") return setStep("mobility");
                  onCreate("strength", {});
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

            {hasClipboard && (
              <Button
                variant="outlined"
                startIcon={<ContentPasteIcon />}
                onClick={() => {
                  onPaste();
                  close();
                }}
                sx={{ justifyContent: "flex-start", px: 2, py: 1.5 }}
              >
                <Box sx={{ textAlign: "left", ml: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Вставить тренировку
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Копия скопированной ранее
                  </Typography>
                </Box>
              </Button>
            )}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
