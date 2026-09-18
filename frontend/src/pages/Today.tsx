import { useBootstrap } from "../api/hooks";
import TaskListView from "../components/TaskListView";
import { isDueToday, isOverdue, todayISO } from "../utils/date";

export default function Today() {
  const { data, isLoading } = useBootstrap();
  if (isLoading || !data) return null;

  const tasks = data.tasks
    .filter((t) => !t.completed && (isDueToday(t.due) || isOverdue(t.due)))
    .sort((a, b) => (a.due?.date || "").localeCompare(b.due?.date || ""));
  const projectNameById = Object.fromEntries(data.projects.map((p) => [p.id, p.name]));

  return (
    <TaskListView
      title="Today"
      tasks={tasks}
      quickAddProjectId="inbox"
      quickAddDue={{ date: todayISO(), string: "today" }}
      groupLabel={(t) => (isOverdue(t.due) ? "Overdue" : "Today")}
      showProjectChip
      projectNameById={projectNameById}
    />
  );
}
