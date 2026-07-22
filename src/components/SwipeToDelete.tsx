import { useRef, useState } from "react";
import { Box } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";

interface Props {
  children: React.ReactNode;
  onDelete: () => void;
}

/** Сколько нужно протянуть, чтобы смах засчитался как удаление. */
const THRESHOLD = 96;
/** До этого порога направление жеста ещё не определено. */
const AXIS_LOCK = 10;

/**
 * Свайп по карточке в любую сторону удаляет её.
 *
 * Жест намеренно уступает вертикальной прокрутке: пока палец не ушёл
 * по горизонтали дальше, чем по вертикали, карточка не двигается —
 * иначе список невозможно листать, не задевая карточки.
 */
export default function SwipeToDelete({ children, onDelete }: Props) {
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);

  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"none" | "x" | "y">("none");
  /** Свайп не должен превращаться в открытие карточки по клику. */
  const swiped = useRef(false);

  function onPointerDown(event: React.PointerEvent) {
    // Мышиный правый клик и продолжение уже идущего жеста игнорируем.
    if (event.button !== 0) return;
    start.current = { x: event.clientX, y: event.clientY };
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
    setOffset(dx);
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
    if (Math.abs(offset) >= THRESHOLD) {
      // Досылаем карточку за край экрана, потом отдаём удаление наверх.
      setOffset(offset > 0 ? window.innerWidth : -window.innerWidth);
      setTimeout(onDelete, 180);
      return;
    }
    setOffset(0);
  }

  const progress = Math.min(Math.abs(offset) / THRESHOLD, 1);

  return (
    <Box sx={{ position: "relative", overflow: "hidden", borderRadius: 3.5 }}>
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          bgcolor: "error.main",
          opacity: 0.25 + progress * 0.75,
          display: "flex",
          alignItems: "center",
          justifyContent: offset > 0 ? "flex-start" : "flex-end",
          px: 2.5,
          color: "#fff",
          pointerEvents: "none",
        }}
      >
        <DeleteOutlineIcon />
      </Box>

      <Box
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onClickCapture={(event) => {
          if (swiped.current) {
            event.preventDefault();
            event.stopPropagation();
            swiped.current = false;
          }
        }}
        sx={{
          position: "relative",
          transform: `translateX(${offset}px)`,
          transition: animating ? "transform 180ms ease-out" : "none",
          touchAction: "pan-y",
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
