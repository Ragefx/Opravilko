export type Priority = 1 | 2 | 3 | 4; // 4 = p1 (urgent/red) ... 1 = p4 (none), mirrors Todoist's 4-3-2-1 mapping in UI layer

export interface Due {
  date: string; // YYYY-MM-DD
  datetime?: string; // ISO string, if a time is set
  string: string; // original human text, e.g. "every Monday"
  isRecurring: boolean;
  rrule?: string; // simple recurrence rule, e.g. "FREQ=WEEKLY;BYDAY=MO"
}

export interface Project {
  id: string;
  name: string;
  color: string;
  order: number;
  isFavorite: boolean;
  isInboxProject?: boolean;
  parentId: string | null;
  viewStyle?: "list" | "board";
}

export interface Section {
  id: string;
  projectId: string;
  name: string;
  order: number;
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
  labels: string[]; // label names
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppData {
  version: number;
  projects: Project[];
  sections: Section[];
  labels: Label[];
  filters: FilterDef[];
  tasks: Task[];
}

export function emptyAppData(): AppData {
  const now = new Date().toISOString();
  return {
    version: 1,
    projects: [
      {
        id: "inbox",
        name: "Inbox",
        color: "grey",
        order: 0,
        isFavorite: false,
        isInboxProject: true,
        parentId: null,
      },
    ],
    sections: [],
    labels: [],
    filters: [],
    tasks: [],
  };
}
