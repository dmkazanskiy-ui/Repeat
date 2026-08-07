import { Box, Paper, Stack, Typography, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { ActivityIcon } from "../lib/icons";
import type { IconKey } from "../lib/icons";
import { useT } from "../lib/i18n";
import type { SessionKind } from "../lib/types";
import type { DaySummary } from "../lib/analytics";

/**
 * Цветовая идентичность дня (по составу): серый — не было тренировок, фиолет —
 * силовая, красный — кардио, бирюза — мобилити, зелёный — восстановление. На
 * смешанном дне кольцо и свечение собираются из этих цветов (градиент).
 * Это отдельная от таймлайновой TYPE_COLOR палитра — здесь «тип дня», не сессии.
 */
const DAY_COLOR: Record<SessionKind, string> = {
  strength: "#a78bfa",
  cardio: "#f87171",
  mobility: "#2dd4bf",
  recovery: "#4ade80",
};
const GRAY = "#94a3b8";

const KIND_ICON: Record<SessionKind, IconKey> = {
  strength: "gym",
  cardio: "run",
  mobility: "yoga",
  recovery: "spa",
};

/** Сегментированное кольцо: доли по числу сессий каждого типа в цвете типа. */
function CompositionRing({
  segments,
  centerIcon,
  centerColor,
  size = 96,
}: {
  segments: { color: string; fraction: number }[];
  centerIcon: IconKey;
  centerColor: string;
  size?: number;
}) {
  const theme = useTheme();
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = segments.length > 1 ? 0.02 : 0; // зазор между сегментами
  let cum = 0;
  return (
    <Box sx={{ position: "relative", width: size, height: size, flex: "0 0 auto" }}>
      <Box component="svg" viewBox={`0 0 ${size} ${size}`} sx={{ width: size, height: size }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={theme.palette.divider} strokeWidth={stroke} opacity={0.5} />
        {segments.map((seg, i) => {
          const frac = Math.max(0, seg.fraction - gap);
          const dash = frac * c;
          const offset = -cum * c;
          cum += seg.fraction;
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
        })}
      </Box>
      <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: centerColor }}>
        <Box sx={{ display: "grid", placeItems: "center", "& svg": { fontSize: 30 } }}>
          <ActivityIcon icon={centerIcon} fontSize="large" />
        </Box>
      </Box>
    </Box>
  );
}

function Tile({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <Box
      sx={{
        px: 1.5,
        py: 1,
        borderRadius: 2,
        border: "1px solid",
        borderColor: alpha(color, 0.22),
        backgroundImage: `linear-gradient(135deg, ${alpha(color, 0.12)}, transparent 78%)`,
        minWidth: 0,
        flex: "1 1 auto",
      }}
    >
      <Typography sx={{ fontWeight: 800, fontSize: 18, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }} noWrap>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
        {label}
      </Typography>
    </Box>
  );
}

/**
 * Карточка «Итог дня» под календарём (стартовый экран). Стиль — как hero-карточки
 * аналитики: моно-заголовок, крупная строка-итог, плитки метрик, свечение снизу
 * в цвет дня. Ниже неё в календаре идёт таймлайн сессий.
 */
export default function DaySummaryCard({
  summary,
  emptyLabel,
}: {
  summary: DaySummary;
  emptyLabel?: string;
}) {
  const t = useT();
  const empty = summary.items.length === 0;

  const total = summary.items.reduce((n, i) => n + i.count, 0);
  const segments = empty
    ? [{ color: GRAY, fraction: 1 }]
    : summary.items.map((i) => ({ color: DAY_COLOR[i.kind], fraction: i.count / total }));

  // Доминирующий тип: больше всего сессий (при равенстве — первый по порядку).
  const dominant = empty
    ? null
    : summary.items.reduce((a, b) => (b.count > a.count ? b : a)).kind;
  const accent = dominant ? DAY_COLOR[dominant] : GRAY;
  const centerIcon: IconKey = dominant ? KIND_ICON[dominant] : "gym";

  // Свечение снизу: один цвет — радиальное; смешанный день — линейный из цветов.
  const glow =
    empty || summary.items.length === 1
      ? `radial-gradient(120% 90% at 50% 130%, ${alpha(accent, empty ? 0.1 : 0.22)}, transparent 70%)`
      : `linear-gradient(115deg, ${summary.items.map((i) => alpha(DAY_COLOR[i.kind], 0.18)).join(", ")})`;

  const tiles: { value: string; label: string }[] = [];
  if (summary.tonnage > 0) tiles.push({ value: `${summary.tonnage.toLocaleString(t("ru-RU", "en-US"))} ${t("кг", "kg")}`, label: t("Тоннаж", "Tonnage") });
  if (summary.sets > 0) tiles.push({ value: `${summary.sets}`, label: t("Подходы", "Sets") });
  if (summary.durationSec >= 60) tiles.push({ value: `${Math.round(summary.durationSec / 60)} ${t("мин", "min")}`, label: t("Время", "Time") });
  if (summary.distanceM > 0) tiles.push({ value: `${(Math.round(summary.distanceM / 100) / 10).toLocaleString(t("ru-RU", "en-US"))} ${t("км", "km")}`, label: t("Дистанция", "Distance") });

  return (
    <Paper
      variant="outlined"
      sx={{
        position: "relative",
        overflow: "hidden",
        p: 2,
        mb: 2,
        borderRadius: 2,
        borderLeft: `3px solid ${accent}`,
      }}
    >
      {/* свечение в цвет дня */}
      <Box sx={{ position: "absolute", inset: 0, backgroundImage: glow, pointerEvents: "none" }} />

      <Box sx={{ position: "relative" }}>
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: alpha(accent, 0.95) }}
        >
          {t("Итог дня", "Day summary")}
        </Typography>

        <Stack direction="row" spacing={2} sx={{ alignItems: "center", mt: 1 }}>
          <CompositionRing segments={segments} centerIcon={centerIcon} centerColor={accent} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 20, lineHeight: 1.2, color: empty ? "text.secondary" : accent }}>
              {empty ? (emptyLabel ?? t("Не было тренировок", "No workouts")) : summary.headline}
            </Typography>
            {tiles.length > 0 && (
              <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap", gap: 1 }}>
                {tiles.map((tl) => (
                  <Tile key={tl.label} value={tl.value} label={tl.label} color={accent} />
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </Box>
    </Paper>
  );
}
