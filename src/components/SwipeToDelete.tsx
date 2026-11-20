import { motion, tr } from "../ui";
import { radius } from "../ui";
import { CARD_IN } from "../theme";
import { useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { DeleteOutlined as DeleteOutlineIcon } from "../ui/icons";
import { useT } from "../lib/i18n";

interface Props {
  children: React.ReactNode;
  onDelete: () => void;
  /** Цвет рамки карточки (готовый rgba). По умолчанию — нейтральный divider. */
  accent?: string;
}

/** Ширина красной панели, которая выезжает из-под карточки. */
const ACTION_WIDTH = 108;
/** До этого порога направление жеста ещё не определено. */
const AXIS_LOCK = 10;

/**
 * Свайп влево вытягивает из-под карточки кнопку «Удалить»; удаление
 * происходит по нажатию на неё, а не по самому свайпу.
 *
 * Так сделано намеренно: смах — жест лёгкий и случайный, а тренировку
 * терять обидно. Одно движение открывает, второе подтверждает.
 *
 * Жест уступает вертикальной прокрутке: пока палец не ушёл по горизонтали
 * дальше, чем по вертикали, карточка не двигается.
 */
export default function SwipeToDelete({ children, onDelete }: Props) {
  const t = useT();
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);

  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"none" | "x" | "y">("none");
  const openAtStart = useRef(0);
  /** Свайп не должен превращаться в открытие карточки по клику. */
  const swiped = useRef(false);
  /** Последние точки движения — для скорости смаха при отпускании. */
  const track = useRef<{ x: number; t: number }[]>([]);

  const open = offset <= -ACTION_WIDTH / 2;

  function close() {
    setAnimating(true);
    setOffset(0);
  }

  function onPointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return;
    start.current = { x: event.clientX, y: event.clientY };
    openAtStart.current = offset;
    axis.current = "none";
    swiped.current = false;
    track.current = [{ x: event.clientX, t: event.timeStamp }];
    setAnimating(false);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!start.current) return;
    const dx = event.clientX - start.current.x;
    const dy = event.clientY - start.current.y;

    if (axis.current === "none") {
      if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (axis.current === "x") {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }

    if (axis.current !== "x") return;
    swiped.current = true;
    track.current = [...track.current.slice(-4), { x: event.clientX, t: event.timeStamp }];
    // В пределах [−ширина панели, 0] карточка идёт за пальцем, дальше —
    // с нарастающим сопротивлением (резинка), а не упирается в стену.
    const raw = openAtStart.current + dx;
    const rubber = (over: number) => (1 - 1 / ((Math.abs(over) * 0.55) / 40 + 1)) * 40 * Math.sign(over);
    const next = raw > 0 ? rubber(raw) : raw < -ACTION_WIDTH ? -ACTION_WIDTH + rubber(raw + ACTION_WIDTH) : raw;
    setOffset(next);
  }

  function finish(event: React.PointerEvent) {
    if (!start.current) return;
    const wasHorizontal = axis.current === "x";
    start.current = null;
    axis.current = "none";
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!wasHorizontal) return;

    // Быстрый смах решает сам, даже короткий; медленный — по положению.
    const pts = track.current;
    const a = pts[0];
    const b = pts[pts.length - 1];
    const v = b && a && b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0; // px/мс
    const openIt = v < -0.11 ? true : v > 0.11 ? false : offset <= -ACTION_WIDTH / 2;
    setAnimating(true);
    setOffset(openIt ? -ACTION_WIDTH : 0);
  }

  return (
    <Box
      sx={{
        position: "relative",
        overflow: "hidden",
        borderRadius: radius.card, animation: CARD_IN,
        // Рамку рисует сама карточка (билет с вырезами), здесь только обрезка.
      }}
    >
      {/* Красный фон — на весь фрейм за карточкой, чтобы при свайпе не было
          ощущения отдельной панели. Иконка «Удалить» — в правой зоне, где
          карточка отъезжает. */}
      <Box
        role="button"
        // Панель под карточкой доступна только когда открыта свайпом.
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        onClick={onDelete}
        sx={{
          position: "absolute",
          inset: 0,
          bgcolor: "error.main",
          color: "#fff",
          display: "flex",
          justifyContent: "flex-end",
          cursor: "pointer",
          // Пока панель закрыта, она не должна перехватывать нажатия и не
          // должна просвечивать через вырезы билета.
          pointerEvents: open ? "auto" : "none",
          opacity: offset < 0 ? 1 : 0,
        }}
      >
        <Box
          sx={{
            width: ACTION_WIDTH,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 0.25,
          }}
        >
          <DeleteOutlineIcon fontSize="small" />
          <Typography variant="caption">{t("Удалить", "Delete")}</Typography>
        </Box>
      </Box>

      <Box
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onClickCapture={(event) => {
          // После свайпа — гасим клик. Когда панель открыта, тап по карточке
          // закрывает её, а не проваливается в редактор.
          if (swiped.current || open) {
            event.preventDefault();
            event.stopPropagation();
            swiped.current = false;
            if (open) close();
          }
        }}
        sx={{
          position: "relative",
          transform: `translateX(${offset}px)`,
          transition: animating ? tr("transform", motion.base) : "none",
          touchAction: "pan-y",
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
