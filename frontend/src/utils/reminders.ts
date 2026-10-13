import { nanoid } from "nanoid";
import { addDays, parseISO } from "date-fns";
import { format, tr, trn } from "../i18n";
import type { Due, Reminder, Task } from "../api/types";

/**
 * Reminders on tasks. The Android app notifies (scheduled natively from the
 * widget's copy of the tasks, so ones set on the website reach the phone too);
 * the website only notifies while open, and only if switched on there.
 */

/** A reminder without its id and owner (what a preset or the day-and-time form makes). */
export type ReminderSpec = Reminder extends infer R ? (R extends Reminder ? Omit<R, "id" | "by"> : never) : never;

/** A task's reminders, including the older single `reminderMinutes` one. */
export function remindersOf(task: Pick<Task, "reminders" | "reminderMinutes" | "due">): Reminder[] {
  if (task.reminders) return task.reminders;
  if (task.reminderMinutes !== undefined && task.due?.datetime) {
    return [{ id: "legacy", type: "relative", minutes: task.reminderMinutes }];
  }
  return [];
}

/** When a reminder goes off for the task's current due date, or null if it can't (no date / no time). */
export function reminderTime(due: Due | null | undefined, r: Reminder): Date | null {
  if (r.type === "absolute") {
    const d = new Date(r.at);
    return isNaN(d.getTime()) ? null : d;
  }
  if (r.type === "relative") {
    if (!due?.datetime) return null;
    return new Date(new Date(due.datetime).getTime() - r.minutes * 60_000);
  }
  if (!due?.date) return null;
  const [h, m] = r.time.split(":").map(Number);
  const day = addDays(parseISO(due.date), -r.days);
  day.setHours(h || 0, m || 0, 0, 0);
  return day;
}

function leadText(minutes: number): string {
  if (minutes === 0) return tr("At the due time", "Ob času naloge");
  if (minutes % 1440 === 0)
    return trn(minutes / 1440, ["# day before", "# days before"], ["# dan prej", "# dni prej", "# dni prej", "# dni prej"]);
  if (minutes % 60 === 0) return tr(`${minutes / 60} h before`, `${minutes / 60} h prej`);
  return tr(`${minutes} min before`, `${minutes} min prej`);
}

/** "15 min before", "Day before at 18:00", "Fri 3 Oct, 14:30". */
export function describeReminder(r: Reminder): string {
  if (r.type === "relative") return leadText(r.minutes);
  if (r.type === "day") {
    if (r.days === 0) return tr(`On the day at ${r.time}`, `Na dan ob ${r.time}`);
    if (r.days === 1) return tr(`Day before at ${r.time}`, `Dan prej ob ${r.time}`);
    return tr(`${r.days} days before at ${r.time}`, `${r.days} dni prej ob ${r.time}`);
  }
  const d = new Date(r.at);
  return isNaN(d.getTime()) ? tr("Reminder", "Opomnik") : format(d, tr("EEE d MMM, HH:mm", "EEE, d. MMM, HH:mm"));
}

/** Short form for chips: "15m", "9:00", "3 Oct 14:30". */
export function shortReminder(r: Reminder): string {
  if (r.type === "relative") {
    if (r.minutes === 0) return tr("At time", "Ob času");
    if (r.minutes % 1440 === 0) return tr(`${r.minutes / 1440}d before`, `${r.minutes / 1440} d prej`);
    if (r.minutes % 60 === 0) return tr(`${r.minutes / 60}h before`, `${r.minutes / 60} h prej`);
    return tr(`${r.minutes}m before`, `${r.minutes} min prej`);
  }
  if (r.type === "day")
    return r.days === 0 ? r.time : r.days === 1 ? tr(`Day before ${r.time}`, `Dan prej ${r.time}`) : tr(`${r.days}d before ${r.time}`, `${r.days} d prej ${r.time}`);
  const d = new Date(r.at);
  return isNaN(d.getTime()) ? tr("Reminder", "Opomnik") : format(d, tr("d MMM HH:mm", "d. MMM HH:mm"));
}

export type ReminderPreset = { key: string; label: string; make: () => ReminderSpec };

