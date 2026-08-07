import { useState, type ReactNode } from "react";
import { Box, Collapse, Divider, Paper, Stack, Typography, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import MonitorHeartOutlinedIcon from "@mui/icons-material/MonitorHeartOutlined";
import FitnessCenterOutlinedIcon from "@mui/icons-material/FitnessCenterOutlined";
import EmojiEventsOutlinedIcon from "@mui/icons-material/EmojiEventsOutlined";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import SelfImprovementRoundedIcon from "@mui/icons-material/SelfImprovementRounded";
import SpaOutlinedIcon from "@mui/icons-material/SpaOutlined";
import { smoothPath } from "../../lib/chart";
import { useT } from "../../lib/i18n";
import type { Pt } from "../../lib/chart";

interface Insight {
  value: string;
  /** Мелкий префикс перед крупным значением (например «e1RM»). */
  prefix?: string;
  /** Мелкий суффикс после крупного значения (например «новых»). */
  suffix?: string;
  sub: string;
  spark: number[];
  color: string;
}

export interface HeroData {
  title: string;
  changeLabel: string;
  changePercent: number | null;
  workoutsText: string;
  daysText: string;
  volumeText: string;
  dailyVolume: number[];
  /** По каждому дню графика: было восстановление, но не было тренировки. */
  recoveryDays: boolean[];
  cardio: Insight;
  best: Insight;
  records: Insight;
  progress: Insight;
  mobility: Insight;
  recovery: Insight;
}

const RECOVERY_COLOR = "#38bdf8";

/**
 * Вертикальные бары дневного объёма — «эквалайзер» справа, но по реальным
 * данным. День с восстановлением и без тренировки — голубым фиксированным баром
 * (тоннажа нет, но день не пустой), как в heatmap «Активность».
 */
function HeroBars({ values, recoveryDays }: { values: number[]; recoveryDays: boolean[] }) {
  const theme = useTheme();
  const green = theme.palette.primary.main;
  const present = values.length ? values : [0];
  const max = Math.max(1, ...present);
  return (
    <Box sx={{ display: "flex", alignItems: "flex-end", gap: "3px", height: 104, width: "100%" }}>
      {present.map((v, i) => {
        const recovery = recoveryDays[i] && v <= 0;
        const color = recovery ? RECOVERY_COLOR : green;
        // У восстановления тоннажа нет — рисуем невысокий, но заметный бар.
        const heightPct = recovery ? 22 : Math.max(5, (v / max) * 100);
        return (
          <Box
            key={i}
            sx={{
              flex: 1,
              height: `${heightPct}%`,
              borderRadius: "3px 3px 0 0",
              background: `linear-gradient(to top, ${alpha(color, 0.25)}, ${color})`,
            }}
          />
        );
      })}
    </Box>
  );
}

/** Тонкий монолинейный спарклайн заданного цвета — для инсайт-карточек. */
function MiniSpark({ values, color }: { values: number[]; color: string }) {
  const present = values.length >= 2 ? values : [...values, ...values, 0].slice(0, 2);
  const min = Math.min(...present);
  const max = Math.max(...present);
  const span = max - min || Math.abs(max) || 1;
  const n = present.length;
  const pts: Pt[] = present.map((v, i) => [
    (i / Math.max(1, n - 1)) * 100,
    22 - ((v - min) / span) * 18,
  ]);
  return (
    <Box
      component="svg"
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      sx={{ width: "100%", height: 40, display: "block" }}
    >
      <path
        d={smoothPath(pts)}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </Box>
  );
}

/**
 * Инсайт-карточка в языке карточек тренировок: плашка-иконка с градиентом в
 * цвет показателя, тонкая акцент-линия слева, лёгкая подложка-оттенок; график
 * растянут на ~1/3 ширины справа.
 */
function InsightCard({ icon, label, insight }: { icon: ReactNode; label: string; insight: Insight }) {
  const { color } = insight;
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        p: 1.5,
        borderRadius: 2,
        border: "1px solid",
        borderColor: alpha(color, 0.25),
        borderLeft: `3px solid ${color}`,
        backgroundImage: `linear-gradient(100deg, ${alpha(color, 0.1)}, transparent 72%)`,
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          width: 42,
          height: 42,
          borderRadius: 2,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          color,
          backgroundImage: `linear-gradient(135deg, ${alpha(color, 0.28)}, ${alpha(color, 0.08)})`,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
          {label}
        </Typography>
        <Typography sx={{ fontSize: 20, fontWeight: 700, lineHeight: 1.15 }} noWrap>
          {insight.prefix && (
            <Box
              component="span"
              sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", mr: 0.5 }}
            >
              {insight.prefix}
            </Box>
          )}
          {insight.value}
          {insight.suffix && (
            <Box
              component="span"
              sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", ml: 0.5 }}
            >
              {insight.suffix}
            </Box>
          )}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
          {insight.sub}
        </Typography>
      </Box>
      <Box sx={{ flex: "0 0 32%", minWidth: 0 }}>
        <MiniSpark values={insight.spark} color={color} />
      </Box>
    </Box>
  );
}

