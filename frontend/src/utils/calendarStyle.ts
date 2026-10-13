import { useSyncExternalStore } from "react";

/**
 * The app's calendar (Settings > Appearance): "dots" -- day numbers with a
 * dot per task -- or "squares", the whole month as boxes with the tasks
 * written in them, like the widget. Kept per device; dots unless set.
 */
export type CalendarStyle = "dots" | "squares";
const KEY = "opravilko.calendarStyle";
const listeners = new Set<() => void>();

export function calendarStyle(): CalendarStyle {
  try {
    return localStorage.getItem(KEY) === "squares" ? "squares" : "dots";
  } catch {
    return "dots";
  }
}

export function setCalendarStyle(style: CalendarStyle): void {
  try {
    localStorage.setItem(KEY, style);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useCalendarStyle(): CalendarStyle {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    calendarStyle,
    calendarStyle,
  );
}

/** A task's name for a day square: all of it, cut off at the square's edge with no "…" (as in the widget). */
export function shortLabel(content: string): string {
  return content.trim().replace(/\s+/g, " ");
}
