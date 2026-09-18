import {
  addDays,
  format,
  isBefore,
  isToday,
  isTomorrow,
  parseISO,
  startOfDay,
} from "date-fns";
import type { Due } from "../api/types";

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function makeDue(date: Date, text: string): Due {
  return {
    date: format(date, "yyyy-MM-dd"),
    string: text,
    isRecurring: false,
  };
}

export function isOverdue(due: Due | null): boolean {
  if (!due) return false;
  return isBefore(parseISO(due.date), startOfDay(new Date())) && !isToday(parseISO(due.date));
}

export function isDueToday(due: Due | null): boolean {
  if (!due) return false;
  return isToday(parseISO(due.date));
}

export function isDueWithinDays(due: Due | null, days: number): boolean {
  if (!due) return false;
  const d = startOfDay(parseISO(due.date));
  const today = startOfDay(new Date());
  const limit = addDays(today, days);
  return d >= today && d <= limit;
}

export function formatDueLabel(due: Due | null): string {
  if (!due) return "";
  const d = parseISO(due.date);
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  if (isBefore(d, startOfDay(new Date()))) return format(d, "MMM d");
  return format(d, "MMM d");
}

/** Very small natural-language date parser for quick-add ("today", "tomorrow", "mon", "in 3 days", "9/20"). */
export function parseNaturalDate(text: string): { due: Due | null; remaining: string } {
  const patterns: { re: RegExp; toDate: (m: RegExpMatchArray) => Date }[] = [
    { re: /\btoday\b/i, toDate: () => new Date() },
    { re: /\btomorrow\b/i, toDate: () => addDays(new Date(), 1) },
    {
      re: /\bin (\d+) days?\b/i,
      toDate: (m) => addDays(new Date(), parseInt(m[1], 10)),
    },
  ];
  const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const weekdayRe = new RegExp(`\\b(${weekdays.join("|")})[a-z]*\\b`, "i");

  for (const p of patterns) {
    const m = text.match(p.re);
    if (m) {
      const date = p.toDate(m);
      return { due: makeDue(date, m[0]), remaining: text.replace(p.re, "").trim() };
    }
  }

  const wm = text.match(weekdayRe);
  if (wm) {
    const targetIdx = weekdays.indexOf(wm[1].toLowerCase());
    const now = new Date();
    let diff = (targetIdx - now.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    const date = addDays(now, diff);
    return { due: makeDue(date, wm[0]), remaining: text.replace(weekdayRe, "").trim() };
  }

  return { due: null, remaining: text };
}
