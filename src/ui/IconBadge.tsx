import type { ReactNode } from "react";
import { Box } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { radius } from "./tokens";

/** Квадрат с иконкой: ровная заливка цветом типа, 12px. */
export default function IconBadge({ color, size = 40, children }: { color: string; size?: number; children: ReactNode }) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        flex: "none",
        borderRadius: radius.icon,
        display: "grid",
        placeItems: "center",
        color,
        bgcolor: alpha(color, 0.14),
      }}
    >
      {children}
    </Box>
  );
}
