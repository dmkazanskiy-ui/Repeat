// Короткие заметки-дела к тренировке — Checkbox list
// (designbookmark.com/motion#db-checkbox-list) на наших пружинах: квадрат
// заливается зелёным (300/24) с «пружинкой» (520/13), галочка рисуется сама
// через 80 мс (160/20), через 160 мс текст перечёркивается слева направо
// (140/22) и гаснет. Счётчик «N из M» прокручивается (260/22).
import { useEffect, useRef, useState } from "react";
import { Box, IconButton, Typography } from "@mui/material";
import GhostField from "./GhostField";
import { todoSuggestions } from "../lib/suggestions";
import { useTheme } from "@mui/material/styles";
import { Card } from "../ui";
import { Add as AddIcon, Close as CloseIcon } from "../ui/icons";
import { clamp, spring, springLoop, type Spring } from "../lib/spring";
import { haptic } from "../lib/telegram";
import { newId } from "../lib/id";
import type { TodoItem } from "../lib/types";
import { useT } from "../lib/i18n";

const FILL: [number, number] = [300, 24];
const POP: [number, number] = [520, 13];
const CHECK: [number, number] = [160, 20];
const STRIKE: [number, number] = [140, 22];
const COUNT: [number, number] = [260, 22];

function Row({ item, onToggle, onRemove }: { item: TodoItem; onToggle: () => void; onRemove: () => void }) {
  const t = useT();
  const theme = useTheme();
  const green = theme.palette.primary.main;
  const base = theme.palette.action.selected;
  const boxRef = useRef<HTMLButtonElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const strikeRef = useRef<HTMLElement>(null);
  const st = useRef({
    f: spring(item.done ? 1 : 0, ...FILL),
    p: spring(1, ...POP),
    c: spring(item.done ? 1 : 0, ...CHECK),
    k: spring(item.done ? 1 : 0, ...STRIKE),
    loop: null as ReturnType<typeof springLoop> | null,
    timers: [] as number[],
    first: true,
  });

  useEffect(() => {
    const s = st.current;
    const paint = () => {
      const f = clamp(s.f.x, 0, 1);
      if (boxRef.current) {
        boxRef.current.style.background = `color-mix(in srgb, ${green} ${(f * 100).toFixed(1)}%, ${base})`;
        boxRef.current.style.transform = `scale(${s.p.x.toFixed(4)})`;
      }
      if (pathRef.current) pathRef.current.style.strokeDashoffset = (18 * (1 - clamp(s.c.x, 0, 1))).toFixed(2);
      if (strikeRef.current) strikeRef.current.style.width = `${(clamp(s.k.x, 0, 1) * 100).toFixed(2)}%`;
    };
    s.loop = springLoop(() => [s.f, s.p, s.c, s.k], paint);
    paint();
    return () => {
      s.loop?.stop();
      s.timers.forEach(clearTimeout);
    };
  }, [green, base]);

  useEffect(() => {
    const s = st.current;
    if (s.first) {
      s.first = false;
      return;
    }
    s.timers.forEach(clearTimeout);
    s.f.t = item.done ? 1 : 0;
    s.p.x = item.done ? 0.7 : 0.85;
    s.p.v = 5;
    if (item.done) {
      s.timers.push(window.setTimeout(() => ((s.c.t = 1), s.loop?.kick()), 80));
      s.timers.push(window.setTimeout(() => ((s.k.t = 1), s.loop?.kick()), 160));
    } else {
      s.c.t = 0;
      s.k.t = 0;
    }
    s.loop?.kick();
  }, [item.done]);

  return (
    <Box onClick={onToggle} sx={{ display: "flex", alignItems: "center", gap: 1.5, minHeight: 48, cursor: "pointer", "&:hover .todo-x": { opacity: 1 } }}>
      <Box
        component="button"
        ref={boxRef}
        role="checkbox"
        aria-checked={item.done}
        aria-label={item.text}
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          onToggle();
        }}
        sx={{ position: "relative", width: 24, height: 24, flex: "none", p: 0, border: 0, borderRadius: "8px", bgcolor: base, cursor: "pointer", display: "grid", placeItems: "center", willChange: "transform" }}
      >
        <svg viewBox="0 0 24 24" width={16} height={16} style={{ fill: "none", stroke: theme.palette.primary.contrastText, strokeWidth: 2.8, strokeLinecap: "round", strokeLinejoin: "round" }} aria-hidden>
          <path ref={pathRef} d="M6 12.5l4 4L18 8" style={{ strokeDasharray: 18, strokeDashoffset: 18 }} />
        </svg>
      </Box>
      <Typography component="span" sx={{ position: "relative", flex: 1, minWidth: 0, fontSize: 15, color: item.done ? "text.secondary" : "text.primary", transition: "color .3s", overflowWrap: "anywhere" }}>
        {item.text}
        <Box component="i" ref={strikeRef} sx={{ position: "absolute", left: 0, top: "50%", height: "1.5px", mt: "-0.75px", width: 0, bgcolor: "text.secondary", borderRadius: "1px" }} />
      </Typography>
      <IconButton
        className="todo-x"
        size="small"
        aria-label={t("Удалить", "Delete")}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        sx={{ color: "text.secondary", opacity: { xs: 0.6, sm: 0 }, transition: "opacity .2s" }}
      >
        <CloseIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Box>
  );
}

