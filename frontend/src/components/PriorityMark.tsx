import type { Priority } from "../api/types";

const MARKS: Record<Priority, string> = { 4: "!!!", 3: "!!", 2: "!", 1: "" };

/**
 * Priority as exclamation marks (p1 = "!!!") -- the Soča look's replacement
 * for colored checkbox rings. Hidden by CSS in the classic look.
 */
export default function PriorityMark({ priority }: { priority: Priority }) {
  if (priority === 1) return null;
  return (
    <span className={`prio-mark prio-mark-${priority}`} aria-label={`Priority ${5 - priority}`} title={`Priority ${5 - priority}`}>
      {MARKS[priority]}
    </span>
  );
}
