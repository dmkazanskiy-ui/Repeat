import type { ReactNode } from "react";
import { Box, ButtonBase, Typography } from "@mui/material";
import { ChevronRight } from "./icons";
import { CARD_IN } from "../theme";
import { radius } from "./tokens";

interface Props {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  /** Показать шеврон справа (строка ведёт на другой экран). */
  chevron?: boolean;
  onClick?: () => void;
}

/** Строка-карточка: иконка, заголовок, подпись, хвост. Высота и отступы общие. */
export default function ListRow({ icon, title, subtitle, trailing, chevron, onClick }: Props) {
  return (
    <ButtonBase
      component="div"
      onClick={onClick}
      disabled={!onClick}
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        p: 2,
        minHeight: 64,
        textAlign: "left",
        borderRadius: radius.card,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        animation: CARD_IN,
        "&.Mui-disabled": { pointerEvents: "none" },
      }}
    >
      {icon}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3 }} noWrap>
          {title}
        </Typography>
        {subtitle != null && (
          <Typography sx={{ fontSize: 12.5, color: "text.secondary", lineHeight: 1.35, mt: 0.25 }} noWrap>
            {subtitle}
          </Typography>
        )}
      </Box>
      {trailing}
      {chevron && <ChevronRight sx={{ color: "text.secondary", fontSize: 20 }} />}
    </ButtonBase>
  );
}
