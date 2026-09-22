import { LocalNotifications } from "@capacitor/local-notifications";
import type { Task } from "../api/types";
import { isNativeApp } from "../dropbox/auth";

const ENABLED_KEY = "opravilko.reminders";
const FIRED_KEY = "opravilko.reminders.fired";
/** Window event fired when reminders are switched on or off. */
export const REMINDERS_CHANGED = "opravilko:reminders-changed";

export function remindersSupported(): boolean {
  return isNativeApp || (typeof window !== "undefined" && "Notification" in window);
}

export function remindersEnabled(): boolean {
  if (!remindersSupported()) return false;
  // In the app, Android's permission is checked when reminders are turned on
  // (and scheduling simply does nothing if it's later revoked).
  if (!isNativeApp && Notification.permission !== "granted") return false;
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export async function enableReminders(): Promise<boolean> {
  if (!remindersSupported()) return false;
  if (isNativeApp) {
    const { display } = await LocalNotifications.requestPermissions();
    if (display !== "granted") return false;
  } else {
    const permission =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") return false;
  }
  try {
    localStorage.setItem(ENABLED_KEY, "1");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(REMINDERS_CHANGED));
  return true;
}

export function disableReminders(): void {
  try {
    localStorage.removeItem(ENABLED_KEY);
  } catch {
    /* ignore */
  }
  if (isNativeApp) void cancelScheduledReminders();
  window.dispatchEvent(new Event(REMINDERS_CHANGED));
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

// ---- Android app: reminders scheduled with the OS ----
// Unlike the website, the app can hand reminders to Android ahead of time, so
// they fire even when the app is closed. The schedule is rebuilt from the
// tasks whenever they change.

const MAX_SCHEDULED = 60;
const LOOKAHEAD_MS = 30 * 24 * 60 * 60 * 1000;

/** Android notification ids are 32-bit ints; derive a stable one per reminder. */
function notificationId(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
}

async function cancelScheduledReminders(): Promise<void> {
  const { notifications } = await LocalNotifications.getPending();
  if (notifications.length) {
    await LocalNotifications.cancel({ notifications: notifications.map((n) => ({ id: n.id })) });
  }
}

export async function syncNativeReminders(tasks: Task[]): Promise<void> {
  if (!isNativeApp) return;
  await cancelScheduledReminders();
  if (!remindersEnabled()) return;

  const now = Date.now();
  const upcoming = tasks
    .filter((t) => !t.completed && t.due?.datetime)
    .map((t) => {
      const dueAt = new Date(t.due!.datetime!).getTime();
      const lead = t.reminderMinutes ?? 0;
      return { task: t, dueAt, lead, at: dueAt - lead * 60 * 1000 };
    })
    .filter((r) => r.at > now && r.at - now < LOOKAHEAD_MS)
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_SCHEDULED);
  if (!upcoming.length) return;

  await LocalNotifications.schedule({
    notifications: upcoming.map(({ task, dueAt, lead, at }) => {
      const when = new Date(dueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return {
        id: notificationId(`${task.id}@${task.due!.datetime}@${lead}`),
        title: task.content,
        body: lead ? `Due at ${when}` : "Due now",
        schedule: { at: new Date(at), allowWhileIdle: true },
        extra: { taskId: task.id },
      };
    }),
  });
}
