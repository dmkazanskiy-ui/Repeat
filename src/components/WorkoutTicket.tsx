import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { AccessTimeRounded } from "../ui/icons";
import { motion, radius } from "../ui";

export interface TicketField {
  label: string;
  value: string;
}

interface Props {
  /** Шапка: иконка вида, вид и название — как авиакомпания и номер рейса. */
  icon: ReactNode;
  color: string;
  kind: string;
  title: string;
  /** Пилюля статуса справа. */
  status: { label: string; tone: "done" | "running" | "planned" | "estimated" };
  /** «Маршрут»: начало → конец, посередине длительность. */
  from: { big: string; small: string };
  to: { big: string; small: string };
  middle?: string;
  /** Сетка показателей (до 4). */
  fields: TicketField[];
  /** Строка под показателями: упражнения, самочувствие. */
  note?: string;
  onTimeChange?: (time: string | null) => void;
  timeValue?: string | null;
}

/**
 * Карточка тренировки в виде билета (по мотивам Boarding pass из Kokonut UI):
 * шапка со статусом, «маршрут» время начала → конца, сетка показателей
 * и строка с упражнениями.
 * Изменившиеся символы (тикающее время идущей тренировки) перелистываются.
 */
export default function WorkoutTicket(p: Props) {
  const theme = useTheme();

  const tones = {
    done: { bg: alpha(theme.palette.primary.main, 0.14), fg: theme.palette.primary.main },
    running: { bg: alpha(p.color, 0.16), fg: p.color },
    planned: { bg: theme.palette.action.hover, fg: theme.palette.text.secondary },
    estimated: { bg: alpha("#f59e0b", 0.14), fg: theme.palette.mode === "light" ? "#b45309" : "#fbbf24" },
  } as const;
  const tone = tones[p.status.tone];

  return (
    <Box sx={{ position: "relative" }}>
      <Box
        sx={{
          borderRadius: radius.card,
          border: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Box sx={{ p: 2 }}>
          {/* Шапка */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
            <Box
              sx={{
                width: 24,
                height: 24,
                flex: "none",
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                color: p.color,
                bgcolor: alpha(p.color, 0.16),
                "& svg": { fontSize: 15 },
              }}
            >
              {p.icon}
            </Box>
            <Typography noWrap sx={{ fontSize: 13, fontWeight: 600, minWidth: 0 }}>
              {p.kind}
              <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>
                {" "}· {p.title}
              </Box>
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Box
              component="span"
              sx={{
                flex: "none",
                height: 24,
                px: 1.25,
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                bgcolor: tone.bg,
                color: tone.fg,
                transition: `background-color ${motion.base}ms ease, color ${motion.base}ms ease`,
              }}
            >
              <Flap value={p.status.label} />
            </Box>
          </Box>

          {/* Маршрут: начало → конец */}
          <Box sx={{ mt: 2, display: "flex", alignItems: "flex-end", gap: 1.5 }}>
            <Box sx={{ minWidth: 0, position: "relative" }}>
              <Typography sx={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>
                <Flap value={p.from.big} />
              </Typography>
              <Typography noWrap sx={{ fontSize: 12, color: "text.secondary", display: "flex", alignItems: "center", gap: 0.4 }}>
                {p.onTimeChange && <AccessTimeRounded sx={{ fontSize: 12, opacity: 0.7 }} />}
                {p.from.small}
              </Typography>
              {/* Время начала правится тапом — нативный пикер поверх */}
              {p.onTimeChange && (
                <Box
                  component="input"
                  type="time"
                  value={p.timeValue ?? ""}
                  aria-label="Время тренировки"
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => p.onTimeChange?.(e.target.value || null)}
                  sx={{ position: "absolute", inset: 0, width: "100%", opacity: 0, cursor: "pointer", border: 0, p: 0, m: 0 }}
                />
              )}
            </Box>
            <Box sx={{ flex: 1, mb: 2.75, display: "flex", alignItems: "center", gap: 0.75, color: "text.disabled", minWidth: 24 }}>
              <Box sx={{ flex: 1, borderTop: "1px dashed", borderColor: "currentColor" }} />
              {p.middle && (
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                  <Flap value={p.middle} />
                </Typography>
              )}
              <Box sx={{ flex: 1, borderTop: "1px dashed", borderColor: "currentColor" }} />
            </Box>
            <Box sx={{ minWidth: 0, textAlign: "right" }}>
              <Typography sx={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>
                <Flap value={p.to.big} />
              </Typography>
              <Typography noWrap sx={{ fontSize: 12, color: "text.secondary" }}>
                {p.to.small}
              </Typography>
            </Box>
          </Box>

          {/* Показатели */}
          {p.fields.length > 0 && (
            <Box sx={{ mt: 2, display: "grid", gridTemplateColumns: `repeat(${Math.max(p.fields.length, 3)}, minmax(0, 1fr))`, gap: 1.5 }}>
              {p.fields.map((f) => (
                <Box key={f.label} sx={{ minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 11, color: "text.secondary" }}>
                    {f.label}
                  </Typography>
                  <Typography noWrap sx={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" }}>
                    <Flap value={f.value} />
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
          {p.note && (
            <Typography
              sx={{ mt: 1.25, fontSize: 12, color: "text.secondary", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
            >
              {p.note}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Значение, у которого перелистываются только изменившиеся символы (как табло
 * вылетов): новый символ въезжает сверху за 0,32 с, по очереди через 60 мс.
 * При первом показе ничего не анимируется.
 */
function Flap({ value }: { value: string }) {
  const prev = useRef<string | null>(null);
  const was = prev.current;
  useLayoutEffect(() => {
    prev.current = value;
  });
  let changed = 0;
  return (
    <Box component="span" sx={{ display: "inline-flex", whiteSpace: "pre" }}>
      <Box component="span" sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {value}
      </Box>
      {[...value].map((ch, i) => {
        const moved = was !== null && was[i] !== ch;
        const order = moved ? changed++ : 0;
        return (
          <Box component="span" aria-hidden key={`${i}-${value.length}`} sx={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom" }}>
            <Box
              component="span"
              key={ch}
              sx={{
                display: "inline-block",
                animation: moved ? `rp-flap 320ms ${motion.easeOut} ${order * 60}ms both` : "none",
              }}
            >
              {ch}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
