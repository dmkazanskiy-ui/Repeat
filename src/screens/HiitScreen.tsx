import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, IconButton, Stack, Typography } from "@mui/material";
import { alpha, createTheme, ThemeProvider, useTheme } from "@mui/material/styles";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import SkipNextRoundedIcon from "@mui/icons-material/SkipNextRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import { TYPE_COLOR } from "../lib/activityColors";
import { useT } from "../lib/i18n";
import {
  buildHiitPhases,
  clampHiit,
  hiitTotalSec,
  hiitWorkSec,
  HIIT_PRESETS,
  type HiitConfig,
  type HiitPhase,
  type HiitPhaseKind,
} from "../lib/hiit";

interface Props {
  initial: HiitConfig;
  onBack: () => void;
  /** Прогон завершён/остановлен: сохранить как кардио-сессию. */
  onFinish: (config: HiitConfig, elapsedSec: number) => void;
  /** Запомнить последний конфиг. */
  onConfigChange: (config: HiitConfig) => void;
}

function mmss(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Короткий бип через WebAudio (best-effort: на iOS/Telegram может молчать). */
function useBeeper() {
  const ctxRef = useRef<AudioContext | null>(null);
  const ensure = useCallback(() => {
    if (!ctxRef.current) {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) ctxRef.current = new AC();
      } catch {
        /* нет аудио — не страшно, визуал ведёт */
      }
    }
    return ctxRef.current;
  }, []);
  const beep = useCallback((freq: number, ms: number) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + ms / 1000);
    } catch {
      /* игнор */
    }
  }, []);
  return { ensure, beep };
}

function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* iOS/Telegram — no-op */
  }
}

export default function HiitScreen({ initial, onBack, onFinish, onConfigChange }: Props) {
  const t = useT();
  const theme = useTheme();
  const color = TYPE_COLOR.cardio;
  const scr = useMemo(
    () => createTheme(theme, { palette: { primary: theme.palette.augmentColor({ color: { main: color } }) } }),
    [theme, color],
  );

  const [cfg, setCfg] = useState<HiitConfig>(initial);
  const [mode, setMode] = useState<"config" | "run">("config");

  const patch = (p: Partial<HiitConfig>) => {
    const next = clampHiit({ ...cfg, ...p });
    setCfg(next);
    onConfigChange(next);
  };

  return (
    <ThemeProvider theme={scr}>
      {mode === "config" ? (
        <ConfigView cfg={cfg} color={color} onBack={onBack} onPatch={patch} onStart={() => setMode("run")} onPreset={(c) => { setCfg(c); onConfigChange(c); }} t={t} />
      ) : (
        <RunnerView cfg={cfg} color={color} onExit={() => setMode("config")} onFinish={onFinish} t={t} />
      )}
    </ThemeProvider>
  );
}

/* ------------------------------- CONFIG ------------------------------- */

function Stepper({ label, value, unit, onDelta, big }: { label: string; value: number; unit?: string; onDelta: (d: number) => void; big?: number }) {
  const step = big ?? 5;
  return (
    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", py: 1 }}>
      <Typography variant="body1" sx={{ fontWeight: 600 }}>{label}</Typography>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
        <IconButton size="small" onClick={() => onDelta(-step)} sx={{ border: 1, borderColor: "divider" }}><RemoveRoundedIcon fontSize="small" /></IconButton>
        <Typography sx={{ minWidth: 62, textAlign: "center", fontWeight: 800, fontSize: 18, fontVariantNumeric: "tabular-nums" }}>
          {value}{unit ? <Typography component="span" variant="caption" color="text.secondary">&nbsp;{unit}</Typography> : null}
        </Typography>
        <IconButton size="small" onClick={() => onDelta(step)} sx={{ border: 1, borderColor: "divider" }}><AddRoundedIcon fontSize="small" /></IconButton>
      </Stack>
    </Stack>
  );
}

