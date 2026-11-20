import type { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import { space } from "./tokens";

/** Раздел экрана: заголовок (+ действие справа) и содержимое с ровным ритмом. */
export default function Section({ title, action, children, first }: { title: ReactNode; action?: ReactNode; children: ReactNode; first?: boolean }) {
  return (
    <Box component="section" sx={{ mt: first ? 0 : space.section }}>
      <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1, mb: 1.5 }}>
        <Typography variant="h2">{title}</Typography>
        {action}
      </Box>
      {children}
    </Box>
  );
}
