import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import { MUSCLE_GROUPS, MUSCLE_LABELS } from "../lib/catalog";
import { exerciseName } from "../lib/types";
import { useT } from "../lib/i18n";
import type { Exercise, MuscleGroup } from "../lib/types";

interface Props {
  open: boolean;
  exercises: Exercise[];
  onClose: () => void;
  onPick: (exerciseId: string) => void;
  onCreate: (name: string, group: MuscleGroup) => Exercise;
}

export default function ExercisePickerDialog({
  open,
  exercises,
  onClose,
  onPick,
  onCreate,
}: Props) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<MuscleGroup | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState<MuscleGroup>("chest");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const scoped = group ? exercises.filter((e) => e.muscleGroup === group) : exercises;
    if (!q) return scoped;
    // Ищем и по русскому названию, и по английскому (nameEn) — чтобы EN-поиск
    // тоже находил. Совпадение с начала названия важнее середины.
    const hay = (e: Exercise) => `${e.name} ${e.nameEn ?? ""}`.toLowerCase();
    const shown = (e: Exercise) => exerciseName(e).toLowerCase();
    return scoped
      .filter((e) => hay(e).includes(q))
      .sort((a, b) => {
        const aStarts = shown(a).startsWith(q) || a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = shown(b).startsWith(q) || b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || shown(a).localeCompare(shown(b));
      });
  }, [exercises, group, query]);

  function reset() {
    setQuery("");
    setGroup(null);
    setCreating(false);
    setNewName("");
  }

  function close() {
    reset();
    onClose();
  }

  function submitNew() {
    const name = newName.trim();
    if (!name) return;
    const created = onCreate(name, newGroup);
    onPick(created.id);
    close();
  }

  return (
    <Dialog open={open} onClose={close} fullWidth>
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}
      >
        {creating ? t("Своё упражнение", "Custom exercise") : t("Упражнение", "Exercise")}
        <IconButton onClick={close} size="small" aria-label={t("Закрыть", "Close")}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pb: 3 }}>
        {creating ? (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label={t("Название", "Name")}
              value={newName}
              autoFocus
              fullWidth
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitNew();
              }}
            />
            <TextField
              select
              label={t("Группа мышц", "Muscle group")}
              value={newGroup}
              fullWidth
              onChange={(event) => setNewGroup(event.target.value as MuscleGroup)}
            >
              {MUSCLE_GROUPS.map((key) => (
                <MenuItem key={key} value={key}>
                  {MUSCLE_LABELS[key]}
                </MenuItem>
              ))}
            </TextField>
            <Stack direction="row" spacing={1}>
              <Button fullWidth onClick={() => setCreating(false)}>
                {t("Назад", "Back")}
              </Button>
              <Button fullWidth variant="contained" onClick={submitNew}>
                {t("Добавить", "Add")}
              </Button>
            </Stack>
          </Stack>
        ) : (
          <>
            <TextField
              placeholder={t("Поиск по 200+ упражнениям", "Search 200+ exercises")}
              value={query}
              fullWidth
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />

            <Box
              sx={{
                display: "flex",
                gap: 0.5,
                overflowX: "auto",
                py: 1.5,
                mx: -1,
                px: 1,
              }}
            >
              <Chip
                label={t("Все", "All")}
                size="small"
                color={group === null ? "primary" : "default"}
                variant={group === null ? "filled" : "outlined"}
                onClick={() => setGroup(null)}
              />
              {MUSCLE_GROUPS.map((key) => (
                <Chip
                  key={key}
                  label={MUSCLE_LABELS[key]}
                  size="small"
                  color={group === key ? "primary" : "default"}
                  variant={group === key ? "filled" : "outlined"}
                  onClick={() => setGroup(group === key ? null : key)}
                  sx={{ flexShrink: 0 }}
                />
              ))}
            </Box>

            <List dense sx={{ maxHeight: "45vh", overflowY: "auto", mx: -1 }}>
              {results.map((exercise) => (
                <ListItemButton
                  key={exercise.id}
                  onClick={() => {
                    onPick(exercise.id);
                    close();
                  }}
                >
                  <ListItemText
                    primary={exerciseName(exercise)}
                    secondary={
                      group === null ? MUSCLE_LABELS[exercise.muscleGroup] : undefined
                    }
                  />
                </ListItemButton>
              ))}
              {results.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 2 }}>
                  {t("Ничего не нашлось. Добавь своё упражнение.", "Nothing found. Add a custom exercise.")}
                </Typography>
              )}
            </List>

            <Button fullWidth onClick={() => setCreating(true)} sx={{ mt: 1 }}>
              + {t("Своё упражнение", "Custom exercise")}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
