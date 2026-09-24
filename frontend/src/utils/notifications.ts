import { LocalNotifications } from "@capacitor/local-notifications";
import type { Task } from "../api/types";
import { isNativeApp } from "../dropbox/auth";
import { isMine, reminderTime, remindersOf } from "./reminders";

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
    // The app notifies unless switched off; the website only once switched on.
    const v = localStorage.getItem(ENABLED_KEY);
    return isNativeApp ? v !== "0" : v === "1";
  } catch {
    return isNativeApp;
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
    if (isNativeApp) localStorage.setItem(ENABLED_KEY, "0");
    else localStorage.removeItem(ENABLED_KEY);
  } catch {
    /* ignore */
  }
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
 * Website: fires a notification for any of my reminders whose time has just
 * arrived (only while the tab is open). The Android app schedules its own,
 * natively, from the widget's copy of the tasks.
 */
export function checkDueReminders(tasks: Task[], me?: string): void {
  if (!remindersEnabled()) return;

  const now = Date.now();
  const fired = firedIds();
  let changed = false;

  for (const task of tasks) {
    if (task.completed) continue;
    for (const r of remindersOf(task)) {
      if (!isMine(r, me)) continue;
      const at = reminderTime(task.due, r);
      if (!at) continue;
      // Key on the time too, so a rescheduled or repeating task notifies again.
      const key = `${task.id}@${r.id}@${at.getTime()}`;
      if (fired.has(key)) continue;
      const remindAt = at.getTime();
      // Only fire for times that have just passed, not a backlog of old ones.
      if (remindAt <= now && now - remindAt < 10 * 60 * 1000) {
        const when = task.due?.datetime
          ? `Due ${new Date(task.due.datetime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
          : "Due today";
        new Notification(task.content, { body: `${when} · Opravilko`, tag: key });
        fired.add(key);
        changed = true;
      }
    }
  }

  if (changed) rememberFired(fired);
}

// ---- Android app ----
// Reminders are scheduled natively (ReminderScheduler.java) from the tasks the
// app hands the widget, so they also follow changes made on the website while
// the app is closed. Earlier versions scheduled them from here; clear those once.

const OLD_CLEARED_KEY = "opravilko.reminders.oldCleared";

async function cancelScheduledReminders(): Promise<void> {
  const { notifications } = await LocalNotifications.getPending();
  if (notifications.length) {
    await LocalNotifications.cancel({ notifications: notifications.map((n) => ({ id: n.id })) });
  }
}

export function clearOldAppReminders(): void {
  if (!isNativeApp) return;
  try {
    if (localStorage.getItem(OLD_CLEARED_KEY)) return;
    localStorage.setItem(OLD_CLEARED_KEY, "1");
  } catch {
    return;
  }
  void cancelScheduledReminders().catch(() => {});
}
