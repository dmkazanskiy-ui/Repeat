import { Box } from "@mui/material";
import JellySlider from "./JellySlider";
import { useT } from "../lib/i18n";

/**
 * Самочувствие двумя «желейными» слайдерами вместо 2D-карты. Данные те же:
 * точка { x, y } в 0–1 — `y` силы/бодрость, `x` вторая ось по контексту.
 * Пока ничего не выбрано, недостающая ось берётся из середины.
 */
export default function MoodPad({
  value,
  onChange,
  yLabels,
  xLabels,
  color,
  yTitle,
  xTitle,
}: {
  value: { x: number; y: number } | null;
  onChange: (v: { x: number; y: number }) => void;
  yLabels: [string, string];
  xLabels: [string, string];
  color: string;
  yTitle?: string;
  xTitle?: string;
}) {
  const t = useT();
  return (
    <Box sx={{ pt: 1.5, pb: 0.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
      <JellySlider
        label={yTitle ?? t("Силы", "Energy")}
        ends={yLabels}
        value={value?.y ?? null}
        onChange={(y) => onChange({ x: value?.x ?? 0.5, y })}
        color={color}
      />
      <JellySlider
        label={xTitle ?? t("Ощущения", "Feel")}
        ends={xLabels}
        value={value?.x ?? null}
        onChange={(x) => onChange({ y: value?.y ?? 0.5, x })}
        color={color}
      />
    </Box>
  );
}
