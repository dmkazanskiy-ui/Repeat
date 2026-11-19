import { useState } from "react";
import { Box, InputAdornment, ListItemIcon, Menu, MenuItem } from "@mui/material";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import ArrowDropDownRoundedIcon from "@mui/icons-material/ArrowDropDownRounded";
import NumberField from "./NumberField";
import { fromUnit, toUnitOrNull, unitLabel } from "../lib/units";
import type { WeightUnit } from "../lib/units";
import { useT } from "../lib/i18n";

/**
 * Поле веса подхода. Значение снаружи и наружу — всегда в кг; показ и ввод —
 * в единице упражнения. Справа — единица со стрелкой: тап открывает выбор
 * кг/lb для всего упражнения (поле при этом фокус не получает).
 */
export default function WeightField({
  valueKg,
  onChangeKg,
  unit,
  onUnitChange,
  sx,
}: {
  valueKg: number | null;
  onChangeKg: (kg: number | null) => void;
  unit: WeightUnit;
  onUnitChange: (unit: WeightUnit) => void;
  sx?: object;
}) {
  const t = useT();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  return (
    <>
      <NumberField
        placeholder={t("вес", "weight")}
        value={toUnitOrNull(valueKg, unit)}
        resetKey={unit}
        onChange={(v) => onChangeKg(fromUnit(v, unit))}
        sx={sx}
        slotProps={{
          input: {
            endAdornment: (
              <InputAdornment position="end" sx={{ ml: 0, mr: -1 }}>
                <Box
                  component="button"
                  type="button"
                  aria-label={t(`Единица: ${unitLabel(unit)}. Сменить`, `Unit: ${unitLabel(unit)}. Change`)}
                  aria-haspopup="menu"
                  // Не отдаём фокус полю и не открываем клавиатуру.
                  onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                  onClick={(e: React.MouseEvent<HTMLElement>) => {
                    e.stopPropagation();
                    setAnchor(e.currentTarget);
                  }}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    minWidth: 32,
                    minHeight: 32,
                    px: 0.25,
                    border: "none",
                    bgcolor: "transparent",
                    color: "text.secondary",
                    font: "inherit",
                    fontSize: 13,
                    cursor: "pointer",
                    borderRadius: 1,
                  }}
                >
                  {unitLabel(unit)}
                  <ArrowDropDownRoundedIcon sx={{ fontSize: 18, ml: -0.25 }} />
                </Box>
              </InputAdornment>
            ),
          },
        }}
      />
      <Menu anchorEl={anchor} open={anchor != null} onClose={() => setAnchor(null)}>
        {(["kg", "lb"] as const).map((u) => (
          <MenuItem
            key={u}
            selected={u === unit}
            onClick={() => {
              setAnchor(null);
              if (u !== unit) onUnitChange(u);
            }}
            sx={{ minWidth: 120 }}
          >
            <ListItemIcon>{u === unit && <CheckRoundedIcon fontSize="small" />}</ListItemIcon>
            {unitLabel(u)}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
