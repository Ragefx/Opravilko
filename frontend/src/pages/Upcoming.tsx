import { addDays, format, isToday, isTomorrow, parseISO } from "date-fns";
import { useBootstrap } from "../api/hooks";
import TaskListView from "../components/TaskListView";
import { isDueWithinDays } from "../utils/date";
import { groupEventsByDate } from "../utils/calendarSync";

const DAYS_AHEAD = 14;

/** "22 Sep · Today · Tuesday", matching Todoist's Upcoming headers. */
function dayLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  const relative = isToday(d) ? " · Today" : isTomorrow(d) ? " · Tomorrow" : "";
  return `${format(d, "d MMM")}${relative} · ${format(d, "EEEE")}`;
}

export default function Upcoming() {
  const { data, isLoading } = useBootstrap();
  if (isLoading || !data) return null;

  const tasks = data.tasks
    .filter((t) => !t.completed && isDueWithinDays(t.due, DAYS_AHEAD))
    .sort((a, b) => (a.due?.date || "").localeCompare(b.due?.date || ""));
  const projectNameById = Object.fromEntries(data.projects.map((p) => [p.id, p.name]));
  const eventsByDate = groupEventsByDate(data.calendarEvents, data.calendarFeeds);
  const dateGroups = Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => {
    const date = format(addDays(new Date(), i), "yyyy-MM-dd");
    return { label: dayLabel(date), date };
  });

  return (
    <TaskListView
      title="Upcoming"
      tasks={tasks}
      groupLabel={(t) => (t.due ? dayLabel(t.due.date) : "No date")}
      showProjectChip
      projectNameById={projectNameById}
      eventsByDate={eventsByDate}
      dateGroups={dateGroups}
    />
  );
}
