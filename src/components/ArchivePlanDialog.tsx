// Просьба ИИ убрать план в архив (MCP archive_plan) — приходит во «входящие»
// и выполняется только по подтверждению. План уходит в архив вместе со своей
// программой; тренировки и история статусов остаются.
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { useT } from "../lib/i18n";
import { formatDate } from "../lib/format";
import type { InboxItem, Plan, PlannedSession, TrainingProgram } from "../lib/types";

interface Props {
  item: InboxItem;
  plans: Plan[];
  programs: TrainingProgram[];
  plannedSessions: PlannedSession[];
  onArchive: (planId: string) => void;
  onClose: () => void;
}

export default function ArchivePlanDialog({ item, plans, programs, plannedSessions, onArchive, onClose }: Props) {
  const t = useT();
  const planId = (item.payload as { planId?: string } | null)?.planId;
  const plan = plans.find((p) => p.id === planId);
  const program = plan?.programId ? programs.find((p) => p.id === plan.programId && !p.archivedAt) : undefined;
  const cards = plan ? plannedSessions.filter((c) => c.planId === plan.id).length : 0;
  return (
    <Dialog open onClose={onClose} fullWidth>
      <DialogTitle>{t(`${item.source ?? "ИИ"} просит убрать план в архив`, `${item.source ?? "AI"} asks to archive a plan`)}</DialogTitle>
      <DialogContent>
        {item.note && (
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            {item.note}
          </Typography>
        )}
        {!plan || plan.archivedAt ? (
          <Alert severity="info">{t("Этого плана уже нет среди активных — делать ничего не нужно.", "This plan is no longer active — nothing to do.")}</Alert>
        ) : (
          <Typography variant="body2">
            {t(
              `«${plan.name}» · ${formatDate(plan.start)} – ${formatDate(plan.end)} · карточек: ${cards}.${program ? ` Программа «${program.name}» тоже уйдёт в архив.` : ""} Тренировки и их история останутся.`,
              `"${plan.name}" · ${formatDate(plan.start)} – ${formatDate(plan.end)} · cards: ${cards}.${program ? ` Program "${program.name}" is archived too.` : ""} Workouts and history stay.`,
            )}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          {plan && !plan.archivedAt ? t("Отклонить", "Decline") : t("Закрыть", "Close")}
        </Button>
        {plan && !plan.archivedAt && (
          <Button
            variant="contained"
            onClick={() => {
              onArchive(plan.id);
              onClose();
            }}
          >
            {t("Убрать в архив", "Archive")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
