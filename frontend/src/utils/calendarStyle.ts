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

/** A task's first word, or its first two when they're short ("Nejc žur"), for a day square (as in the widget). */
export function shortLabel(content: string): string {
  const words = content.trim().split(/\s+/);
  if (!words[0]) return content.trim();
  let label = words[0];
  if (words.length > 1 && words[1].length >= 3 && label.length + 1 + words[1].length <= 12) label += " " + words[1];
  return label;
}
