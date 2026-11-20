import { tr } from "../../ui";
import { Card, IconBadge } from "../../ui";
import { unitLabel } from "../../lib/units";
import { Box, Collapse, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { ExpandMoreRounded } from "../../ui/icons";
import { TrendingFlatRounded } from "../../ui/icons";
import { ArrowForwardRounded } from "../../ui/icons";
import WeightRepsChart from "./WeightRepsChart";
import type { WeightRepsPoint } from "./WeightRepsChart";
import { formatDate, formatWeight } from "../../lib/format";
import { useT } from "../../lib/i18n";
import type { PlateauDetail } from "../../lib/analytics";
import { ink } from "../../lib/themeMode";

/** Плато — янтарное: это «внимание», а не «плохо». */
export const PLATEAU_COLOR = ink("#f59e0b");

/**
 * Блок «Плато» во вкладке «Прогресс»: в свёрнутом виде — список упражнений,
 * которые стоят, в раскрытом — динамика по неделям (видно, что вес не двигается)
 * и что с этим делать. Рекомендации детерминированные, приходят готовыми.
 */
export default function PlateauCard({
  details,
  openId,
  onToggle,
}: {
  details: PlateauDetail[];
  openId: string | null;
  onToggle: (id: string) => void;
}) {
  const t = useT();
  if (details.length === 0) return null;

  return (
    <Box sx={{ mb: 3 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1.5 }}>
        <IconBadge color={PLATEAU_COLOR}>
          <TrendingFlatRounded fontSize="small" />
        </IconBadge>
        <Typography variant="h2" sx={{ flex: 1 }}>
          {t("Плато", "Plateaus")}
        </Typography>
        <Typography variant="caption" sx={{ color: PLATEAU_COLOR, fontWeight: 700 }}>
          {details.length}
        </Typography>
      </Stack>

      <Stack spacing={1.25}>
        {details.map((d) => {
          const open = openId === d.id;
          const points: WeightRepsPoint[] = d.history
            .filter((w) => w.topWeight != null)
            .map((w) => ({
              label: formatDate(w.week),
              weight: w.topWeight as number,
              reps: w.topReps ?? 0,
            }));

          return (
            <Card
              key={d.id}
             
              role="button"
              tabIndex={0}
              onClick={() => onToggle(d.id)}
              sx={{
                cursor: "pointer",
                borderColor: "divider" }}
            >
              <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
                    {d.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {d.reading}
                  </Typography>
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    color: PLATEAU_COLOR,
                    fontWeight: 700,
                    px: 1,
                    py: 0.25,
                    borderRadius: 1,
                    whiteSpace: "nowrap",
                    bgcolor: alpha(PLATEAU_COLOR, 0.14),
                  }}
                >
                  {d.weeks} {t("нед", "wk")}
                </Typography>
                <ExpandMoreRounded
                  fontSize="small"
                  sx={{
                    color: "text.secondary",
                    transition: tr("transform"),
                    transform: open ? "rotate(180deg)" : "none",
                  }}
                />
              </Stack>

              <Collapse in={open} unmountOnExit>
                <Box sx={{ mt: 1.5 }} role="button" tabIndex={0} onClick={(event) => event.stopPropagation()}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                    {t("Динамика по неделям", "Week by week")}
                  </Typography>
                  {points.length > 1 ? (
                    <WeightRepsChart points={points} height={140} />
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {t("Мало данных для графика.", "Not enough data for a chart.")}
                    </Typography>
                  )}

                  {/* Те же недели строками — видно, что вес повторяется. */}
                  <Stack spacing={0.5} sx={{ mt: 1 }}>
                    {d.history.slice(-6).map((w) => (
                      <Stack
                        key={w.week}
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "baseline" }}
                      >
                        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 76 }}>
                          {formatDate(w.week)}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                          {w.topWeight != null
                            ? `${formatWeight(w.topWeight)} ${unitLabel()}${w.topReps != null ? ` × ${w.topReps}` : ""}`
                            : "—"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {w.workingSets} {t("подх.", "sets")}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>

                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5, mb: 0.5 }}>
                    {t("Что сделать", "What to do")}
                  </Typography>
                  <Stack spacing={0.75}>
                    {d.advice.map((a) => (
                      <Stack key={a.cause} direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                        <ArrowForwardRounded sx={{ fontSize: 16, mt: "3px", color: PLATEAU_COLOR }} />
                        <Typography variant="body2">{a.text}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              </Collapse>
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
}
