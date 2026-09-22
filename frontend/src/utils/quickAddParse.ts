import type { Due, Priority } from "../api/types";
import { parseNaturalDate } from "./date";
import {
  describeRecurrence,
  initialDueForRecurrence,
  parseNaturalRecurrence,
  serializeRecurrence,
} from "./recurrence";

const PRIORITY_FLAG_RE = /\bp([1-4])\b/i;
// Unicode-aware (so "@služba" isn't cut to "@slu") and anchored to a word
// start, so an email address like "ana@example.com" isn't read as a label.
const LABEL_RE = /(?<=^|\s)@([\p{L}\p{N}_-]+)/gu;
const PROJECT_RE = /(?<=^|\s)#([\p{L}\p{N}_-]+)/gu;

export interface ParsedQuickAdd {
  content: string;
  priority: Priority;
  labels: string[];
  due: Due | null;
  /** Project name typed as #Name, if any -- callers resolve it to an id. */
  projectName: string | null;
}

/**
 * Pulls Todoist-style tokens out of a quick-add string:
 *   "Draft proposal every monday p1 @work #Marketing"
 * Anything left over becomes the task title.
 */
export function parseQuickAddInput(raw: string, defaultDue?: { date: string; string: string } | null): ParsedQuickAdd {
  let content = raw.trim();

  let priority: Priority = 1;
  const pm = content.match(PRIORITY_FLAG_RE);
  if (pm) {
    const typed = parseInt(pm[1], 10); // p1 (urgent) .. p4 (none), as the user types it
    priority = (5 - typed) as Priority; // stored inverted: p1 -> 4 .. p4 -> 1
    content = content.replace(PRIORITY_FLAG_RE, "").trim();
  }

  const labels = [...content.matchAll(LABEL_RE)].map((m) => m[1]);
  content = content.replace(LABEL_RE, "").trim();

  const projectMatches = [...content.matchAll(PROJECT_RE)].map((m) => m[1]);
  const projectName = projectMatches[0] ?? null;
  content = content.replace(PROJECT_RE, "").trim();

  // A date typed into the text wins over the view's default (e.g. typing
  // "tomorrow" into Today's quick add), matching Todoist.
  let due: Due | null = null;
  const recurrence = parseNaturalRecurrence(content);
  if (recurrence) {
    content = content.replace(recurrence.matchedText, "").trim();
    due = {
      date: initialDueForRecurrence(recurrence.rule),
      string: describeRecurrence(recurrence.rule),
      isRecurring: true,
      rrule: serializeRecurrence(recurrence.rule),
    };
  } else {
    const parsed = parseNaturalDate(content);
    due = parsed.due;
    content = parsed.remaining;
  }
  if (!due && defaultDue) due = { ...defaultDue, isRecurring: false };

  return {
    content: content.replace(/\s+/g, " ").trim(),
    priority,
    labels,
    due,
    projectName,
  };
}
