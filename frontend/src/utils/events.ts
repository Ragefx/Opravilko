import { addMinutes, endOfDay, format, parseISO } from "date-fns";
import { dueDateClass, formatDueLabel } from "./date";
import type { Task } from "../api/types";

/**
 * Events: a task you go to rather than tick off (a date night, a concert).
 * It has everything a task has -- files, comments, reminders, a place,
 * sharing, sub-tasks for the prep -- but no tick: once it's over it leaves
 * the lists by itself (a repeating one rolls on to its next date) and stays
 * on the calendar, greyed. Never overdue, never the focus task, not counted
 * as done work.
 */

/** Violet, apart from the blue of tasks and the teal of trips. */
export const EVENT_COLOR = "#7b4fd6";

/** A timed event without an end time counts as this long. */
const DEFAULT_MINUTES = 60;

export function isEvent(t: Pick<Task, "kind"> | null | undefined): boolean {
  return t?.kind === "event";
}

/** Plain tasks only: what lists of things to do (focus, review, overdue) use. */
export function isTodo(t: Pick<Task, "kind">): boolean {
  return t.kind !== "event";
}

/** When the event starts: its time, or the start of its day when it's all day. */
export function eventStart(t: Task): Date | null {
  if (!t.due) return null;
  return t.due.datetime ? new Date(t.due.datetime) : parseISO(t.due.date);
}

/** When it's over: its end time, an hour after it starts, or the end of its day. */
export function eventEnd(t: Task): Date | null {
  if (!t.due) return null;
  if (!t.due.datetime) return endOfDay(parseISO(t.due.date));
  const start = new Date(t.due.datetime);
  if (t.endTime) {
    const [h, m] = t.endTime.split(":").map(Number);
    const end = new Date(start);
    end.setHours(h, m, 0, 0);
    // "22:00–01:00": it ends after midnight.
    if (end <= start) end.setDate(end.getDate() + 1);
    return end;
  }
  return addMinutes(start, DEFAULT_MINUTES);
}

/** An open event whose time has passed. */
export function eventOver(t: Task, now = new Date()): boolean {
  if (!isEvent(t) || t.completed) return false;
  const end = eventEnd(t);
  return Boolean(end && end <= now);
}

/** "19:30–23:00", "19:30", or "All day". */
export function eventTimeLabel(t: Task): string {
  if (!t.due?.datetime) return "All day";
  const start = format(new Date(t.due.datetime), "HH:mm");
  return t.endTime ? `${start}–${t.endTime}` : start;
}

/** The date line for a task: "Today 19:30–23:00" for an event with an end, else as usual. */
export function taskDueLabel(t: Task): string {
  const label = formatDueLabel(t.due);
  return isEvent(t) && t.due?.datetime && t.endTime ? `${label}–${t.endTime}` : label;
}

/** The date's colour class: an event is never late, just violet. */
export function taskDueClass(t: Task): string {
  return isEvent(t) ? "due-event" : dueDateClass(t.due);
}
