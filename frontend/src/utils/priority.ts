import type { Priority } from "../api/types";

// Todoist labels these p1 (most urgent) .. p4 (none), but stores them as 4..1 internally.
export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  4: { label: "Priority 1", color: "#e44332" },
  3: { label: "Priority 2", color: "#e0c419" },
  2: { label: "Priority 3", color: "#299438" },
  1: { label: "Priority 4", color: "#4073ff" },
};

export const PRIORITY_ORDER: Priority[] = [4, 3, 2, 1];