/**
 * Карточка-фокус «Итоги»: крупные числа периода слева, реальный бар-график
 * объёма справа, дивайдер между тренировками и тоннажем, сетка инсайтов 2×2.
 * Моно-иконки, спокойный тёмный фон (Apple HIG); цвет — только у графиков и %.
 */
export default function SummaryHero({ hero }: { hero: HeroData }) {
  const t = useT();
  const up = (hero.changePercent ?? 0) >= 0;
  const iconSx = { fontSize: 18 };
  // Показатели прячем под дропдаун и раскрываем в одну колонку: на узких
  // экранах (iPhone) сетка 2×2 резала контент, а карточки во всю ширину — нет.
  const [showMetrics, setShowMetrics] = useState(false);

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
      <Stack direction="row" sx={{ alignItems: "flex-start", mb: 1.5 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flex: 1, color: "primary.main" }}>
          <AutoAwesomeIcon sx={{ fontSize: 18 }} />
          <Typography variant="subtitle2">{hero.title}</Typography>
        </Stack>
        {hero.changePercent != null && (
          <Box sx={{ textAlign: "right" }}>
            <Stack
              direction="row"
              spacing={0.25}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                px: 1,
                py: 0.25,
                borderRadius: 999,
                bgcolor: up ? "rgba(74,222,128,0.12)" : "action.hover",
                color: up ? "primary.main" : "text.secondary",
              }}
            >
              {up ? (
                <TrendingUpRoundedIcon sx={{ fontSize: 16 }} />
              ) : (
                <TrendingDownRoundedIcon sx={{ fontSize: 16 }} />
              )}
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                {up ? "+" : ""}
                {Math.round(hero.changePercent)}%
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
              {hero.changeLabel}
            </Typography>
          </Box>
        )}
      </Stack>

      <Stack direction="row" spacing={2} sx={{ alignItems: "stretch", mb: 2 }}>
        <Box sx={{ flex: 1.4, minWidth: 0 }}>
          <Typography sx={{ fontSize: 27, fontWeight: 800, lineHeight: 1.05, whiteSpace: "nowrap" }}>
            {hero.workoutsText}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {hero.daysText}
          </Typography>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {t("Общий тоннаж", "Total tonnage")}
          </Typography>
          <Typography sx={{ fontSize: 23, fontWeight: 800, lineHeight: 1.1 }}>
            {hero.volumeText}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}>
          <HeroBars values={hero.dailyVolume} recoveryDays={hero.recoveryDays} />
        </Box>
      </Stack>

      <Box
        component="button"
        onClick={() => setShowMetrics((v) => !v)}
        aria-expanded={showMetrics}
        sx={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 1.5,
          py: 1,
          borderRadius: 2,
          bgcolor: "action.hover",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          color: "text.primary",
        }}
      >
        <Typography variant="subtitle2">{t("Показатели за период", "Metrics for the period")}</Typography>
        <ExpandMoreRoundedIcon
          sx={{
            color: "text.secondary",
            transition: "transform 0.2s",
            transform: showMetrics ? "rotate(180deg)" : "none",
          }}
        />
      </Box>
      <Collapse in={showMetrics}>
        <Stack spacing={1} sx={{ mt: 1 }}>
          <InsightCard icon={<MonitorHeartOutlinedIcon sx={iconSx} />} label={t("Кардио", "Cardio")} insight={hero.cardio} />
          <InsightCard icon={<SelfImprovementRoundedIcon sx={iconSx} />} label={t("Мобилити", "Mobility")} insight={hero.mobility} />
          <InsightCard icon={<SpaOutlinedIcon sx={iconSx} />} label={t("Восстановление", "Recovery")} insight={hero.recovery} />
          <InsightCard icon={<FitnessCenterOutlinedIcon sx={iconSx} />} label={t("Лучший результат", "Best result")} insight={hero.best} />
          <InsightCard icon={<EmojiEventsOutlinedIcon sx={iconSx} />} label={t("Рекорды", "Records")} insight={hero.records} />
          <InsightCard icon={<ShowChartRoundedIcon sx={iconSx} />} label={t("Прогресс", "Progress")} insight={hero.progress} />
        </Stack>
      </Collapse>
    </Paper>
  );
}