export const TIMED_PRESETS: ReminderPreset[] = [0, 15, 30, 60, 120, 1440].map((minutes) => ({
  key: `rel:${minutes}`,
  label: leadText(minutes),
  make: () => ({ type: "relative", minutes }),
}));

export const DAY_PRESETS: ReminderPreset[] = [
  { key: "day:0:09:00", label: tr("On the day at 9:00", "Na dan ob 9:00"), make: () => ({ type: "day", days: 0, time: "09:00" }) },
  { key: "day:0:18:00", label: tr("On the day at 18:00", "Na dan ob 18:00"), make: () => ({ type: "day", days: 0, time: "18:00" }) },
  { key: "day:1:18:00", label: tr("Day before at 18:00", "Dan prej ob 18:00"), make: () => ({ type: "day", days: 1, time: "18:00" }) },
];

/** The same reminder already on the list (so a preset isn't added twice). */
export function sameReminder(a: ReminderSpec, b: ReminderSpec): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "relative" && b.type === "relative") return a.minutes === b.minutes;
  if (a.type === "day" && b.type === "day") return a.days === b.days && a.time === b.time;
  if (a.type === "absolute" && b.type === "absolute") return new Date(a.at).getTime() === new Date(b.at).getTime();
  return false;
}

export function newReminder(spec: ReminderSpec, by?: string): Reminder {
  return { ...(spec as Reminder), id: nanoid(8), ...(by ? { by } : {}) };
}

// ---- Defaults for new tasks (Settings, per device; none unless picked) ----

const DEFAULT_TIMED_KEY = "opravilko.reminders.defaultTimed";
const DEFAULT_ALLDAY_KEY = "opravilko.reminders.defaultAllDay";

export const TIMED_DEFAULT_OPTIONS: [string, string][] = [
  ["none", tr("None", "Brez")],
  ["rel:0", tr("At the due time", "Ob času naloge")],
  ["rel:15", tr("15 min before", "15 min prej")],
  ["rel:30", tr("30 min before", "30 min prej")],
  ["rel:60", tr("1 h before", "1 h prej")],
];

export const ALLDAY_DEFAULT_OPTIONS: [string, string][] = [
  ["none", tr("None", "Brez")],
  ["day:0:09:00", tr("On the day at 9:00", "Na dan ob 9:00")],
  ["day:1:18:00", tr("Day before at 18:00", "Dan prej ob 18:00")],
];

function read(key: string): string {
  try {
    return localStorage.getItem(key) || "none";
  } catch {
    return "none";
  }
}

export function reminderDefaults(): { timed: string; allDay: string } {
  return { timed: read(DEFAULT_TIMED_KEY), allDay: read(DEFAULT_ALLDAY_KEY) };
}

export function setReminderDefault(kind: "timed" | "allDay", value: string): void {
  try {
    const key = kind === "timed" ? DEFAULT_TIMED_KEY : DEFAULT_ALLDAY_KEY;
    if (value === "none") localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function specFromKey(key: string): ReminderSpec | null {
  const rel = /^rel:(\d+)$/.exec(key);
  if (rel) return { type: "relative", minutes: Number(rel[1]) };
  const day = /^day:(\d+):(\d\d:\d\d)$/.exec(key);
  if (day) return { type: "day", days: Number(day[1]), time: day[2] };
  return null;
}

/** The reminder a new task gets from this device's defaults (none unless set in Settings). */
export function defaultReminders(due: Due | null | undefined, by?: string): Reminder[] {
  if (!due?.date) return [];
  const { timed, allDay } = reminderDefaults();
  const spec = specFromKey(due.datetime ? timed : allDay);
  return spec ? [newReminder(spec, by)] : [];
}

/** Reminders that are mine to be notified about: set by me, or with no owner (Dropbox, older ones). */
export function isMine(r: Reminder, me: string | undefined): boolean {
  return !r.by || !me || r.by === me;
}

/** The next reminder still to go off on a task (for the bell on the row), or null. */
export function nextReminder(task: Task, me?: string): Date | null {
  if (task.completed) return null;
  const now = Date.now();
  let best: Date | null = null;
  for (const r of remindersOf(task)) {
    if (!isMine(r, me)) continue;
    const t = reminderTime(task.due, r);
    if (t && t.getTime() > now && (!best || t < best)) best = t;
  }
  return best;
}
