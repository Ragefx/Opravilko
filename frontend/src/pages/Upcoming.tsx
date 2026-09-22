import { format, parseISO } from "date-fns";
import { useBootstrap } from "../api/hooks";
import TaskListView from "../components/TaskListView";
import { isDueWithinDays } from "../utils/date";
import { groupEventsByDate } from "../utils/calendarSync";

export default function Upcoming() {
  const { data, isLoading } = useBootstrap();
  if (isLoading || !data) return null;

  const tasks = data.tasks
    .filter((t) => !t.completed && isDueWithinDays(t.due, 14))
    .sort((a, b) => (a.due?.date || "").localeCompare(b.due?.date || ""));
  const projectNameById = Object.fromEntries(data.projects.map((p) => [p.id, p.name]));
  const eventsByDate = groupEventsByDate(data.calendarEvents, data.calendarFeeds);

  return (
    <TaskListView
      title="Upcoming"
      tasks={tasks}
      groupLabel={(t) => (t.due ? format(parseISO(t.due.date), "EEEE, MMM d") : "No date")}
      showProjectChip
      projectNameById={projectNameById}
      eventsByDate={eventsByDate}
    />
  );
}