function ConfigView({ cfg, color, onBack, onPatch, onStart, onPreset, t }: {
  cfg: HiitConfig; color: string; onBack: () => void;
  onPatch: (p: Partial<HiitConfig>) => void; onStart: () => void;
  onPreset: (c: HiitConfig) => void; t: ReturnType<typeof useT>;
}) {
  const total = hiitTotalSec(cfg);
  return (
    <Box sx={{ p: 2, pb: 6, maxWidth: 560, mx: "auto" }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
        <IconButton onClick={onBack} edge="start"><ArrowBackIcon /></IconButton>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>{t("HIIT-таймер", "HIIT timer")}</Typography>
      </Stack>

      <Typography variant="overline" color="text.secondary">{t("Пресеты", "Presets")}</Typography>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1, mb: 2 }}>
        {HIIT_PRESETS.map((p) => {
          const active = cfg.workSec === p.config.workSec && cfg.restSec === p.config.restSec && cfg.rounds === p.config.rounds;
          return (
            <Box key={p.id} onClick={() => onPreset({ ...p.config, warmupSec: cfg.warmupSec, cooldownSec: cfg.cooldownSec })}
              sx={{ px: 1.75, py: 0.75, borderRadius: 999, cursor: "pointer", fontWeight: 700, fontSize: 14,
                border: 1, borderColor: active ? color : "divider",
                bgcolor: active ? alpha(color, 0.16) : "transparent", color: active ? color : "text.primary" }}>
              {p.label}
            </Box>
          );
        })}
      </Stack>

      <Box sx={{ borderRadius: 2, border: 1, borderColor: "divider", px: 2, py: 1, mb: 2 }}>
        <Stepper label={t("Работа", "Work")} value={cfg.workSec} unit={t("сек", "sec")} onDelta={(d) => onPatch({ workSec: cfg.workSec + d })} />
        <Stepper label={t("Отдых", "Rest")} value={cfg.restSec} unit={t("сек", "sec")} onDelta={(d) => onPatch({ restSec: cfg.restSec + d })} />
        <Stepper label={t("Раунды", "Rounds")} value={cfg.rounds} onDelta={(d) => onPatch({ rounds: cfg.rounds + d })} big={1} />
        <Stepper label={t("Разминка", "Warm-up")} value={cfg.warmupSec} unit={t("сек", "sec")} onDelta={(d) => onPatch({ warmupSec: cfg.warmupSec + d })} big={15} />
        <Stepper label={t("Заминка", "Cool-down")} value={cfg.cooldownSec} unit={t("сек", "sec")} onDelta={(d) => onPatch({ cooldownSec: cfg.cooldownSec + d })} big={15} />
      </Box>

      <Stack direction="row" spacing={2} sx={{ justifyContent: "center", mb: 2, color: "text.secondary" }}>
        <Typography variant="body2">{t("Всего", "Total")}: <b>{mmss(total)}</b></Typography>
        <Typography variant="body2">{t("Работа", "Work")}: <b>{mmss(hiitWorkSec(cfg))}</b></Typography>
        <Typography variant="body2">{cfg.rounds}× {cfg.workSec}/{cfg.restSec}{t("с", "s")}</Typography>
      </Stack>

      <Button fullWidth variant="contained" size="large" onClick={onStart} sx={{ py: 1.4, fontSize: 17, fontWeight: 700 }}>
        {t("Начать", "Start")}
      </Button>
    </Box>
  );
}

/* ------------------------------- RUNNER ------------------------------- */

const PHASE_COLOR: Record<HiitPhaseKind, string> = {
  prep: "#f59e0b",
  warmup: "#f59e0b",
  work: "#f472b6",
  rest: "#38bdf8",
  cooldown: "#4ade80",
};

function phaseLabel(kind: HiitPhaseKind, t: ReturnType<typeof useT>): string {
  const map: Record<HiitPhaseKind, string> = {
    prep: t("Приготовься", "Get ready"),
    warmup: t("Разминка", "Warm-up"),
    work: t("РАБОТА", "WORK"),
    rest: t("Отдых", "Rest"),
    cooldown: t("Заминка", "Cool-down"),
  };
  return map[kind];
}

