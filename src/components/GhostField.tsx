// Поле с подсказкой-призраком (designbookmark.com/motion#db-ghost-suggestion):
// начинаешь писать — продолжение фразы проступает бледным, рядом клавиша «Tab».
// Принять — Tab, стрелка вправо в конце текста или тап по клавише: буквы
// подсказки по очереди светлеют с маленьким подскоком (520/16), клавиша
// ныряет вниз и исчезает (520/24). Подсказки — свои: частые фразы + то, что
// человек уже писал раньше. Никакой сети и ИИ.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { clamp, spring, springLoop, type Spring } from "../lib/spring";
import { MODE } from "../lib/themeMode";

const TAB_SPRING: [number, number] = [520, 24];
const LETTER_Y: [number, number] = [520, 16];
const LETTER_O: [number, number] = [300, 30];
const FIELD = MODE === "light" ? "rgba(15,23,42,0.05)" : "rgba(238,242,247,0.06)";

/** Продолжение для последнего фрагмента текста (после «. », «, », «; »). */
function ghostFor(text: string, candidates: string[]): string {
  const m = text.match(/(?:^|[.,;!?]\s+|\n)([^.,;!?\n]*)$/);
  const tail = (m ? m[1] : text).trimStart();
  if (tail.length < 2) return "";
  const low = tail.toLowerCase();
  const hit = candidates.find((c) => c.length > tail.length && c.toLowerCase().startsWith(low));
  return hit ? hit.slice(tail.length) : "";
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  candidates: string[];
  placeholder?: string;
  label?: string;
  maxLength?: number;
  /** Enter: если задан — вызывается вместо переноса строки. */
  onEnter?: () => void;
  onBlur?: () => void;
  /** Без своей подложки — для строки внутри карточки (как в списке дел). */
  bare?: boolean;
  minRows?: number;
}

