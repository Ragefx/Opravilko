import { format } from "date-fns";
import { useBootstrap, useRescheduleTasks } from "../api/hooks";
import TaskListView from "../components/TaskListView";
import type { Task } from "../api/types";
import { isDueToday, isOverdue, makeDue, todayISO } from "../utils/date";

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
      subtitle={`${format(new Date(), "EEEE d MMMM")} · ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`}
      tasks={tasks}
      quickAddProjectId="inbox"
      quickAddDue={{ date: todayISO(), string: "today" }}
      groupLabel={(t) => (isOverdue(t.due) ? "Overdue" : "Today")}
      showProjectChip
      projectNameById={projectNameById}
      groupExtra={(label, items) => (label === "Overdue" && items.length > 0 ? <RescheduleButton tasks={items} /> : undefined)}
    />
  );
}

function RescheduleButton({ tasks }: { tasks: Task[] }) {
  const rescheduleTasks = useRescheduleTasks();
  return (
    <button
      className="btn-text"
      style={{ fontSize: 12, padding: "2px 6px" }}
      onClick={() => rescheduleTasks.mutate({ ids: tasks.map((t) => t.id), due: makeDue(new Date(), "Today") })}
    >
      Reschedule all to today
    </button>
  );
}