function RunnerView({ cfg, onExit, onFinish, t }: {
  cfg: HiitConfig; color: string; onExit: () => void;
  onFinish: (config: HiitConfig, elapsedSec: number) => void; t: ReturnType<typeof useT>;
}) {
  const phases = useMemo<HiitPhase[]>(() => buildHiitPhases(cfg), [cfg]);
  const totalRounds = cfg.rounds;
  const { ensure, beep } = useBeeper();

  const [idx, setIdx] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [paused, setPaused] = useState(false);
  const endsAtRef = useRef<number>(0);
  const pausedRemRef = useRef<number>(0);
  const runStartRef = useRef<number>(0);
  const pausedAccumRef = useRef<number>(0);
  const pauseStartRef = useRef<number>(0);
  const lastBeepSecRef = useRef<number>(-1);
  const finishedRef = useRef(false);

  // Старт прогона: разблокировать аудио, поставить первую фазу.
  useEffect(() => {
    ensure();
    const t0 = Date.now();
    runStartRef.current = t0;
    endsAtRef.current = t0 + (phases[0]?.sec ?? 0) * 1000;
    buzz(60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  const advance = useCallback((toIdx: number) => {
    if (toIdx >= phases.length) {
      if (finishedRef.current) return;
      finishedRef.current = true;
      const elapsed = (Date.now() - runStartRef.current - pausedAccumRef.current) / 1000;
      buzz([120, 60, 120]);
      onFinish(cfg, Math.round(elapsed));
      return;
    }
    setIdx(toIdx);
    endsAtRef.current = Date.now() + phases[toIdx].sec * 1000;
    lastBeepSecRef.current = -1;
    const nk = phases[toIdx].kind;
    buzz(nk === "work" ? [90, 40, 90] : 70);
    beep(nk === "work" ? 880 : 520, 180);
  }, [phases, cfg, onFinish, beep]);

  // Тик: отсчёт текущей фазы, авто-переход, бипы 3-2-1.
  useEffect(() => {
    if (paused || finishedRef.current) return;
    const remMs = endsAtRef.current - now;
    if (remMs <= 0) {
      advance(idx + 1);
      return;
    }
    const secLeft = Math.ceil(remMs / 1000);
    if (secLeft <= 3 && secLeft >= 1 && secLeft !== lastBeepSecRef.current) {
      lastBeepSecRef.current = secLeft;
      beep(660, 90);
      buzz(40);
    }
  }, [now, paused, idx, advance, beep]);

  const phase = phases[idx];
  const remSec = paused
    ? Math.ceil(pausedRemRef.current / 1000)
    : Math.max(0, Math.ceil((endsAtRef.current - now) / 1000));
  const accent = phase ? PHASE_COLOR[phase.kind] : "#f472b6";
  const phaseProgress = phase ? Math.max(0, Math.min(1, 1 - (endsAtRef.current - now) / (phase.sec * 1000))) : 0;

  const togglePause = () => {
    if (paused) {
      // Возобновление: конец фазы отсчитываем от «сейчас»; паузу учтёт эффект ниже.
      endsAtRef.current = Date.now() + pausedRemRef.current;
      setPaused(false);
    } else {
      pausedRemRef.current = Math.max(0, endsAtRef.current - Date.now());
      pauseStartRef.current = Date.now();
      setPaused(true);
    }
  };
  // Копим время на паузе, чтобы не попало в длительность прогона.
  useEffect(() => {
    if (!paused && pauseStartRef.current) {
      pausedAccumRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = 0;
    }
  }, [paused]);

  const stop = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const elapsed = (Date.now() - runStartRef.current - pausedAccumRef.current) / 1000;
    onFinish(cfg, Math.round(elapsed));
  };

  return (
    <Box sx={{
      position: "fixed", inset: 0, zIndex: 1500, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", textAlign: "center",
      bgcolor: (th) => th.palette.mode === "dark" ? alpha(accent, 0.14) : alpha(accent, 0.1),
      transition: "background-color .25s",
    }}>
      <Box sx={{ position: "absolute", top: 14, left: 14 }}>
        <IconButton onClick={onExit}><ArrowBackIcon /></IconButton>
      </Box>

      <Typography sx={{ fontFamily: "ui-monospace, monospace", letterSpacing: 2, fontWeight: 800, fontSize: 20, color: accent }}>
        {phase ? phaseLabel(phase.kind, t) : ""}
      </Typography>
      {phase?.round != null && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {t("раунд", "round")} {phase.round}/{totalRounds}
        </Typography>
      )}

      <Typography sx={{ fontWeight: 800, fontSize: "clamp(72px, 26vw, 160px)", lineHeight: 1, my: 2, fontVariantNumeric: "tabular-nums", color: accent }}>
        {mmss(remSec)}
      </Typography>

      {/* прогресс-полоса фазы */}
      <Box sx={{ width: "min(78vw, 380px)", height: 6, borderRadius: 3, bgcolor: "divider", overflow: "hidden", mb: 4 }}>
        <Box sx={{ width: `${phaseProgress * 100}%`, height: "100%", bgcolor: accent }} />
      </Box>

      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <IconButton onClick={() => advance(idx + 1)} sx={{ border: 1, borderColor: "divider" }} aria-label={t("Пропустить фазу", "Skip phase")}>
          <SkipNextRoundedIcon />
        </IconButton>
        <IconButton onClick={togglePause} sx={{ width: 64, height: 64, bgcolor: accent, color: "#0b1310", "&:hover": { bgcolor: accent } }} aria-label={paused ? t("Продолжить", "Resume") : t("Пауза", "Pause")}>
          {paused ? <PlayArrowRoundedIcon sx={{ fontSize: 34 }} /> : <PauseRoundedIcon sx={{ fontSize: 34 }} />}
        </IconButton>
        <IconButton onClick={stop} sx={{ border: 1, borderColor: "divider", color: "error.main" }} aria-label={t("Завершить", "Finish")}>
          <StopRoundedIcon />
        </IconButton>
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 3 }}>
        {idx + 1} / {phases.length} · {t("Работа", "Work")} {mmss(hiitWorkSec(cfg))}
      </Typography>
    </Box>
  );
}
