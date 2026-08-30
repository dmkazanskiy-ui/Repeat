import { Box, Paper, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import BalanceRoundedIcon from "@mui/icons-material/BalanceRounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import EventBusyRoundedIcon from "@mui/icons-material/EventBusyRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import RepeatRoundedIcon from "@mui/icons-material/RepeatRounded";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import { useT } from "../../lib/i18n";
import type { FocusItem, MuscleFocus } from "../../lib/analytics";
import type { Muscle } from "../../lib/analytics";

/** Внимание — янтарное: это «посмотри сюда», а не «ты всё делаешь плохо». */
const FOCUS_COLOR = "#f59e0b";

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
      <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 2, mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {t(
            "Занеси хотя бы четыре силовые за месяц — появится разбор баланса.",
            "Log at least four strength sessions in a month to get a balance read.",
          )}
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.75,
        mb: 2,
        borderRadius: 2,
        borderColor: alpha(color, 0.3),
        backgroundImage: `linear-gradient(100deg, ${alpha(color, 0.1)}, transparent 72%)`,
      }}
    >
      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mb: focus.items.length ? 1.5 : 0.5 }}>
        <Box
          sx={{
            width: 34,
            height: 34,
            borderRadius: 2,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            color,
            backgroundImage: `linear-gradient(135deg, ${alpha(color, 0.28)}, ${alpha(color, 0.08)})`,
          }}
        >
          <BalanceRoundedIcon fontSize="small" />
        </Box>
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
    </Paper>
  );
}
