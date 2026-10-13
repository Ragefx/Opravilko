import { addDays, isToday, isTomorrow, parseISO } from "date-fns";
import { tr, format } from "../i18n";
import { useBootstrap } from "../api/hooks";
import TaskListView, { type DateGroup } from "../components/TaskListView";
import RescheduleButton from "../components/RescheduleButton";
import { isDueWithinDays, isOverdue } from "../utils/date";
import { groupEventsByDate } from "../utils/calendarSync";

const DAYS_AHEAD = 14;
const OVERDUE = tr("Overdue", "Zamujeno");

/** "22 Sep · Today · Tuesday", matching Todoist's Upcoming headers. */
function dayLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  const relative = isToday(d) ? tr(" · Today", " · Danes") : isTomorrow(d) ? tr(" · Tomorrow", " · Jutri") : "";
  return `${format(d, tr("d MMM", "d. MMM"))}${relative} · ${format(d, "EEEE")}`;
}

export default function Upcoming() {
  const { data, isLoading } = useBootstrap();
  if (isLoading || !data) return null;

  const tasks = data.tasks
    .filter((t) => !t.completed && (isOverdue(t.due) || isDueWithinDays(t.due, DAYS_AHEAD)))
    .sort((a, b) => (a.due?.date || "").localeCompare(b.due?.date || ""));
  const projectNameById = Object.fromEntries(data.projects.map((p) => [p.id, p.name]));
  const eventsByDate = groupEventsByDate(data.calendarEvents, data.calendarFeeds);
  const dateGroups: DateGroup[] = [
    { label: OVERDUE, date: null },
    ...Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => {
      const d = addDays(new Date(), i);
      const date = format(d, "yyyy-MM-dd");
      return {
        label: dayLabel(date),
        date,
        keepEmpty: true,
        quickAdd: { projectId: "inbox", due: { date, string: format(d, "MMM d") } },
      };
    }),
  ];

  return (
    <TaskListView
      title={tr("Upcoming", "Prihajajoče")}
      tasks={tasks}
      groupLabel={(t) => (isOverdue(t.due) ? OVERDUE : t.due ? dayLabel(t.due.date) : tr("No date", "Brez datuma"))}
      showProjectChip
      projectNameById={projectNameById}
      eventsByDate={eventsByDate}
      dateGroups={dateGroups}
      groupExtra={(label, items) => (label === OVERDUE && items.length > 0 ? <RescheduleButton tasks={items} /> : undefined)}
    />
  );
}
