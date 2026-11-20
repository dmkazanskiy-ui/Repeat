import { Card } from "../../ui";
import { massToUnit, unitLabel } from "../../lib/units";
import { useMemo, useState } from "react";
import { Box, Chip, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { addDays, formatDate, today } from "../../lib/format";
import { exercisePlateau, metricSeries } from "../../lib/analytics";
// Ломаная, а не сплайн: сглаживание рисует горб выше реальных значений на изломе.
const linePath = (pts: Array<[number, number]>) => pts.map(([px, py], i) => `${i ? "L" : "M"} ${px} ${py}`).join(" ");
import { L, useT } from "../../lib/i18n";
import type { ExerciseInsight } from "../../lib/analytics";
import type { Pt } from "../../lib/chart";
import type { Session } from "../../lib/types";
import { PLATEAU_COLOR } from "./PlateauCard";

const RANGES: Array<{ key: string; label: string; days: number | null }> = [
  { key: "3m", get label() { return L("3 мес", "3 mo"); }, days: 90 },
  { key: "6m", get label() { return L("6 мес", "6 mo"); }, days: 180 },
  { key: "1y", get label() { return L("Год", "Year"); }, days: 365 },
  { key: "all", get label() { return L("Всё", "All"); }, days: null },
];

/**
 * Главный график раздела «Прогресс»: прогноз максимума (e1RM) по выбранному
 * упражнению и полоса текущего плато. Прямой ответ на исходную боль —
 * «насколько вырос и сколько уже стою». Линия — зелёный акцент с заливкой,
 * плато — янтарь.
 */
export default function StrengthHero({
  exercises,
  sessions,
  initialId,
}: {
  exercises: ExerciseInsight[];
  sessions: Session[];
  /** С какого упражнения открыть — обычно с того, что стоит на плато. */
  initialId?: string | null;
}) {
  const t = useT();
  const theme = useTheme();
  const [picked, setPicked] = useState<string | null>(null);
  const [range, setRange] = useState("3m");

  // Упражнения с хотя бы двумя точками e1RM — иначе линию не построить.
  // Стартовое упражнение (плато) — первым в ленте, чтобы выбранный чип был на виду.
  const options = useMemo(() => {
    const list = exercises.filter((e) => metricSeries(e.points, "e1rm").length >= 2);
    const i = list.findIndex((e) => e.id === initialId);
    return i > 0 ? [list[i], ...list.slice(0, i), ...list.slice(i + 1)] : list;
  }, [exercises, initialId]);
  const ex =
    options.find((e) => e.id === picked) ??
    options.find((e) => e.id === initialId) ??
    options[0];
  if (!ex) return null;

  const days = RANGES.find((r) => r.key === range)?.days ?? null;
  const cutoff = days ? addDays(today(), -days) : "0000-00-00";
  const series = metricSeries(ex.points, "e1rm")
    .filter((p) => p.date >= cutoff)
    .map((p) => ({ ...p, v: massToUnit(p.v) }));
  const plateau = exercisePlateau(sessions, ex.id);

  const first = series[0]?.v ?? null;
  const last = series[series.length - 1]?.v ?? null;
  const delta = first != null && last != null ? last - first : null;
  const kg = unitLabel();

  // Геометрия
  const W = 340;
  const H = 200;
  const padL = 4;
  const padR = 40; // место под подписи оси справа
  const padT = 12;
  const padB = 24;
  const values = series.map((p) => p.v);
  const vMin = Math.min(...values);
  const vMax = Math.max(...values);
  const span = vMax - vMin || Math.max(1, vMax * 0.1);
  const lo = vMin - span * 0.2;
  const hi = vMax + span * 0.2;
  const t0 = series.length ? Date.parse(series[0].date) : 0;
  const t1 = series.length ? Date.parse(series[series.length - 1].date) : 1;
  const x = (date: string) =>
    t1 === t0 ? (padL + W - padR) / 2 : padL + ((Date.parse(date) - t0) / (t1 - t0)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const pts: Pt[] = series.map((p) => [x(p.date), y(p.v)]);

  // Полоса плато: последние N недель без прироста (по недельным пикам).
  // Рисуем, только если линия в этом окне и правда стоит (разброс ≤ 2.5%),
  // иначе медленный, но ровный рост выглядел бы «плато» поверх растущей линии.
  const rawFrom =
    plateau.currentWeeks >= 2 ? addDays(series[series.length - 1]?.date ?? today(), -plateau.currentWeeks * 7) : null;
  const inBand = rawFrom ? series.filter((p) => p.date >= rawFrom).map((p) => p.v) : [];
  const flatInBand =
    inBand.length >= 2 && Math.max(...inBand) - Math.min(...inBand) <= Math.max(...inBand) * 0.025;
  const plateauFrom = flatInBand ? rawFrom : null;
  const bandX = plateauFrom ? Math.max(padL, x(plateauFrom < series[0]?.date ? series[0].date : plateauFrom)) : null;

  const ticks = [lo + (hi - lo) * 0.25, lo + (hi - lo) * 0.5, lo + (hi - lo) * 0.75];
  const accent = theme.palette.primary.main;
  const muted = theme.palette.text.disabled;
  const grid = theme.palette.divider;

  return (
    <Card sx={{ mb: 2 }}>
      <Box sx={{ display: "flex", gap: 1, overflowX: "auto", mb: 1.5, pb: 0.5 }}>
        {options.map((o) => (
          <Chip
            key={o.id}
            label={o.name}
            size="small"
            color={o.id === ex.id ? "primary" : "default"}
            variant={o.id === ex.id ? "filled" : "outlined"}
            onClick={() => setPicked(o.id)}
            sx={{ height: 32, borderRadius: 999, flexShrink: 0 }}
          />
        ))}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {t("Прогноз максимума", "Estimated max")}
      </Typography>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline", flexWrap: "wrap" }}>
        <Typography sx={{ fontVariantNumeric: "tabular-nums", fontSize: 30, fontWeight: 800, lineHeight: 1.15 }}>
          {last != null ? `${Math.round(last)} ${kg}` : "—"}
        </Typography>
        {delta != null && series.length >= 2 && (
          <Typography
            variant="body2"
            sx={{ fontVariantNumeric: "tabular-nums", color: delta > 0.5 ? "success.main" : "text.secondary" }}
          >
            {delta > 0.5 ? "+" : delta < -0.5 ? "−" : "±"}
            {Math.abs(Math.round(delta))} {kg} {t("с", "since")} {formatDate(series[0].date)}
          </Typography>
        )}
      </Stack>
      {plateauFrom && (
        <Typography variant="caption" sx={{ display: "block", mt: 0.25, color: PLATEAU_COLOR }}>
          {t("Плато", "Plateau")} {plateau.currentWeeks} {t("нед — без прироста", "wk — no gain")}
        </Typography>
      )}

      {series.length >= 2 ? (
        <Box component="svg" viewBox={`0 0 ${W} ${H}`} sx={{ width: "100%", display: "block", mt: 2 }}>
          {ticks.map((v, i) => (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={grid} strokeWidth={1} />
              <text x={W - padR + 6} y={y(v) + 3.5} fontSize={10} fill={muted}>
                {Math.round(v)}
              </text>
            </g>
          ))}
          {bandX != null && (
            <g>
              <rect
                x={bandX}
                y={padT}
                width={Math.max(2, W - padR - bandX)}
                height={H - padT - padB}
                fill={PLATEAU_COLOR}
                opacity={0.1}
              />
              <line x1={bandX} x2={bandX} y1={padT} y2={H - padB} stroke={PLATEAU_COLOR} strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
            </g>
          )}
          <defs>
            <linearGradient id="strength-hero-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity={0.28} />
              <stop offset="100%" stopColor={accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          {pts.length >= 2 && (
            <path
              d={`${linePath(pts)} L ${pts[pts.length - 1][0]} ${H - padB} L ${pts[0][0]} ${H - padB} Z`}
              fill="url(#strength-hero-area)"
            />
          )}
          <path
            d={linePath(pts)}
            fill="none"
            stroke={accent}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {pts.map(([px, py], i) => (
            <circle key={i} cx={px} cy={py} r={i === pts.length - 1 ? 4 : 2} fill={i === pts.length - 1 ? accent : theme.palette.background.paper} stroke={accent} strokeWidth={1.5} />
          ))}
          <text x={padL} y={H - 6} fontSize={10} fill={muted}>
            {formatDate(series[0].date)}
          </text>
          <text x={W - padR} y={H - 6} fontSize={10} fill={muted} textAnchor="end">
            {formatDate(series[series.length - 1].date)}
          </text>
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
          {t("В этом диапазоне мало тренировок.", "Not enough workouts in this range.")}
        </Typography>
      )}

      <ToggleButtonGroup
        value={range}
        exclusive
        size="small"
        fullWidth
        onChange={(_, v) => v && setRange(v)}
        sx={{ mt: 1.5 }}
      >
        {RANGES.map((r) => (
          <ToggleButton key={r.key} value={r.key} sx={{ fontSize: 12, py: 0.5, minHeight: 36 }}>
            {r.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Card>
  );
}
