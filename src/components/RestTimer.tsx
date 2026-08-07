import { useEffect, useRef, useState } from "react";
import { Box, Button, IconButton, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { useT } from "../lib/i18n";

interface Props {
  /** Метка времени (ms), когда отдых заканчивается. */
  endsAt: number;
  /** Цель отдыха в секундах — для прогресс-полосы. */
  target: number;
  /** Акцент-цвет (по типу тренировки). */
  color: string;
  onAdjust: (deltaSec: number) => void;
  onSkip: () => void;
}

/**
 * Плавающий таймер отдыха между подходами. Появляется, когда отмечаешь подход
 * выполненным; тикает вниз до нуля (потом «+перебор»), вибрирует по завершении.
 * −15/+15 меняют цель (запоминается), × закрывает. Сам себя гасит при долгом
 * перерасходе. Живёт над контентом редактора.
 */
export default function RestTimer({ endsAt, target, color, onAdjust, onSkip }: Props) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  const buzzed = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const remaining = Math.round((endsAt - now) / 1000);
  const done = remaining <= 0;

  useEffect(() => {
    if (done && !buzzed.current) {
      buzzed.current = true;
      try {
        navigator.vibrate?.(180);
      } catch {
        /* не поддерживается — не страшно */
      }
    }
    if (!done) buzzed.current = false;
  }, [done]);

  // Долгий перерасход — сами закрываемся, чтобы не висеть.
  useEffect(() => {
    if (remaining < -25) onSkip();
  }, [remaining, onSkip]);

  const abs = Math.abs(remaining);
  const clock = `${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
  const accent = done ? "#4ade80" : color;
  const progress = done ? 1 : Math.max(0, Math.min(1, 1 - remaining / target));

  return (
    <Box
      sx={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 16,
        zIndex: 1400,
        px: 2,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <Box
        sx={{
          pointerEvents: "auto",
          width: "100%",
          maxWidth: 520,
          borderRadius: 3,
          p: 1.25,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: alpha(accent, 0.45),
          boxShadow: 8,
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Box sx={{ color: accent, display: "flex" }}>
            {done ? <CheckRoundedIcon /> : <TimerOutlinedIcon />}
          </Box>
          <Box sx={{ flexShrink: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1 }}>
              {done ? t("Готово к подходу", "Ready for next set") : t("Отдых", "Rest")}
            </Typography>
            <Typography
              sx={{ fontSize: 20, fontWeight: 800, lineHeight: 1.15, color: accent, fontVariantNumeric: "tabular-nums" }}
            >
              {done ? `+${clock}` : clock}
            </Typography>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            variant="outlined"
            onClick={() => onAdjust(-15)}
            sx={{ minWidth: 0, px: 1, fontWeight: 700 }}
          >
            −15
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => onAdjust(15)}
            sx={{ minWidth: 0, px: 1, fontWeight: 700 }}
          >
            +15
          </Button>
          <IconButton size="small" onClick={onSkip} aria-label={t("Пропустить", "Skip")}>
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </Stack>
        <Box sx={{ mt: 0.75, height: 4, borderRadius: 2, bgcolor: "action.hover", overflow: "hidden" }}>
          <Box
            sx={{ height: "100%", width: `${progress * 100}%`, bgcolor: accent, transition: "width .25s linear" }}
          />
        </Box>
      </Box>
    </Box>
  );
}
