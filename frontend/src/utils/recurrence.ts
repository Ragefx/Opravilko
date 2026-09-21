import { addDays, addMonths, format, getDay, parseISO, startOfDay } from "date-fns";
import type { Due } from "../api/types";

export type RecurrenceFreq = "daily" | "weekly" | "monthly" | "weekdays" | "every_n_days";

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  interval?: number; // used by every_n_days
  byDay?: number[]; // 0=Sun..6=Sat, used by weekly to pin to specific day(s)
}

const WEEKDAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function serializeRecurrence(rule: RecurrenceRule): string {
  return JSON.stringify(rule);
}

export function parseRecurrenceString(str: string | undefined): RecurrenceRule | null {
  if (!str) return null;
  try {
    return JSON.parse(str) as RecurrenceRule;
  } catch {
    return null;
  }
}

export function describeRecurrence(rule: RecurrenceRule | null): string {
  if (!rule) return "";
  switch (rule.freq) {
    case "daily":
      return "Every day";
    case "weekdays":
      return "Every weekday";
    case "weekly":
      if (rule.byDay && rule.byDay.length === 1) {
        return `Every ${format(new Date(2026, 0, 4 + rule.byDay[0]), "EEEE")}`;
      }
      return "Every week";
    case "monthly":
      return "Every month";
    case "every_n_days":
      return `Every ${rule.interval || 1} days`;
    default:
      return "";
  }
}

/** Advances a "yyyy-MM-dd" date string forward according to the rule. */
export function advanceDate(dateStr: string, rule: RecurrenceRule): string {
  let d = parseISO(dateStr);
  switch (rule.freq) {
    case "daily":
      d = addDays(d, 1);
      break;
    case "every_n_days":
      d = addDays(d, Math.max(1, rule.interval || 1));
      break;
    case "monthly":
      d = addMonths(d, 1);
      break;
    case "weekdays": {
      d = addDays(d, 1);
      while (getDay(d) === 0 || getDay(d) === 6) d = addDays(d, 1);
      break;
    }
    case "weekly":
    default: {
      d = addDays(d, 7);
      break;
    }
  }
  return format(d, "yyyy-MM-dd");
}

/** Picks the first date (today or later) that satisfies the rule, as "yyyy-MM-dd". */
export function initialDueForRecurrence(rule: RecurrenceRule): string {
  let d = startOfDay(new Date());
  if (rule.freq === "weekdays") {
    while (getDay(d) === 0 || getDay(d) === 6) d = addDays(d, 1);
  } else if (rule.freq === "weekly" && rule.byDay && rule.byDay.length === 1) {
    const target = rule.byDay[0];
    while (getDay(d) !== target) d = addDays(d, 1);
  }
  return format(d, "yyyy-MM-dd");
}

/**
 * Layers a picked recurrence frequency onto a due date built from quick-add
 * text. If the text already set its own recurrence (typed "every monday"),
 * that wins. Otherwise reuses the typed date/time when there is one, or
 * picks the rule's own first matching date.
 */
export function applyRecurrence(due: Due | null, freq: RecurrenceFreq | "none"): Due | null {
  if (freq === "none" || due?.isRecurring) return due;
  const rule: RecurrenceRule = { freq };
  const date = due?.date ?? initialDueForRecurrence(rule);
  return {
    date,
    datetime: due?.datetime,
    string: describeRecurrence(rule),
    isRecurring: true,
    rrule: serializeRecurrence(rule),
  };
}

/** Detects phrases like "every day", "every weekday", "every monday", "every 3 days" in quick-add text. */
export function parseNaturalRecurrence(text: string): { rule: RecurrenceRule; matchedText: string } | null {
  const everyNDays = text.match(/\bevery (\d+) days?\b/i);
  if (everyNDays) {
    return { rule: { freq: "every_n_days", interval: parseInt(everyNDays[1], 10) }, matchedText: everyNDays[0] };
  }

  if (/\bevery weekday\b/i.test(text)) {
    const m = text.match(/\bevery weekday\b/i)!;
    return { rule: { freq: "weekdays" }, matchedText: m[0] };
  }

  if (/\bevery day\b|\bdaily\b/i.test(text)) {
    const m = text.match(/\bevery day\b|\bdaily\b/i)!;
    return { rule: { freq: "daily" }, matchedText: m[0] };
  }

  if (/\bevery month\b|\bmonthly\b/i.test(text)) {
    const m = text.match(/\bevery month\b|\bmonthly\b/i)!;
    return { rule: { freq: "monthly" }, matchedText: m[0] };
  }

  const weekdayRe = new RegExp(`\\bevery (${WEEKDAY_NAMES.join("|")})[a-z]*\\b`, "i");
  const wm = text.match(weekdayRe);
  if (wm) {
    const idx = WEEKDAY_NAMES.indexOf(wm[1].toLowerCase());
    return { rule: { freq: "weekly", byDay: [idx] }, matchedText: wm[0] };
  }

  if (/\bevery week\b|\bweekly\b/i.test(text)) {
    const m = text.match(/\bevery week\b|\bweekly\b/i)!;
    return { rule: { freq: "weekly" }, matchedText: m[0] };
  }

  return null;
}
