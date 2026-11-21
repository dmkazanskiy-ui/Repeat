import { Box } from "@mui/material";
import { avatarUrl } from "../../lib/social";

/** Круглая аватарка: фото или первая буква имени. */
export default function Avatar({
  person,
  size = 40,
  src,
}: {
  person: { pid: string; name: string; av: number } | null;
  size?: number;
  /** Локальное превью (например, только что выбранное фото). */
  src?: string | null;
}) {
  const url = src ?? avatarUrl(person);
  const letter = (person?.name || "?").trim().charAt(0).toUpperCase();
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: "50%",
        flex: "none",
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
        bgcolor: "action.selected",
        fontWeight: 700,
        fontSize: size * 0.4,
        color: "text.primary",
      }}
    >
      {url ? <Box component="img" src={url} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover" }} /> : letter}
    </Box>
  );
}
