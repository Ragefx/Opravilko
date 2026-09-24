import { useEffect, useRef, useState } from "react";

/** How long each step of the tick takes (ms): the circle pops, the line strikes through, the row folds away. */
const POP = 180;
const STRIKE = 380;
const FOLD = 260;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Completing a task with a little ceremony: the circle fills and pops, a line
 * strikes through the name, then the row folds away -- and only then is the
 * task actually marked done. A repeating task isn't folded away (it stays,
 * with its next date), so it only gets the pop and the strike.
 *
 * `phase` drives the CSS classes; pass the element to fold as `foldRef`.
 */
export function useCompleteAnimation() {
  const [phase, setPhase] = useState<"idle" | "striking" | "folding">("idle");
  const foldRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  function play(done: () => void, { fold }: { fold: boolean }) {
    if (phase !== "idle") return;
    if (reducedMotion()) {
      done();
      return;
    }
    setPhase("striking");
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    if (!fold) {
      at(POP + STRIKE, () => {
        done();
        setPhase("idle");
      });
      return;
    }
    at(POP + STRIKE, () => {
      // Fold from the row's real height down to nothing.
      const el = foldRef.current;
      if (el) {
        el.style.maxHeight = `${el.offsetHeight}px`;
        void el.offsetHeight;
      }
      setPhase("folding");
    });
    at(POP + STRIKE + FOLD, () => {
      done();
      // If the row stays (e.g. "Completed tasks" shown), let it unfold again.
      const el = foldRef.current;
      if (el) el.style.maxHeight = "";
      setPhase("idle");
    });
  }

  return { phase, play, foldRef, busy: phase !== "idle" };
}
