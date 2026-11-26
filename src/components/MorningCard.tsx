// «Утро» на экране сегодняшнего дня: сон, HRV и пульс покоя к своей норме —
// данные с часов (Garmin), которые сервер забирает каждое утро. Та же сетка,
// что у «Итога дня»: подпись, главное, три равные колонки. При перегрузе —
// предложение заменить силовую дорожкой.
import { Box, Button, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { radius } from "../ui";
import { CARD_IN } from "../theme";
import { ink } from "../lib/themeMode";
import { useT } from "../lib/i18n";
import type { BodySignals } from "../lib/bodySignals";
import type { PlannedSession } from "../lib/types";

const OK = ink("#4ade80");
const WARN = ink("#f59e0b");
const NUM = { fontVariantNumeric: "tabular-nums" } as const;

interface Props {
  body: BodySignals;
  sleepScore?: number | null;
  device?: string | null;
  strengthCard?: PlannedSession;
  onSwap?: (card: PlannedSession) => void;
  onKeep?: () => void;
  swapHidden?: boolean;
}

export default function MorningCard({ body, sleepScore, device, strengthCard, onSwap, onKeep, swapHidden }: Props) {
  const t = useT();
  const theme = useTheme();
  const color = body.overreach ? WARN : OK;
  const pct = body.hrv != null && body.hrvBase ? Math.round((body.hrv / body.hrvBase - 1) * 100) : null;
  const drhr = body.rhr != null && body.rhrBase ? Math.round(body.rhr - body.rhrBase) : null;
  const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);
  const stats: { label: string; value: string; unit: string; note: string }[] = [
    {
      label: t("Сон", "Sleep"),
      value: body.sleepMin != null ? `${Math.floor(body.sleepMin / 60)}:${String(body.sleepMin % 60).padStart(2, "0")}` : "—",
      unit: body.sleepMin != null ? t("ч", "h") : "",
      note: sleepScore != null ? t(`оценка ${sleepScore}`, `score ${sleepScore}`) : "",
    },
    {
      label: "HRV",
      value: body.hrv != null ? String(body.hrv) : "—",
      unit: body.hrv != null ? t("мс", "ms") : "",
      note: pct != null ? t(`${sign(pct)}% к норме`, `${sign(pct)}% vs normal`) : "",
    },
    {
      label: t("Пульс покоя", "Resting HR"),
      value: body.rhr != null ? String(body.rhr) : "—",
      unit: body.rhr != null ? t("уд", "bpm") : "",
      note: drhr != null ? t(`${sign(drhr)} к норме`, `${sign(drhr)} vs normal`) : "",
    },
  ];
  const showSwap = body.overreach && strengthCard && !swapHidden && onSwap;

  return (
    <Box
      sx={{
        mb: 1.5,
        p: 2,
        borderRadius: radius.card,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        backgroundImage: `radial-gradient(120% 120% at 0% 0%, ${alpha(color, theme.palette.mode === "light" ? 0.12 : 0.2)}, transparent 60%)`,
        animation: CARD_IN,
      }}
    >
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", lineHeight: "16px" }}>
        {t("Утро", "Morning")}
        {device ? ` · ${device}` : ""}
      </Typography>
      <Typography sx={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2, mt: 0.5, display: "flex", alignItems: "center", gap: 1 }}>
        <Box component="span" sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: color, flex: "none" }} />
        {body.overreach ? t("День полегче", "Take it easier") : t("Восстановление в норме", "Recovered")}
      </Typography>
      <Box sx={{ height: "1px", bgcolor: alpha(theme.palette.text.primary, 0.1), my: 1.5 }} />
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", columnGap: 1.5 }}>
        {stats.map((s) => (
          <Box key={s.label} sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.secondary", lineHeight: "16px", mb: 0.5 }} noWrap>
              {s.label}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "baseline", gap: "3px", lineHeight: 1 }}>
              <Box component="span" sx={{ fontSize: 17, fontWeight: 800, ...NUM }}>
                {s.value}
              </Box>
              {s.unit && (
                <Box component="span" sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary" }}>
                  {s.unit}
                </Box>
              )}
            </Box>
            <Typography sx={{ fontSize: 12, color: "text.secondary", lineHeight: "16px", mt: 0.5, minHeight: 16, ...NUM }} noWrap>
              {s.note}
            </Typography>
          </Box>
        ))}
      </Box>
      {body.overreach && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25 }}>
          {[
            body.lowHrvDays >= 2 ? t(`HRV ниже нормы ${body.lowHrvDays} дн. подряд`, `HRV below normal ${body.lowHrvDays} days in a row`) : "",
            body.rhrHigh ? t("пульс покоя выше нормы", "resting HR above normal") : "",
          ]
            .filter(Boolean)
            .join(" · ")}
          {strengthCard ? t(`. По правилу плана «${strengthCard.title}» лучше заменить дорожкой.`, `. Per plan rule, swap "${strengthCard.title}" for the treadmill.`) : "."}
        </Typography>
      )}
      {showSwap && (
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
          <Button size="small" variant="contained" onClick={() => onSwap?.(strengthCard!)}>
            {t("Заменить на дорожку", "Swap to treadmill")}
          </Button>
          <Button size="small" color="inherit" sx={{ color: "text.secondary" }} onClick={onKeep}>
            {t("Оставить зал", "Keep gym")}
          </Button>
        </Stack>
      )}
    </Box>
  );
}
