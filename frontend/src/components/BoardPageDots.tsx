import { useEffect, useState, type RefObject } from "react";

/**
 * Phone boards show one column per "page" (swipe left/right, snapping), like
 * Todoist; these dots under the board say which column you're on, and tapping
 * one jumps to it. `withAdd` makes the last page (the "Add section" column) a +.
 * Hidden on wider screens by CSS, where all columns sit side by side.
 */
export default function BoardPageDots({
  scrollRef,
  count,
  withAdd = false,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  count: number;
  withAdd?: boolean;
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setActive(currentPage(el));
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [scrollRef, count]);

  if (count < 2) return null;

  function goTo(index: number) {
    const el = scrollRef.current;
    const col = el && pages(el)[index];
    if (!el || !col) return;
    el.scrollTo({ left: col.offsetLeft - paddingLeft(el), behavior: "smooth" });
  }

  return (
    <div className="board-page-dots" role="tablist" aria-label="Board columns">
      {Array.from({ length: count }, (_, i) => {
        const isAdd = withAdd && i === count - 1;
        return (
          <button
            key={i}
            role="tab"
            aria-selected={i === active}
            aria-label={isAdd ? "Add section" : `Column ${i + 1} of ${withAdd ? count - 1 : count}`}
            className={`board-page-dot ${isAdd ? "is-add" : ""} ${i === active ? "is-active" : ""}`}
            onClick={() => goTo(i)}
          >
            {isAdd ? "+" : null}
          </button>
        );
      })}
    </div>
  );
}

function pages(el: HTMLElement): HTMLElement[] {
  const board = el.querySelector(".board");
  return board ? (Array.from(board.children) as HTMLElement[]) : [];
}

function paddingLeft(el: HTMLElement): number {
  return parseFloat(getComputedStyle(el).paddingLeft) || 0;
}

/** The column whose left edge is nearest the scroll position. */
function currentPage(el: HTMLElement): number {
  const cols = pages(el);
  // Columns' offsetLeft is measured from .board-scroll (position: relative).
  const at = el.scrollLeft + paddingLeft(el);
  let best = 0;
  let bestDist = Infinity;
  cols.forEach((c, i) => {
    const dist = Math.abs(c.offsetLeft - at);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  // Scrolled all the way right: the last page, even if it can't reach the left edge.
  if (cols.length && el.scrollLeft + el.clientWidth >= el.scrollWidth - 2) best = cols.length - 1;
  return best;
}
