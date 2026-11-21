import { Card, radius } from "../ui";
import Segmented from "../ui/Segmented";
import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import { Add as AddIcon } from "../ui/icons";
import { ArrowBack as ArrowBackIcon } from "../ui/icons";
import { ChevronRight as ChevronRightIcon } from "../ui/icons";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import type { TrainingProgram } from "../lib/types";
import { PROGRAM_PRESETS } from "../lib/programLibrary";
import type { ProgramPreset } from "../lib/programLibrary";
import { catalogNameEn } from "../lib/catalog";

interface Props {
  programs: TrainingProgram[];
  onBack?: () => void;
  onOpen: (program: TrainingProgram) => void;
  onCreate: () => void;
  onAddPreset: (preset: ProgramPreset) => void;
}

type LibTab = "mine" | "library";

function IconTile() {
  return (
    <Box
      sx={{
        width: 46,
        height: 46,
        borderRadius: radius.icon,
        flexShrink: 0,
        display: "grid",
        placeItems: "center",
        bgcolor: "action.hover",
        color: "primary.main",
      }}
    >
      <FitnessCenterIcon fontSize="small" />
    </Box>
  );
}

import { useT } from "../lib/i18n";

export default function ProgramsScreen({
  programs,
  onBack,
  onOpen,
  onCreate,
  onAddPreset,
}: Props) {
  const t = useT();
  const [tab, setTab] = useState<LibTab>("mine");
  const [preview, setPreview] = useState<ProgramPreset | null>(null);
  const mine = programs.filter((p) => !p.archivedAt);

  // Превью готовой программы из библиотеки.
  if (preview) {
    return (
      <Box sx={{ pb: 10 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
          <IconButton onClick={() => setPreview(null)} edge="start" aria-label={t("Назад", "Back")}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h1" sx={{ flex: 1 }} noWrap>
            {preview.name}
          </Typography>
        </Stack>
        <Chip size="small" variant="outlined" label={preview.subtitle} sx={{ mb: 1.5 }} />
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {preview.description}
        </Typography>

        <Typography variant="h2" sx={{ mb: 1.5 }}>
          {t("Тренировки в программе", "Workouts in program")}
        </Typography>
        <Stack spacing={1}>
          {preview.workouts.map((w) => (
            <Card key={w.name}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                <IconTile />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2" noWrap>
                    {w.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                    {w.exercises.length} {t("упр.", "ex.")} · {w.exercises.slice(0, 3).map((e) => catalogNameEn(e.name)).join(" · ")}
                    {w.exercises.length > 3 ? "…" : ""}
                  </Typography>
                </Box>
              </Stack>
            </Card>
          ))}
        </Stack>

        <Button
          fullWidth
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => onAddPreset(preview)}
          sx={{ mt: 2 }}
        >
          {t("Добавить в мои программы", "Add to my programs")}
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 10 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1.5 }}>
        {onBack && (
          <IconButton onClick={onBack} edge="start" aria-label={t("Назад", "Back")}>
            <ArrowBackIcon />
          </IconButton>
        )}
        <Typography variant="h1">{t("Программы", "Programs")}</Typography>
      </Stack>

      <Box sx={{ mb: 2 }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "mine", label: t("Мои программы", "My programs") },
            { value: "library", label: t("Библиотека", "Library") },
          ]}
        />
      </Box>

      {tab === "mine" && (
        <Stack spacing={1}>
          {/* Карточка создания */}
          <Card
            role="button"
            tabIndex={0}
            onClick={onCreate}
            sx={{
              cursor: "pointer",
              borderStyle: "dashed",
              borderColor: "primary.main" }}
          >
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
              <Box
                sx={{
                  width: 46,
                  height: 46,
                  borderRadius: radius.icon,
                  flexShrink: 0,
                  display: "grid",
                  placeItems: "center",
                  color: "primary.main",
                }}
              >
                <AddIcon />
              </Box>
              <Typography variant="subtitle2" sx={{ color: "primary.main" }}>
                {t("Создать программу", "Create program")}
              </Typography>
            </Stack>
          </Card>

          {mine.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
              {t("Пока нет своих программ. Создай с нуля или возьми готовую из библиотеки.", "No programs yet. Create one from scratch or grab a ready one from the library.")}
            </Typography>
          ) : (
            mine.map((program) => {
              const count = program.workouts.length;
              return (
                <Card
                  key={program.id}
                 
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(program)}
                  sx={{ cursor: "pointer" }}
                >
                  <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                    <IconTile />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2" noWrap>
                        {program.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {count} {count === 1 ? t("тренировка", "workout") : t("тренировки", "workouts")} · {t("круг", "cycle")} {program.cycleNumber}
                      </Typography>
                    </Box>
                    <ChevronRightIcon sx={{ color: "text.disabled" }} />
                  </Stack>
                </Card>
              );
            })
          )}
        </Stack>
      )}

      {tab === "library" && (
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            {t("Готовые программы. Открой, посмотри тренировки и добавь к себе — потом меняй как захочешь.", "Ready-made programs. Open one, review its workouts and add it — then tweak it however you like.")}
          </Typography>
          {PROGRAM_PRESETS.map((preset) => (
            <Card
              key={preset.key}
             
              role="button"
              tabIndex={0}
              onClick={() => setPreview(preset)}
              sx={{ cursor: "pointer" }}
            >
              <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                <IconTile />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" noWrap>
                    {preset.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {preset.subtitle}
                  </Typography>
                </Box>
                <ChevronRightIcon sx={{ color: "text.disabled" }} />
              </Stack>
            </Card>
          ))}
        </Stack>
      )}
    </Box>
  );
}
