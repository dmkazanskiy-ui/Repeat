import { Box, Paper, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import TrendingFlatRoundedIcon from "@mui/icons-material/TrendingFlatRounded";
import { ActivityIcon } from "../../lib/icons";
import { FOCUS_GOALS } from "../../lib/workoutBuilder";
import { useT } from "../../lib/i18n";
import type { FocusGoal } from "../../lib/workoutBuilder";
import type { Dir, GoalVerdict, LensTone } from "../../lib/analytics";

const TONE_COLOR: Record<LensTone, string> = {
  great: "#4ade80",
  on_track: "#38bdf8",
  attention: "#f59e0b",
};

function DirIcon({ dir, color }: { dir: Dir; color: string }) {
  const sx = { fontSize: 14, color };
  if (dir === "up") return <TrendingUpRoundedIcon sx={sx} />;
  if (dir === "down") return <TrendingDownRoundedIcon sx={{ ...sx, color: "text.disabled" }} />;
  if (dir === "flat") return <TrendingFlatRoundedIcon sx={{ ...sx, color: "text.secondary" }} />;
  return null;
}

/**
 * Линза цели «как идёшь к своей цели»: селектор цели сверху, ниже вердикт под
 * выбранную цель (заголовок в тон, объяснение, метрики со стрелками). Тон и
 * набор метрик считает `goalVerdict`. Каркас будущего AI-резюме.
 */
export default function GoalLensCard({
  goal,
  verdict,
  onChangeGoal,
}: {
  goal: FocusGoal;
  verdict: GoalVerdict;
  onChangeGoal: (g: FocusGoal) => void;
}) {
  const t = useT();
  const meta = FOCUS_GOALS.find((g) => g.goal === goal) ?? FOCUS_GOALS[0];
  const color = meta.color;
  const toneColor = TONE_COLOR[verdict.tone];

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
      {/* Селектор цели */}
      <Box sx={{ display: "flex", gap: 0.75, overflowX: "auto", pb: 1, mx: -0.5, px: 0.5 }}>
        {FOCUS_GOALS.map((g) => {
          const active = g.goal === goal;
          return (
            <Box
              key={g.goal}
              component="button"
              onClick={() => onChangeGoal(g.goal)}
              sx={{
                flexShrink: 0,
                px: 1.25,
                py: 0.5,
                borderRadius: 999,
                border: "1px solid",
                borderColor: active ? alpha(g.color, 0.6) : "divider",
                bgcolor: active ? alpha(g.color, 0.14) : "transparent",
                color: active ? g.color : "text.secondary",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {g.label}
            </Box>
          );
        })}
      </Box>

      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mt: 1 }}>
        <Box
          sx={{
            width: 46,
            height: 46,
            borderRadius: 2,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            color,
            backgroundImage: `linear-gradient(135deg, ${alpha(color, 0.28)}, ${alpha(color, 0.08)})`,
          }}
        >
          <ActivityIcon icon={meta.icon} fontSize="medium" />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {t("Как идёшь к цели", "Progress toward")} «{meta.label.toLowerCase()}»
          </Typography>
          <Typography sx={{ fontSize: 18, fontWeight: 800, lineHeight: 1.15, color: toneColor }}>
            {verdict.headline}
          </Typography>
        </Box>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {verdict.reason}
      </Typography>

      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
        {verdict.metrics.map((m) => (
          <Box
            key={m.label}
            sx={{ flex: 1, minWidth: 0, p: 1.25, borderRadius: 2, bgcolor: "action.hover" }}
          >
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
              {m.label}
            </Typography>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              <Typography sx={{ fontSize: 16, fontWeight: 700 }} noWrap>
                {m.value}
              </Typography>
              <DirIcon dir={m.dir} color={toneColor} />
            </Stack>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}
