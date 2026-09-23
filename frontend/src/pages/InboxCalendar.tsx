import { useBootstrap } from "../api/hooks";
import CalendarView from "../components/CalendarView";
import { groupEventsByDate } from "../utils/calendarSync";

/**
 * The Inbox as a month calendar, with the subscribed calendars' events --
 * a fixed view with no display options. Tasks added from a day go to the
 * Inbox.
 */
export default function InboxCalendar() {
  const { data, isLoading } = useBootstrap();
  if (isLoading || !data) return null;
  const tasks = data.tasks.filter((t) => t.projectId === "inbox");
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div className="page-header-pad" />
      <CalendarView
        tasks={tasks}
        projectId="inbox"
        eventsByDate={groupEventsByDate(data.calendarEvents, data.calendarFeeds)}
      />
    </div>
  );
}
