import { forwardRef, type ReactElement, type Ref } from "react";
import Slide from "@mui/material/Slide";
import type { TransitionProps } from "@mui/material/transitions";
import { motion } from "./tokens";

type P = TransitionProps & { children: ReactElement };

/** Окно-шторка выезжает снизу с кривой как в iOS (0,4 с), уходит быстрее. */
export const SheetUp = forwardRef(function SheetUp(props: P, ref: Ref<unknown>) {
  return <Slide direction="up" ref={ref} easing={{ enter: motion.drawer, exit: motion.easeOut }} {...props} />;
});

/** Всплывающее сообщение — короткий подъём снизу. */
export const ToastUp = forwardRef(function ToastUp(props: P, ref: Ref<unknown>) {
  return <Slide direction="up" ref={ref} easing={{ enter: motion.easeOut, exit: motion.easeOut }} {...props} />;
});
