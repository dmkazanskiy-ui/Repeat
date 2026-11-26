import { tr } from "../../ui";
import { Card, IconBadge, radius, text } from "../../ui";
import { CARD_IN } from "../../theme";
import NumberTicker from "../NumberTicker";
import { ChartTip } from "../../ui";
import { useState, type ReactNode } from "react";
import { Box, Collapse, Divider, Stack, Typography, useTheme } from "@mui/material";
import { ExpandMoreRounded as ExpandMoreRoundedIcon } from "../../ui/icons";
import { TrendingUpRounded as TrendingUpRoundedIcon } from "../../ui/icons";
import { TrendingDownRounded as TrendingDownRoundedIcon } from "../../ui/icons";
import { MonitorHeartOutlined as MonitorHeartOutlinedIcon } from "../../ui/icons";
import FitnessCenterOutlinedIcon from "@mui/icons-material/FitnessCenterOutlined";
import { EmojiEventsOutlined as EmojiEventsOutlinedIcon } from "../../ui/icons";
import { ShowChartRounded as ShowChartRoundedIcon } from "../../ui/icons";
import SelfImprovementRoundedIcon from "@mui/icons-material/SelfImprovementRounded";
import SpaOutlinedIcon from "@mui/icons-material/SpaOutlined";
import { smoothPath } from "../../lib/chart";
import { useT } from "../../lib/i18n";
import type { Pt } from "../../lib/chart";
import { ink } from "../../lib/themeMode";

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
  /** Если задано — крупное число докручивается (Number Ticker). */
  volumeTick?: { value: number; format: (v: number) => string };
  /** Подпись над крупным числом объёма (по умолчанию «Общий тоннаж»). */
  volumeLabel?: string;
  dailyVolume: number[];
  /** Подсказки к столбикам по тапу: значение и подпись (дата/день). */
  barTips?: { value: string; label: string }[];
  /** По каждому дню графика: было восстановление, но не было тренировки. */
  recoveryDays: boolean[];
  /**
   * Индекс выделенного столбца (итог дня: неделя Пн–Вс, подсвечен выбранный
   * день). Заданный — столбец зелёный, остальные серо-прозрачные. undefined —
   * обычная раскраска (недельный hero).
   */
  highlightIndex?: number;
  // Инсайты-дропдаун «Показатели» — опциональны (для итога дня не нужны).
  cardio?: Insight;
  best?: Insight;
  records?: Insight;
  progress?: Insight;
  mobility?: Insight;
  recovery?: Insight;
}

const RECOVERY_COLOR = ink("#38bdf8");

/**
 * Вертикальные бары дневного объёма — «эквалайзер» справа, но по реальным
 * данным. День с восстановлением и без тренировки — голубым фиксированным баром
 * (тоннажа нет, но день не пустой), как в heatmap «Активность».
 */