export default function GhostField({ value, onChange, candidates, placeholder, label, maxLength = 200, onEnter, onBlur, bare, minRows = 1 }: Props) {
  const theme = useTheme();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const tabRef = useRef<HTMLButtonElement>(null);
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [focused, setFocused] = useState(false);
  // Анимация принятия: какие буквы «приняты» и сколько текста было до них.
  const [accepted, setAccepted] = useState<{ before: string; rest: string } | null>(null);
  const ghost = useMemo(() => (focused && !accepted ? ghostFor(value, candidates) : ""), [value, candidates, focused, accepted]);
  const st = useRef<{ tab: Spring; ys: Spring[]; os: Spring[]; loop: ReturnType<typeof springLoop> | null }>({ tab: spring(0, ...TAB_SPRING), ys: [], os: [], loop: null });

  useEffect(() => {
    const s = st.current;
    s.loop = springLoop(
      () => [s.tab, ...s.ys, ...s.os],
      () => {
        const t = clamp(s.tab.x, -0.2, 1.2);
        if (tabRef.current) {
          tabRef.current.style.opacity = clamp(t, 0, 1).toFixed(3);
          tabRef.current.style.transform = `scale(${(0.6 + 0.4 * clamp(t, 0, 1.2)).toFixed(4)})`;
        }
        s.ys.forEach((y, i) => {
          const el = letterRefs.current[i];
          if (el) {
            el.style.transform = `translateY(${y.x.toFixed(2)}px)`;
            el.style.opacity = clamp(s.os[i].x, 0, 1).toFixed(3);
          }
        });
      },
    );
    return () => s.loop?.stop();
  }, []);

  // Появилась подсказка — клавиша «Tab» выпрыгивает; пропала — прячется.
  useEffect(() => {
    const s = st.current;
    s.tab.t = ghost ? 1 : 0;
    s.loop?.kick();
  }, [ghost]);

  // Высота textarea по содержимому.
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [value, ghost]);

  function accept() {
    if (!ghost) return;
    const s = st.current;
    const rest = ghost;
    s.tab.v = -9; // клавиша уходит вниз
    s.tab.t = 0;
    s.ys = [...rest].map(() => spring(0, ...LETTER_Y));
    s.os = [...rest].map(() => spring(0.45, ...LETTER_O));
    setAccepted({ before: value, rest });
    onChange((value + rest).slice(0, maxLength));
    // По очереди слева направо: буква светлеет и подпрыгивает.
    s.ys.forEach((y, i) =>
      window.setTimeout(() => {
        y.v = -70;
        s.os[i].t = 1;
        s.loop?.kick();
      }, i * 16),
    );
    window.setTimeout(() => setAccepted(null), rest.length * 16 + 450);
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) ta.setSelectionRange(ta.value.length, ta.value.length);
    });
    s.loop?.kick();
  }

  const typo = { fontSize: 15, lineHeight: "22px", fontFamily: "inherit", letterSpacing: "normal" } as const;
  const pad = bare ? { px: 0, py: "13px" } : { px: "12px", pt: label ? "24px" : "10px", pb: "10px" };

  return (
    <Box sx={{ position: "relative", borderRadius: bare ? 0 : "12px", bgcolor: bare ? "transparent" : FIELD, boxShadow: focused && !bare ? `inset 0 0 0 1.5px ${theme.palette.primary.main}` : "none", transition: "box-shadow .2s ease", flex: bare ? 1 : undefined }}>
      {label && (
        <Typography sx={{ position: "absolute", left: 12, top: 6, fontSize: 12, color: "text.secondary", pointerEvents: "none" }}>{label}</Typography>
      )}
      <Box
        component="textarea"
        ref={taRef}
        rows={minRows}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        enterKeyHint={onEnter ? "done" : undefined}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
          const atEnd = e.currentTarget.selectionStart === value.length;
          if (ghost && (e.key === "Tab" || (e.key === "ArrowRight" && atEnd))) {
            e.preventDefault();
            accept();
          } else if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
        sx={{
          ...typo,
          ...pad,
          display: "block",
          width: "100%",
          m: 0,
          border: 0,
          outline: "none",
          resize: "none",
          overflow: "hidden",
          bgcolor: "transparent",
          color: accepted ? "transparent" : "text.primary",
          caretColor: accepted ? "transparent" : theme.palette.primary.main,
          "&::placeholder": { color: "text.secondary", opacity: 1 },
        }}
      />
      {/* Зеркало поверх: тот же текст прозрачным, за ним — бледная подсказка и «Tab». */}
      {(ghost || accepted) && (
        <Box aria-hidden sx={{ ...typo, ...pad, position: "absolute", inset: 0, whiteSpace: "pre-wrap", overflowWrap: "break-word", pointerEvents: "none" }}>
          <Box component="span" sx={{ color: accepted ? "text.primary" : "transparent" }}>
            {accepted ? accepted.before : value}
          </Box>
          {accepted
            ? [...accepted.rest].map((ch, i) => (
                <Box
                  key={i}
                  component="span"
                  ref={(el: HTMLSpanElement | null) => {
                    letterRefs.current[i] = el;
                  }}
                  sx={{ display: "inline-block", whiteSpace: "pre", color: "text.primary", opacity: 0.45 }}
                >
                  {ch}
                </Box>
              ))
            : <Box component="span" sx={{ color: "text.disabled" }}>{ghost}</Box>}
          {!accepted && (
            <Box
              component="button"
              ref={tabRef}
              type="button"
              tabIndex={-1}
              onPointerDown={(e: React.PointerEvent) => e.preventDefault()} // не терять фокус поля
              onClick={accept}
              aria-label="Tab"
              sx={{ display: "inline-block", ml: 1, px: "7px", py: "1px", border: 0, borderRadius: "6px", verticalAlign: "0.08em", fontFamily: "inherit", fontSize: 11, lineHeight: "18px", fontWeight: 700, bgcolor: "action.selected", color: "text.secondary", cursor: "pointer", pointerEvents: "auto", opacity: 0, willChange: "transform,opacity" }}
            >
              Tab
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
