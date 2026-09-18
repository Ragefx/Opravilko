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

export interface AppData {
  version: number;
  projects: Project[];
  sections: Section[];
  labels: Label[];
  filters: FilterDef[];
  tasks: Task[];
}
