import { useSyncExternalStore } from "react";
import { format } from "date-fns";
import type { AppData } from "../api/types";

/**
 * Completed tasks on the calendars (Settings > Appearance): each on the day
 * it was ticked off, greyed with a ✓ -- yours from your completion history,
 * and shared ones either of you finished while they're still loaded. Kept per
 * device; on unless switched off. The phone's widget gets the same list.
 */
const KEY = "opravilko.calendarDone";
export const CALENDAR_DONE_CHANGED = "opravilko:calendar-done";

export function calendarDoneOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setCalendarDoneOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CALENDAR_DONE_CHANGED));
}

export function useCalendarDone(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(CALENDAR_DONE_CHANGED, cb);
      return () => window.removeEventListener(CALENDAR_DONE_CHANGED, cb);
    },
    calendarDoneOn,
    calendarDoneOn
  );
}

export interface DoneEntry {
  taskId: string;
  content: string;
  /** When it was ticked off (ISO). */
  at: string;
  /** Local day it was ticked off. */
  day: string;
}

/** Completed tasks by the day they were done, newest first within a day. */
export function doneByDay(data: AppData | undefined, since?: string): Map<string, DoneEntry[]> {
  const map = new Map<string, DoneEntry[]>();
  if (!data) return map;
  const seen = new Set<string>();
  const add = (taskId: string, content: string, at: string) => {
    const key = `${taskId}@${at}`;
    if (seen.has(key) || !at) return;
    seen.add(key);
    const day = format(new Date(at), "yyyy-MM-dd");
    if (since && day < since) return;
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push({ taskId, content, at, day });
  };
  for (const e of data.completionLog ?? []) add(e.taskId, e.content, e.at);
  for (const t of data.tasks) if (t.completed && t.completedAt) add(t.id, t.content, t.completedAt);
  for (const list of map.values()) list.sort((a, b) => b.at.localeCompare(a.at));
  return map;
}
