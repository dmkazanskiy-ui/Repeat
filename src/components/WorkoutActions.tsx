// Редкие действия с тренировкой — за кнопкой «⋯» в шапке, а не простынёй
// кнопок под тренировкой. Повторить (в другой день) и удалить.
import { useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, ListItemIcon, Menu, MenuItem, TextField, Typography } from "@mui/material";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import { DeleteOutlined as DeleteOutlineIcon, ReplayRounded as ReplayRoundedIcon } from "../ui/icons";
import { useT } from "../lib/i18n";

interface Props {
  onCopyTo?: (date: string) => void;
  onDelete: () => void;
}

export default function WorkoutActions({ onCopyTo, onDelete }: Props) {
  const t = useT();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [date, setDate] = useState("");

  return (
    <>
      <IconButton
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label={t("Ещё", "More")}
        sx={{ width: 40, height: 40, bgcolor: "action.hover", color: "text.primary", flex: "none" }}
      >
        <MoreHorizRoundedIcon />
      </IconButton>
      <Menu open={anchor != null} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
        {onCopyTo && (
          <MenuItem
            onClick={() => {
              setAnchor(null);
              setRepeatOpen(true);
            }}
          >
            <ListItemIcon>
              <ReplayRoundedIcon fontSize="small" />
            </ListItemIcon>
            {t("Повторить", "Repeat")}
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onDelete();
          }}
        >
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" color="error" />
          </ListItemIcon>
          <Typography color="error">{t("Удалить тренировку", "Delete workout")}</Typography>
        </MenuItem>
      </Menu>

      <Dialog open={repeatOpen} onClose={() => setRepeatOpen(false)} fullWidth>
        <DialogTitle>{t("Повторить тренировку", "Repeat workout")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t("В какой день? Те же упражнения и веса, без отметок о выполнении.", "Which day? Same exercises and weights, nothing ticked.")}
          </Typography>
          <TextField type="date" fullWidth value={date} onChange={(e) => setDate(e.target.value)} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRepeatOpen(false)}>{t("Отмена", "Cancel")}</Button>
          <Button
            variant="contained"
            disabled={!date}
            onClick={() => {
              onCopyTo?.(date);
              setDate("");
              setRepeatOpen(false);
            }}
          >
            {t("Повторить", "Repeat")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
