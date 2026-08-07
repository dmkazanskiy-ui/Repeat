import { useMemo, useState } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { BODY_FRONT, BODY_BACK } from "../../lib/bodyMap";
import type { BodyPart } from "../../lib/bodyMap";
import type { MuscleLoad } from "../../lib/analytics";
import type { Muscle } from "../../lib/analytics/muscles";
import { useT } from "../../lib/i18n";

// Наши 13 мышц → слаги полигонов библиотеки, по виду. Дельты и трапеции в
// библиотеке одним полигоном, поэтому несколько наших мышц могут делить слаг —
// берём максимум нагрузки среди них.
const FRONT_MAP: Partial<Record<Muscle, string[]>> = {
  chest: ["chest"],
  upperBack: ["trapezius"],
  frontDelt: ["deltoids"],
  sideDelt: ["deltoids"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  quads: ["quadriceps"],
  calves: ["calves"],
  core: ["abs", "obliques"],
};
const BACK_MAP: Partial<Record<Muscle, string[]>> = {
  lats: ["upper-back"],
  upperBack: ["trapezius"],
  sideDelt: ["deltoids"],
  rearDelt: ["deltoids"],
  triceps: ["triceps"],
  hamstrings: ["hamstring"],
  glutes: ["gluteal"],
  calves: ["calves"],
};

interface SlugInfo {
  intensity: number; // 0..1 относительно самой нагруженной мышцы
  muscle: Muscle;
  label: string;
  value: number;
}

/** slug → нагрузка, взяв максимум среди наших мышц, что ложатся на этот слаг. */
function buildSlugMap(
  map: Partial<Record<Muscle, string[]>>,
  byMuscle: Map<Muscle, MuscleLoad>,
  peak: number,
): Record<string, SlugInfo> {
  const out: Record<string, SlugInfo> = {};
  (Object.keys(map) as Muscle[]).forEach((m) => {
    const load = byMuscle.get(m);
    if (!load || load.adjustedSets <= 0) return;
    for (const slug of map[m]!) {
      const intensity = peak > 0 ? load.adjustedSets / peak : 0;
      const cur = out[slug];
      if (!cur || load.adjustedSets > cur.value) {
        out[slug] = { intensity, muscle: m, label: load.label, value: load.adjustedSets };
      }
    }
  });
  return out;
}

function Figure({
  parts,
  viewBox,
  slugMap,
  onPick,
  selected,
}: {
  parts: BodyPart[];
  viewBox: string;
  slugMap: Record<string, SlugInfo>;
  onPick: (info: SlugInfo | null) => void;
  selected: Muscle | null;
}) {
  const theme = useTheme();
  const accent = theme.palette.primary.main;
  const baseFill = alpha(theme.palette.text.primary, theme.palette.mode === "dark" ? 0.07 : 0.05);
  const baseStroke = alpha(theme.palette.text.primary, 0.14);

  const paths: Array<{ d: string; fill: string; stroke: string; info: SlugInfo | null; sel: boolean }> = [];
  for (const part of parts) {
    const info = slugMap[part.slug] ?? null;
    const active = info && info.intensity > 0;
    const fill = active ? alpha(accent, 0.16 + 0.72 * info!.intensity) : baseFill;
    const sel = !!info && info.muscle === selected;
    const stroke = active ? alpha(accent, 0.55) : baseStroke;
    const ds = [...(part.path.left ?? []), ...(part.path.right ?? []), ...(part.path.common ?? [])];
    for (const d of ds) paths.push({ d, fill, stroke, info, sel });
  }

  return (
    <Box
      component="svg"
      viewBox={viewBox}
      sx={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
      role="img"
    >
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill={p.fill}
          stroke={p.sel ? accent : p.stroke}
          strokeWidth={p.sel ? 4 : 1.5}
          vectorEffect="non-scaling-stroke"
          style={{ cursor: p.info ? "pointer" : "default", transition: "fill .2s" }}
          onClick={() => p.info && onPick(p.info.muscle === selected ? null : p.info)}
        />
      ))}
    </Box>
  );
}

/**
 * Карта мышц: силуэт спереди и сзади, красится по эквивалентным подходам за
 * период (самая нагруженная мышца = полный акцент). Тап по мышце — подпись с
 * числом. Один зелёный акцент, ненагруженное — рецессивная подложка (по dataviz).
 */
export default function BodyMap({ loads }: { loads: MuscleLoad[] }) {
  const t = useT();
  const theme = useTheme();
  const accent = theme.palette.primary.main;
  const [selected, setSelected] = useState<SlugInfo | null>(null);

  const { front, back, hasData } = useMemo(() => {
    const byMuscle = new Map<Muscle, MuscleLoad>(loads.map((l) => [l.muscle, l]));
    const peak = loads.reduce((m, l) => Math.max(m, l.adjustedSets), 0);
    return {
      front: buildSlugMap(FRONT_MAP, byMuscle, peak),
      back: buildSlugMap(BACK_MAP, byMuscle, peak),
      hasData: peak > 0,
    };
  }, [loads]);

  const pick = (info: SlugInfo | null) => setSelected(info);

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ justifyContent: "center", alignItems: "flex-start" }}>
        {[
          { key: "front", parts: BODY_FRONT, viewBox: "0 0 724 1448", map: front, label: t("Спереди", "Front") },
          { key: "back", parts: BODY_BACK, viewBox: "724 0 724 1448", map: back, label: t("Сзади", "Back") },
        ].map((v) => (
          <Box key={v.key} sx={{ flex: 1, minWidth: 0, maxWidth: 168 }}>
            <Figure
              parts={v.parts}
              viewBox={v.viewBox}
              slugMap={v.map}
              onPick={pick}
              selected={selected?.muscle ?? null}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center", mt: 0.5 }}>
              {v.label}
            </Typography>
          </Box>
        ))}
      </Stack>

      {/* Подпись выбранной мышцы / легенда */}
      <Box sx={{ mt: 1.5, minHeight: 34, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {selected ? (
          <Typography variant="body2" sx={{ textAlign: "center" }}>
            <Box component="span" sx={{ fontWeight: 700 }}>{selected.label}</Box>
            <Box component="span" sx={{ color: "text.secondary" }}>
              {" · "}{Math.round(selected.value)} {t("экв. подходов", "equiv. sets")}
            </Box>
          </Typography>
        ) : hasData ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", color: "text.secondary" }}>
            <Typography variant="caption">{t("меньше", "less")}</Typography>
            <Box sx={{ width: 96, height: 8, borderRadius: 999, background: `linear-gradient(90deg, ${alpha(accent, 0.16)}, ${accent})` }} />
            <Typography variant="caption">{t("больше", "more")}</Typography>
          </Stack>
        ) : (
          <Typography variant="caption" color="text.secondary">
            {t("Занеси силовые — тело окрасится по нагрузке.", "Log strength — the body colors by load.")}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
