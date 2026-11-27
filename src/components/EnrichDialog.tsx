// «COROS прислал подробности»: обогащение уже записанных тренировок одной
// пачкой и по подтверждению. Новых тренировок этот путь не создаёт: если
// тренировку с таким ID не нашли — так и пишем.
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { useT } from "../lib/i18n";
import { findBySource, type EnrichPayload } from "../lib/activityDetail";
import type { InboxItem, Session } from "../lib/types";

interface Props {
  items: InboxItem[];
  sessions: Session[];
  onApply: () => void;
  onDecline: () => void;
}

export default function EnrichDialog({ items, sessions, onApply, onDecline }: Props) {
  const t = useT();
  const payloads = items.map((i) => i.payload as EnrichPayload);
  const found = payloads.filter((p) => findBySource(sessions, p.source, p.externalActivityId));
  const missing = payloads.length - found.length;
  const streams = found.filter((p) => p.level === "streams").length;
  const source = (payloads[0]?.source ?? "").toUpperCase();
  return (
    <Dialog open onClose={onDecline} fullWidth>
      <DialogTitle>{t(`${source}: подробности тренировок`, `${source}: workout details`)}</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          {t(
            `Обновится тренировок: ${found.length}${streams ? `, из них с графиками и маршрутом — ${streams}` : ""}. Время, дистанция, пульс и статистика часов станут точными; название, заметки и фото останутся твоими.`,
            `Workouts to update: ${found.length}${streams ? `, ${streams} with charts and route` : ""}. Time, distance, HR and watch stats become exact; title, notes and photos stay yours.`,
          )}
        </Typography>
        {missing > 0 && (
          <Alert severity="info" sx={{ mt: 1.5 }}>
            {t(`Не нашёл в Repeat: ${missing}. Новые тренировки так не создаются — сначала их нужно импортировать.`, `Not found in Repeat: ${missing}. This doesn't create new workouts.`)}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onDecline}>
          {t("Не сейчас", "Not now")}
        </Button>
        <Button variant="contained" disabled={!found.length} onClick={onApply}>
          {t("Обновить", "Update")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