function HeroBars({
  values,
  recoveryDays,
  highlightIndex,
  tips,
}: {
  values: number[];
  recoveryDays: boolean[];
  highlightIndex?: number;
  tips?: { value: string; label: string }[];
}) {
  const [tip, setTip] = useState<number | null>(null);
  const theme = useTheme();
  const green = theme.palette.primary.main;
  const gray = theme.palette.text.secondary;
  const present = values.length ? values : [0];
  const max = Math.max(1, ...present);
  const highlightMode = highlightIndex != null;
  return (
    <Box sx={{ position: "relative", display: "flex", alignItems: "flex-end", gap: "3px", height: 104, width: "100%" }}>
      {tip != null && tips?.[tip] && (
        <ChartTip x={((tip + 0.5) / present.length) * 100} top={0} value={tips[tip].value} label={tips[tip].label} />
      )}
      {present.map((v, i) => {
        const recovery = recoveryDays[i] && v <= 0;
        const isHi = highlightIndex === i;
        // Режим итога дня: выбранный день зелёный, прошлые серо-прозрачные.
        // Как в «Обзоре»: столбики нейтральные, зелёный — один (выбранный или лучший).
        const lead = highlightMode ? isHi : i === present.indexOf(max);
        let color = recovery ? RECOVERY_COLOR : gray;
        let opacity = recovery ? 1 : 0.35;
        if (lead) {
          color = green;
          opacity = 1;
        }
        // У восстановления и у пустого выбранного дня — невысокий, но заметный бар.
        const heightPct = v <= 0 && (recovery || isHi) ? 22 : Math.max(5, (v / max) * 100);
        return (
          <Box
            key={i}
            role={tips ? "button" : undefined}
            aria-label={tips?.[i] ? `${tips[i].label}: ${tips[i].value}` : undefined}
            onClick={tips ? () => setTip(tip === i ? null : i) : undefined}
            sx={{
              flex: 1,
              cursor: tips ? "pointer" : "default",
              outline: tip === i ? "2px solid" : "none",
              outlineColor: "text.primary",
              outlineOffset: 1,
              height: `${heightPct}%`,
              opacity,
              borderRadius: "5px",
              bgcolor: color,
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
        p: 2,
        borderRadius: radius.card, animation: CARD_IN,
        border: "1px solid",
        borderColor: "divider",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <IconBadge color={color}>
        {icon}
      </IconBadge>
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
  const hasInsights = Boolean(
    hero.cardio && hero.best && hero.records && hero.progress && hero.mobility && hero.recovery,
  );

  return (
    <Card sx={{ mb: 2 }}>
      <Stack direction="row" sx={{ alignItems: "flex-start", mb: 1.5 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flex: 1 }}>
          <Typography sx={{ ...text.label }}>{hero.title}</Typography>
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
          {/* Размер по ширине колонки: места хватает — крупно (до 27), мало — мельче
              (до 16), одной строкой и никогда не на графике. ~0,62em на букву. */}
          <Typography
            sx={{
              containerType: "inline-size",
              whiteSpace: "nowrap",
              fontWeight: 800,
              lineHeight: 1.1,
              "& > span": { display: "block", fontSize: `clamp(16px, calc(100cqi / ${(hero.workoutsText.length * 0.62).toFixed(2)}), 27px)` },
            }}
          >
            <span>
            {hero.workoutsText}</span>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {hero.daysText}
          </Typography>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {hero.volumeLabel ?? t("Общий тоннаж", "Total tonnage")}
          </Typography>
          <Typography sx={{ fontSize: 23, fontWeight: 800, lineHeight: 1.1 }}>
            {hero.volumeTick ? <NumberTicker value={hero.volumeTick.value} format={hero.volumeTick.format} /> : hero.volumeText}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}>
          <HeroBars values={hero.dailyVolume} recoveryDays={hero.recoveryDays} highlightIndex={hero.highlightIndex} tips={hero.barTips} />
        </Box>
      </Stack>

      {hasInsights && (
        <>
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
              borderRadius: radius.tile,
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
                transition: tr("transform"),
                transform: showMetrics ? "rotate(180deg)" : "none",
              }}
            />
          </Box>
          <Collapse in={showMetrics}>
            <Stack spacing={1} sx={{ mt: 1 }}>
              <InsightCard icon={<MonitorHeartOutlinedIcon sx={iconSx} />} label={t("Кардио", "Cardio")} insight={hero.cardio!} />
              <InsightCard icon={<SelfImprovementRoundedIcon sx={iconSx} />} label={t("Мобилити", "Mobility")} insight={hero.mobility!} />
              <InsightCard icon={<SpaOutlinedIcon sx={iconSx} />} label={t("Восстановление", "Recovery")} insight={hero.recovery!} />
              <InsightCard icon={<FitnessCenterOutlinedIcon sx={iconSx} />} label={t("Лучший результат", "Best result")} insight={hero.best!} />
              <InsightCard icon={<EmojiEventsOutlinedIcon sx={iconSx} />} label={t("Рекорды", "Records")} insight={hero.records!} />
              <InsightCard icon={<ShowChartRoundedIcon sx={iconSx} />} label={t("Прогресс", "Progress")} insight={hero.progress!} />
            </Stack>
          </Collapse>
        </>
      )}
    </Card>
  );
}
