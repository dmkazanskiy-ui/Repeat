import { Box, Paper, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { ActivityIcon } from "../../lib/icons";
import type { IconKey } from "../../lib/icons";
import { smoothPath } from "../../lib/chart";
import type { Pt } from "../../lib/chart";
import { capacitySummary } from "../../lib/analytics";
import { L, useT } from "../../lib/i18n";
import type { CapacityKey, CapacityProgress } from "../../lib/analytics";

const ICON: Record<CapacityKey, IconKey> = {
  strength: "gym",
  endurance: "timer",
  speed: "run",
};

/** Цвет качества — сила фиолет, выносливость янтарь, скорость розовый. */
const COLOR: Record<CapacityKey, string> = {
  strength: "#a78bfa",
  endurance: "#f59e0b",
  speed: "#f472b6",
};

const ARROW: Record<CapacityProgress["direction"], string> = {
  up: "↑",
  down: "↓",
  flat: "→",
  none: "·",
};

function deltaLabel(c: CapacityProgress): string {
  if (!c.hasData) return L("нет данных", "no data");
  if (c.deltaPercent == null || c.direction === "none") return L("мало данных", "not enough data");
  if (c.direction === "flat") return L("стабильно", "steady");
  const rounded = Math.round(c.deltaPercent);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

/** Крошечный спарклайн без осей: только форма тренда, цвет качества. */
function Spark({
  series,
  invert,
  color,
}: {
  series: (number | null)[];
  invert: boolean;
  color: string;
}) {
  const present = series.filter((v): v is number => v != null);
  if (present.length < 2) {
    return <Box sx={{ height: 28 }} />;
  }
  const min = Math.min(...present);
  const max = Math.max(...present);
  const span = max - min || Math.abs(max) || 1;
  const W = 100;
  const H = 28;
  const pad = 3;
  const pts: Pt[] = present.map((v, i) => {
    const norm = (v - min) / span; // 0..1
    // «Вверх = улучшение»: для темпа (invert) переворачиваем по вертикали.
    const up = invert ? 1 - norm : norm;
    const x = pad + (i * (W - pad * 2)) / (present.length - 1);
    const y = H - pad - up * (H - pad * 2);
    return [x, y];
  });
  return (
    <Box component="svg" viewBox={`0 0 ${W} ${H}`} sx={{ width: "100%", height: 28, display: "block", overflow: "visible" }}>
      <path d={smoothPath(pts)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.6} fill={color} />
    </Box>
  );
}

/**
 * Верхний блок раздела «Прогресс»: что развивается — сила / выносливость /
 * скорость. Резюме сверху, ниже три плитки со стрелкой тренда, дельтой и
 * спарклайном. Один зелёный акцент; снижение не красим тревожно.
 */
export default function CapacitiesCard({ items }: { items: CapacityProgress[] }) {
  const t = useT();
  const summary = capacitySummary(items);

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", mb: 2 }}>
        <AutoAwesomeIcon sx={{ color: "primary.main", fontSize: 20, mt: "1px" }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.4 }}>
          {summary}
        </Typography>
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>
        {items.map((c) => {
          const cColor = COLOR[c.key];
          const active = c.hasData && c.direction !== "none";
          // Значение/стрелка: рост — в цвет качества, иначе нейтрально.
          const valueColor =
            c.direction === "up" ? cColor : active ? "text.primary" : "text.disabled";
          const sparkColor = active ? cColor : "rgba(148,163,179,0.5)";
          return (
            <Box
              key={c.key}
              sx={{
                p: 1.25,
                borderRadius: 2,
                border: "1px solid",
                borderColor: alpha(cColor, 0.25),
                backgroundImage: `linear-gradient(135deg, ${alpha(cColor, 0.1)}, transparent 75%)`,
                display: "flex",
                flexDirection: "column",
                gap: 0.75,
                minWidth: 0,
              }}
            >
              <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
                <Box sx={{ color: cColor, display: "flex" }}>
                  <ActivityIcon icon={ICON[c.key]} fontSize="small" />
                </Box>
                <Typography variant="caption" sx={{ fontWeight: 600 }} noWrap>
                  {c.label}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: "baseline" }}>
                <Typography sx={{ fontSize: 18, fontWeight: 700, color: valueColor, lineHeight: 1 }}>
                  {ARROW[c.direction]}
                </Typography>
                <Typography variant="caption" sx={{ color: valueColor, fontWeight: 700 }}>
                  {deltaLabel(c)}
                </Typography>
              </Stack>
              <Spark series={c.series} invert={c.key === "speed"} color={sparkColor} />
              {c.hasData && c.confidence === "preliminary" && (
                <Typography variant="caption" sx={{ color: "text.disabled", fontSize: 10 }}>
                  {t("предварительно", "preliminary")}
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}
