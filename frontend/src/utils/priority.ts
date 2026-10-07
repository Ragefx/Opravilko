import { tr } from "../i18n";
import type { Priority } from "../api/types";

// Three levels, p1 (most urgent) .. p3, plus none; stored as 4..2, and 1 for none (as Todoist does).
export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  4: { label: tr("Priority 1", "Prednost 1"), color: "#e44332" },
  3: { label: tr("Priority 2", "Prednost 2"), color: "#e0c419" },
  2: { label: tr("Priority 3", "Prednost 3"), color: "#299438" },
  1: { label: tr("No priority", "Brez prednosti"), color: "#c5c5c5" },
};

export const PRIORITY_ORDER: Priority[] = [4, 3, 2, 1];
