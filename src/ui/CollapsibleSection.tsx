import { useEffect, useState, type ReactNode } from "react";
import { Box, ButtonBase, Collapse, Typography } from "@mui/material";
import { ExpandMoreRounded } from "./icons";
import { space, tr } from "./tokens";

function load(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(`repeat_section_${key}`);
    return v == null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

/** Раздел, который сворачивается по тапу на заголовок; состояние запоминается. */
export default function CollapsibleSection({
  id,
  title,
  icon,
  count,
  defaultOpen = true,
  forceOpen = false,
  children,
}: {
  id: string;
  title: ReactNode;
  icon?: ReactNode;
  count?: ReactNode;
  defaultOpen?: boolean;
  /** Раскрыть снаружи (например, переход из алерта). */
  forceOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => load(id, defaultOpen));
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem(`repeat_section_${id}`, v ? "0" : "1");
      } catch {
        /* приватный режим */
      }
      return !v;
    });
  };
  return (
    <Box component="section" sx={{ mt: space.section }}>
      <ButtonBase
        onClick={toggle}
        aria-expanded={open}
        sx={{ width: "100%", display: "flex", alignItems: "center", gap: 1, mb: open ? 1.5 : 0, py: 0.5, borderRadius: 2, justifyContent: "flex-start" }}
      >
        {icon}
        <Typography variant="h2" sx={{ flex: 1, textAlign: "left" }}>
          {title}
        </Typography>
        {count != null && (
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
            {count}
          </Typography>
        )}
        <ExpandMoreRounded sx={{ color: "text.secondary", transition: tr("transform"), transform: open ? "rotate(180deg)" : "none" }} />
      </ButtonBase>
      <Collapse in={open}>{children}</Collapse>
    </Box>
  );
}
