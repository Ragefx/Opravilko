import type { Priority } from "../api/types";

// Three levels, p1 (most urgent) .. p3, plus none; stored as 4..2, and 1 for none (as Todoist does).
export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  4: { label: "Priority 1", color: "#e44332" },
  3: { label: "Priority 2", color: "#e0c419" },
  2: { label: "Priority 3", color: "#299438" },
  1: { label: "No priority", color: "#c5c5c5" },
};

export const PRIORITY_ORDER: Priority[] = [4, 3, 2, 1];
