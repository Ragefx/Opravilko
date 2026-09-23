import { useRef, useState } from "react";
import type { Due } from "../api/types";
import { formatDueLabel } from "../utils/date";
import DatePickerPopup from "./DatePickerPopup";
import { CalendarIcon } from "./icons";

/**
 * The "Date" button of an Add task box: opens the full date picker and hands
 * the chosen date back. Shows the date that will be used -- picked here, or
 * typed in the text ("jutri"), or the box's default.
 */
export default function DueButton({
  shown,
  picked,
  onPick,
}: {
  /** The date the task would get right now. */
  shown: Due | null;
  /** What was picked here: undefined if nothing, null for "No date". */
  picked: Due | null | undefined;
  onPick: (due: Due | null) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);

  function open() {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    // Below the button, or above it when there's no room underneath.
    const top = r.bottom + 440 > window.innerHeight ? Math.max(8, r.top - 440) : r.bottom + 4;
    setAnchor({ top, right: Math.max(8, window.innerWidth - r.right) });
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`field-pill due-button ${shown ? "has-date" : ""}`}
        onClick={open}
        title="Pick a date"
      >
        <CalendarIcon width={14} height={14} />
        {shown ? formatDueLabel(shown) : "Date"}
      </button>
      {anchor && (
        <DatePickerPopup
          value={picked === undefined ? shown : picked}
          onPick={onPick}
          anchor={anchor}
          onClose={() => setAnchor(null)}
        />
      )}
    </>
  );
}
