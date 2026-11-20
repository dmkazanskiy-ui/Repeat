import type { ReactNode } from "react";
import { Box, ButtonBase, Typography, type SxProps, type Theme } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { radius, space, text, motion, tr } from "./tokens";

interface Props {
  label?: ReactNode;
  value?: ReactNode;
  /** Мелкая строка под значением или справа от него (изменение, единица). */
  aside?: ReactNode;
  children?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  sx?: SxProps<Theme>;
}

/** Плитка внутри карточки: серый фон без рамки, 14px; можно выбрать. */
export default function Tile({ label, value, aside, children, selected, onClick, sx }: Props) {
  const theme = useTheme();
  // Без onClick — обычный блок (не кнопка), чтобы не глушить вложенные контролы.
  const Root = (onClick ? ButtonBase : Box) as typeof Box;
  return (
    <Root
      {...(onClick ? { component: "div", onClick, "aria-pressed": selected } : {})}
      sx={[
        {
          display: "block",
          textAlign: "left",
          minWidth: 0,
          p: space.tile,
          borderRadius: radius.tile,
          bgcolor: selected ? "action.selected" : "action.hover",
          boxShadow: selected ? `inset 0 0 0 1.5px ${alpha(theme.palette.text.primary, 0.35)}` : "none",
          transition: `${tr("background-color", motion.fast, "ease")}, ${tr("box-shadow", motion.fast, "ease")}`,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {label != null && (
        <Typography noWrap sx={{ ...text.label, mb: 0.75, color: selected ? "text.primary" : "text.secondary" }}>
          {label}
        </Typography>
      )}
      {value != null && (
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: 0.5 }}>
          <Typography component="div" sx={{ ...text.value, maxWidth: "100%", overflowWrap: "anywhere" }}>
            {value}
          </Typography>
          {aside}
        </Box>
      )}
      {children}
    </Root>
  );
}
