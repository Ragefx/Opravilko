import type { Task } from "../api/types";

const ENABLED_KEY = "opravilko.reminders";
const FIRED_KEY = "opravilko.reminders.fired";

export function remindersSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function remindersEnabled(): boolean {
  if (!remindersSupported() || Notification.permission !== "granted") return false;
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export async function enableReminders(): Promise<boolean> {
  if (!remindersSupported()) return false;
  const permission =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return false;
  try {
    localStorage.setItem(ENABLED_KEY, "1");
  } catch {
    /* ignore */
  }
  return true;
}

export function disableReminders(): void {
  try {
    localStorage.removeItem(ENABLED_KEY);
  } catch {
    /* ignore */
  }
}

/** Ids already notified about, so a reminder doesn't repeat every check. */
function firedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function rememberFired(ids: Set<string>): void {
  try {
    // Cap the list so it can't grow without bound.
    localStorage.setItem(FIRED_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    /* ignore */
  }
}

/**
 * Fires a notification for any task whose due *time* has arrived. All-day tasks
 * are skipped deliberately -- a date with no time would otherwise fire at
 * midnight, which is noise rather than a reminder.
 */
export function checkDueReminders(tasks: Task[]): void {
  if (!remindersEnabled()) return;

  const now = Date.now();
  const fired = firedIds();
  let changed = false;

  for (const task of tasks) {
    if (task.completed || !task.due?.datetime) continue;
    const lead = task.reminderMinutes ?? 0;
    // Key on the timestamp and lead time too, so a rescheduled or recurring
    // task (or a changed reminder) notifies again.
    const key = `${task.id}@${task.due.datetime}@${lead}`;
    if (fired.has(key)) continue;

    const dueAt = new Date(task.due.datetime).getTime();
    const remindAt = dueAt - lead * 60 * 1000;
    // Only fire for times that have just passed, not a backlog of old ones.
    if (remindAt <= now && now - remindAt < 10 * 60 * 1000) {
      const when = new Date(dueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      new Notification(task.content, { body: `${lead ? `Due at ${when}` : "Due now"} · Opravilko`, tag: key });
      fired.add(key);
      changed = true;
    }
  }

  if (changed) rememberFired(fired);
}