/** Счётчик «N из M»: число прокручивается столбиком. */
function RollingCount({ value, max }: { value: number; max: number }) {
  const colRef = useRef<HTMLSpanElement>(null);
  const st = useRef<{ s: Spring; loop: ReturnType<typeof springLoop> | null }>({ s: spring(value, ...COUNT), loop: null });
  useEffect(() => {
    const S = st.current;
    S.loop = springLoop(() => [S.s], () => {
      if (colRef.current) colRef.current.style.transform = `translateY(${(-16 * S.s.x).toFixed(2)}px)`;
    });
    S.loop.kick();
    return () => S.loop?.stop();
  }, []);
  useEffect(() => {
    st.current.s.t = value;
    st.current.loop?.kick();
  }, [value]);
  return (
    <Box component="span" sx={{ display: "inline-block", height: 16, overflow: "hidden", lineHeight: "16px", color: "text.primary", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
      <Box component="span" ref={colRef} sx={{ display: "block", willChange: "transform" }}>
        {Array.from({ length: max + 1 }, (_, i) => (
          <Box key={i} component="span" sx={{ display: "block", height: 16 }}>
            {i}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default function TodoList({ items, onChange, suggestions }: { items: TodoItem[]; onChange: (next: TodoItem[]) => void; suggestions?: string[] }) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const done = items.filter((i) => i.done).length;

  function add() {
    const text = draft.trim();
    if (!text) return;
    onChange([...items, { id: newId(), text: text.slice(0, 120), done: false }]);
    setDraft("");
  }

  return (
    <Card sx={{ pt: 1.75, pb: 1 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 0.5 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{t("Заметки", "Notes")}</Typography>
        {items.length > 0 && (
          <Box sx={{ display: "inline-flex", alignItems: "baseline", gap: 0.5, fontSize: 12, color: "text.secondary" }}>
            <RollingCount value={done} max={items.length} /> {t(`из ${items.length}`, `of ${items.length}`)}
          </Box>
        )}
      </Box>
      {items.map((item) => (
        <Row
          key={item.id}
          item={item}
          onToggle={() => {
            if (!item.done) haptic("light");
            onChange(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)));
          }}
          onRemove={() => onChange(items.filter((i) => i.id !== item.id))}
        />
      ))}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minHeight: 48 }}>
        <Box sx={{ width: 24, height: 24, flex: "none", borderRadius: "8px", display: "grid", placeItems: "center", color: "text.secondary", bgcolor: "action.hover" }}>
          <AddIcon sx={{ fontSize: 16 }} />
        </Box>
        <GhostField
          bare
          value={draft}
          onChange={setDraft}
          onEnter={add}
          onBlur={add}
          maxLength={120}
          candidates={suggestions ?? todoSuggestions()}
          placeholder={t("Добавить: взять ремни, снять технику…", "Add: bring straps, film your form…")}
        />
      </Box>
    </Card>
  );
}
