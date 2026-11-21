// Ссылка на документ внутри текста: обычный <a>, остаётся частью строки
// (переносится как текст), акцентный цвет и подчёркивание. В Telegram
// открывается встроенным браузером, иначе — в новой вкладке.
import type { ReactNode } from "react";
import { Link } from "@mui/material";
import { openDoc } from "../lib/consent";

export default function DocLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener"
      underline="always"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation(); // не переключать чекбокс, внутри которого стоит ссылка
        openDoc(href);
      }}
      sx={{ color: "primary.main", textDecorationColor: "currentColor", textUnderlineOffset: "2px", font: "inherit" }}
    >
      {children}
    </Link>
  );
}
