import type { Meal } from "../utils/shopping";

export type Priority = 1 | 2 | 3 | 4;

export interface Due {
  date: string;
  datetime?: string;
  string: string;
  isRecurring: boolean;
  rrule?: string;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  order: number;
  isFavorite: boolean;
  isInboxProject?: boolean;
  parentId: string | null;
  viewStyle?: "list" | "board" | "calendar" | "shopping";
  /** Shopping lists: your own and edited meals, shared by everyone on the list. */
  meals?: Meal[];
  /** Shopping lists: how often each thing was ticked off ("usual items"), by lower-case name. */
  bought?: Record<string, { name: string; n: number }>;
  /** Shopping lists: the shops items can be marked for (SPAR, Hofer, Lidl unless changed). */
  stores?: string[];
  /** Firebase only: who created it and who can see it (see firebase/sync.ts). */
  ownerId?: string;
  members?: string[];
  memberProfiles?: Record<string, MemberProfile>;
}

/** The one person tasks are shared with by the "Shared" switch ("Midva"). */
export interface Partner {
  uid: string;
  name: string;
  email: string;
  photo?: string | null;
}

export interface MemberProfile {
  name: string;
  email: string;
  photo?: string | null;
}

export interface Section {
  id: string;
  projectId: string;
  name: string;
  order: number;
  /** Hidden from the board but not deleted; tasks stay put and can be restored. */
  archived?: boolean;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  order: number;
  isFavorite: boolean;
}

export interface FilterDef {
  id: string;
  name: string;
  query: string;
  color: string;
  order: number;
  isFavorite: boolean;
}

export interface Comment {
  id: string;
  text: string;
  createdAt: string;
}

export interface Task {
  id: string;
  content: string;
  description: string;
  projectId: string;
  sectionId: string | null;
  parentId: string | null;
  order: number;
  priority: Priority;
  due: Due | null;
  labels: string[];
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  comments?: Comment[];
  /** Older single reminder (minutes before the due time); only used when `reminders` is absent. */
  reminderMinutes?: number;
  /** When to notify. None unless added (or a default from Settings applied when it was added). */
  reminders?: Reminder[];
  /** Firebase only: who added it, and who ticked it off (shared projects). */
  createdBy?: string;
  completedBy?: string;
  /** Firebase only: shared on its own with these people (your partner), outside any shared project. */
  sharedWith?: string[];
  /** Who shared it -- set automatically, so the other person can see who it's from. */
  sharedBy?: Partner;
  /** Firebase only: files attached to the task (the contents live in attachments/{id}). */
  attachments?: Attachment[];
  /** Where it happens: a place picked from search or a pin on the map. */
  location?: TaskLocation;
}

/**
 * One reminder on a task. `by` is who set it (Firebase user id): only their
 * phone notifies, so a shared task doesn't ping both of you.
 *   relative: minutes before the due time (tasks with a time)
 *   day:      a clock time on the due day, or `days` before it (works for
 *             all-day and repeating tasks)
 *   absolute: a fixed moment
 */
export type Reminder =
  | { id: string; type: "relative"; minutes: number; by?: string }
  | { id: string; type: "day"; days: number; time: string; by?: string }
  | { id: string; type: "absolute"; at: string; by?: string };

/** Days you're away, e.g. "Athens" from Thu 2 to Sat 4 Oct (dates inclusive, "yyyy-MM-dd"). */
export interface AwayPeriod {
  id: string;
  title: string;
  start: string;
  end: string;
}

export interface TaskLocation {
  /** Short name shown on the task, e.g. "Ljubljana Airport" or "Slovenska cesta 10". */
  name: string;
  /** The rest of the address, when known. */
  address?: string;
  lat: number;
  lng: number;
  /** Android app: who gets a notification on arriving here (user ids; "me" with Dropbox). */
  arrivalFor?: string[];
}

export interface Attachment {
  id: string;
  name: string;
  /** MIME type, e.g. "image/jpeg", "application/pdf". */
  type: string;
  /** Bytes as stored (photos are shrunk before upload). */
  size: number;
  addedBy: string;
  addedAt: string;
  /** Small preview for images, as a data: URL. */
  thumb?: string;
}

export interface CompletionEntry {
  taskId: string;
  projectId: string;
  content: string;
  /** ISO timestamp of the completion. */
  at: string;
}

/** A subscribed external iCal (.ics) feed -- read-only, never turned into tasks. */
export interface CalendarFeed {
  id: string;
  name: string;
  url: string;
  color: string;
  enabled: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}

/** One VEVENT parsed out of a feed (recurring events are pre-expanded into instances). */
export interface CalendarEvent {
  id: string;
  feedId: string;
  /** Denormalized from the feed's color at sync time, for row/chip styling. */
  color: string;
  /** The VEVENT's own UID, so re-syncing can replace instead of duplicate. */
  uid: string;
  title: string;
  /** ISO date ("yyyy-MM-dd") the event falls on, for day-bucket lookups. */
  date: string;
  /** Full ISO datetime, if the event has a time (absent for all-day events). */
  start: string | null;
  end: string | null;
  allDay: boolean;
}

/**
 * A reusable checklist: one task per line, written like quick add ("jutri",
 * "p1", "@label" work, and apply when it's used); a line starting with "-"
 * is a sub-task of the line above.
 */
export interface TaskTemplate {
  id: string;
  name: string;
  text: string;
}

export interface AppData {
  version: number;
  projects: Project[];
  sections: Section[];
  labels: Label[];
  filters: FilterDef[];
  tasks: Task[];
  calendarFeeds?: CalendarFeed[];
  calendarEvents?: CalendarEvent[];
  /**
   * One entry per completion, including each occurrence of a repeating task
   * (which never stays "completed" itself), for the Productivity stats.
   */
  completionLog?: CompletionEntry[];
  /** Your reusable checklists (kept with your profile). */
  templates?: TaskTemplate[];
  /** Days you're away (a trip), shown across the calendar; kept with your profile. */
  away?: AwayPeriod[];
  /** Firebase only: your partner's trips (read from their profile; theirs to change). */
  partnerAway?: AwayPeriod[];
  /** Firebase only: your id, and your partner for shared tasks. */
  me?: string;
  partner?: Partner | null;
}
