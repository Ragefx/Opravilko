import { useRef, useState } from "react";

/** How far a finger has to drag a row before letting go triggers the action. */
export const SWIPE_TRIGGER = 90;
const SWIPE_MAX = 140;

/**
 * Touch swipes on a list row: dragged right past SWIPE_TRIGGER calls
 * `onRight`, left calls `onLeft`. Vertical drags stay page scrolls, and the
 * tap that ends a swipe doesn't also "click" the row.
 */
export function useSwipeActions({
  onRight,
  onLeft,
  disabled = false,
}: {
  onRight: () => void;
  onLeft: () => void;
  disabled?: boolean;
}) {
  const rowRef = useRef<HTMLDivElement & HTMLLIElement>(null);
  const swipe = useRef<{ x: number; y: number; id: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [dx, setDx] = useState(0);

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType !== "touch" || disabled) return;
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId, active: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = swipe.current;
    if (!s || e.pointerId !== s.id) return;
    const moveX = e.clientX - s.x;
    const moveY = e.clientY - s.y;
    if (!s.active) {
      // Only claim clearly horizontal drags; vertical ones are page scrolls.
      if (Math.abs(moveY) > 12) {
        swipe.current = null;
        return;
      }
      if (Math.abs(moveX) < 12 || Math.abs(moveX) < Math.abs(moveY) * 1.5) return;
      s.active = true;
      try {
        rowRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already released -- the move handler still works without capture */
      }
    }
    setDx(Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, moveX)));
  }

  function onPointerEnd() {
    const s = swipe.current;
    swipe.current = null;
    if (!s?.active) return;
    suppressClick.current = true;
    const final = dx;
    setDx(0);
    if (final >= SWIPE_TRIGGER) onRight();
    else if (final <= -SWIPE_TRIGGER) onLeft();
  }

  return {
    rowRef,
    dx,
    dir: (dx > 0 ? "right" : dx < 0 ? "left" : undefined) as "right" | "left" | undefined,
    armed: Math.abs(dx) >= SWIPE_TRIGGER,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onClickCapture: (e: React.MouseEvent) => {
        // The finger lifting after a swipe would otherwise also "click" the row.
        if (suppressClick.current) {
          suppressClick.current = false;
          e.stopPropagation();
          e.preventDefault();
        }
      },
    },
  };
}
