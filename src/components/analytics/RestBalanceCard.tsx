import { Box, Paper, Stack, Typography } from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { L, useT } from "../../lib/i18n";
import type { RestBalance } from "../../lib/analytics";

/** «N дн. назад» / «сегодня» / «—». */
function daysAgo(n: number | null): string {
  if (n == null) return "—";
  if (n === 0) return L("сегодня", "today");
  return `${n} ${L("дн.", "d")}`;
}

function Counter({ value, label }: { value: string; label: string }) {
  return (
    <Box sx={{ flex: 1, textAlign: "center" }}>
      <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
        {label}
      </Typography>
    </Box>
  );
}

/**
 * Баланс отдыха: тяжёлых дней подряд / полных дней отдыха / последнее
 * восстановление, плюс предупреждение при СОЧЕТАНИИ факторов. Тревожно (оранжево)
 * красим только серьёзное — по правилам нашей палитры, без красного и без
 * медицинских формулировок.
 */
export default function RestBalanceCard({ balance }: { balance: RestBalance }) {
  const t = useT();
  const w = balance.warning;
  const tone =
    w?.severity === "high"
      ? "warning.main"
      : w?.severity === "attention"
        ? "warning.main"
        : "text.secondary";
  const soft = w?.severity === "high" ? "warning.main" : "divider";

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Stack direction="row" spacing={1} sx={{ mb: w ? 1.5 : 0 }}>
        <Counter
          value={`${balance.heavyDaysInRow}`}
          label={`${balance.heavyDaysInRow === 1 ? t("тяжёлый день", "heavy day") : t("тяжёлых дней", "heavy days")} ${t("подряд", "in a row")}`}
        />
        <Counter value={`${balance.fullRestStreak}`} label={t("дней полного отдыха", "full rest days")} />
        <Counter value={daysAgo(balance.daysSinceLastRecovery)} label={t("назад восстановление", "since recovery")} />
      </Stack>

      {w && (
        <Box
          sx={{
            mt: 1,
            p: 1.5,
            borderRadius: 2,
            border: "1px solid",
            borderColor: soft,
            bgcolor: w.severity === "high" ? "rgba(237, 162, 59, 0.08)" : "action.hover",
          }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
            <Box sx={{ color: tone, display: "flex", mt: "1px" }}>
              {w.severity === "info" ? (
                <InfoOutlinedIcon fontSize="small" />
              ) : (
                <WarningAmberIcon fontSize="small" />
              )}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: tone }}>
                {w.title}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {w.message}
              </Typography>
              {w.reasons.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                  {w.reasons.map((r) => `• ${r}`).join("  ")}
                </Typography>
              )}
            </Box>
          </Stack>
        </Box>
      )}
    </Paper>
  );
}
