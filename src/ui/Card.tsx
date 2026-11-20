import { Paper, type PaperProps } from "@mui/material";
import { CARD_IN } from "../theme";
import { radius, space } from "./tokens";

/** Карточка: тонкая рамка, 22px, отступ 16, появление Blur Fade. */
export default function Card({ sx, ...rest }: PaperProps) {
  return (
    <Paper
      variant="outlined"
      {...rest}
      sx={[{ p: space.card, borderRadius: radius.card, animation: CARD_IN }, ...(Array.isArray(sx) ? sx : [sx])]}
    />
  );
}
