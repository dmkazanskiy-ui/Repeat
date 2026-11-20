import { Card, IconBadge } from "../../ui";
import { Box, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import BalanceRoundedIcon from "@mui/icons-material/BalanceRounded";
import { SwapHorizRounded as SwapHorizRoundedIcon } from "../../ui/icons";
import { EventBusyRounded as EventBusyRoundedIcon } from "../../ui/icons";
import { ScheduleRounded as ScheduleRoundedIcon } from "../../ui/icons";
import { RepeatRounded as RepeatRoundedIcon } from "../../ui/icons";
import { BarChartRounded as BarChartRoundedIcon } from "../../ui/icons";
import { useT } from "../../lib/i18n";
import type { FocusItem, MuscleFocus } from "../../lib/analytics";
import type { Muscle } from "../../lib/analytics";
import { ink } from "../../lib/themeMode";

/** Внимание — янтарное: это «посмотри сюда», а не «ты всё делаешь плохо». */
const FOCUS_COLOR = ink("#f59e0b");

function ReasonIcon({ reason }: { reason: FocusItem["reason"] }) {
  const sx = { fontSize: 16 };
  if (reason === "imbalance") return <SwapHorizRoundedIcon sx={sx} />;
  if (reason === "gap") return <EventBusyRoundedIcon sx={sx} />;
  if (reason === "stale") return <ScheduleRoundedIcon sx={sx} />;
  if (reason === "rare") return <RepeatRoundedIcon sx={sx} />;
  return <BarChartRoundedIcon sx={sx} />;
}

/**
 * Сводка «чему уделить внимание» над картой мышц. Карта показывает картину,
 * карточка делает вывод: что перекошено, что выпало и что с этим делать.
 * Тап по строке подсвечивает мышцу на карте.
 */
export default function MuscleFocusCard({
  focus,
  onPick,
}: {
  focus: MuscleFocus;
  onPick: (muscle: Muscle | null) => void;
}) {
  const t = useT();
  const theme = useTheme();
  const even = focus.items.length === 0;
  const color = even ? theme.palette.primary.main : FOCUS_COLOR;

  if (!focus.hasData) {
    return (
      <Card sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {t(
            "Занеси хотя бы четыре силовые за месяц — появится разбор баланса.",
            "Log at least four strength sessions in a month to get a balance read.",
          )}
        </Typography>
      </Card>
    );
  }

  return (
    <Card
      sx={{
        mb: 2,
        borderColor: "divider" }}
    >
      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: focus.items.length ? 1.5 : 0.5 }}>
        <IconBadge color={color}>
          <BalanceRoundedIcon fontSize="small" />
        </IconBadge>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {focus.headline}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("За последние 4 недели", "Over the last 4 weeks")}
          </Typography>
        </Box>
      </Stack>

      <Stack spacing={1}>
        {focus.items.map((item) => (
          <Stack
            key={`${item.reason}-${item.muscle ?? item.text}`}
            direction="row"
            spacing={1}
            role="button"
            tabIndex={0}
            onClick={() => onPick(item.muscle)}
            sx={{
              alignItems: "flex-start",
              cursor: item.muscle ? "pointer" : "default",
            }}
          >
            <Box sx={{ color, mt: "2px", display: "flex" }}>
              <ReasonIcon reason={item.reason} />
            </Box>
            {/* Действие отдельной строкой: в одну строку набегает три тире. */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2">{item.text}</Typography>
              <Typography variant="caption" color="text.secondary">
                {item.action}
              </Typography>
            </Box>
          </Stack>
        ))}
      </Stack>

      {focus.okLabel && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: focus.items.length ? 1.5 : 0 }}>
          {focus.okLabel}
        </Typography>
      )}
    </Card>
  );
}
