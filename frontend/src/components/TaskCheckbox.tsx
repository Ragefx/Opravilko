import { CheckIcon } from "./icons";

/**
 * Shared completion circle used in list rows, board cards and the sub-task list.
 * `popping`: it's being ticked right now (see useCompleteAnimation) -- the
 * circle fills and pops while the rest of the tick plays out.
 */
export default function TaskCheckbox({
  completed,
  priorityColor,
  popping,
  onToggle,
  ariaLabel,
}: {
  completed: boolean;
  priorityColor: string;
  popping?: boolean;
  /** Kept for callers that still pass it; the tick animation covers repeats now. */
  recurring?: boolean;
  onToggle: (next: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <button
      className={`task-checkbox ${completed ? "checked" : ""} ${popping ? "is-popping" : ""}`}
      style={{ ["--priority-color" as any]: priorityColor }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (popping) return;
        onToggle(!completed);
      }}
      aria-label={ariaLabel || (completed ? "Mark incomplete" : "Mark complete")}
    >
      <CheckIcon />
    </button>
  );
}
