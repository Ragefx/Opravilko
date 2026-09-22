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
  viewStyle?: "list" | "board" | "calendar";
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

export interface AppData {
  version: number;
  projects: Project[];
  sections: Section[];
  labels: Label[];
  filters: FilterDef[];
  tasks: Task[];
  calendarFeeds?: CalendarFeed[];
  calendarEvents?: CalendarEvent[];
}
