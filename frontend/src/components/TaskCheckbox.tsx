import { useEffect, useState } from "react";
import { CheckIcon } from "./icons";

/**
 * Shared completion circle used in list rows, board cards and the sub-task list.
 *
 * Completing a recurring task advances its due date instead of marking it
 * done (so it keeps recurring rather than disappearing) -- see useCompleteTask.
 * That means `completed` never flips to true for a recurring task, so a click
 * on it would otherwise show no feedback at all and just silently change the
 * due date. `recurring` lets us flash the checkmark for a moment so the click
 * still reads as "completed" before the row reappears with its next date.
 */
export default function TaskCheckbox({
  completed,
  priorityColor,
  recurring,
  onToggle,
  ariaLabel,
}: {
  completed: boolean;
  priorityColor: string;
  recurring?: boolean;
  onToggle: (next: boolean) => void;
  ariaLabel?: string;
}) {
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 500);
    return () => clearTimeout(t);
  }, [flash]);

  const checked = completed || flash;

  return (
    <button
      className={`task-checkbox ${checked ? "checked" : ""}`}
      style={{ ["--priority-color" as any]: priorityColor }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (!completed && recurring) setFlash(true);
        onToggle(!completed);
      }}
      aria-label={ariaLabel || (completed ? "Mark incomplete" : "Mark complete")}
    >
      <CheckIcon />
    </button>
  );
}
