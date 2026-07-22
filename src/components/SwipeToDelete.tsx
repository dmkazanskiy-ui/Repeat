import { useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";

interface Props {
  children: React.ReactNode;
  onDelete: () => void;
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
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);

  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"none" | "x" | "y">("none");
  const openAtStart = useRef(0);
  /** Свайп не должен превращаться в открытие карточки по клику. */
  const swiped = useRef(false);

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
    // Влево — до ширины панели, вправо — не дальше исходного положения.
    const next = Math.min(0, Math.max(-ACTION_WIDTH, openAtStart.current + dx));
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

    setAnimating(true);
    setOffset(offset <= -ACTION_WIDTH / 2 ? -ACTION_WIDTH : 0);
  }

  return (
    <Box sx={{ position: "relative", overflow: "hidden", borderRadius: 1 }}>
      <Box
        onClick={onDelete}
        sx={{
          position: "absolute",
          top: 0,
          bottom: 0,
          right: 0,
          width: ACTION_WIDTH,
          bgcolor: "error.main",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0.25,
          cursor: "pointer",
          // Пока панель закрыта, она не должна перехватывать нажатия.
          pointerEvents: open ? "auto" : "none",
        }}
      >
        <DeleteOutlineIcon fontSize="small" />
        <Typography variant="caption">Удалить</Typography>
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
          transition: animating ? "transform 200ms ease-out" : "none",
          touchAction: "pan-y",
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
