import { format, parseISO } from "date-fns";
import type { CalendarEvent } from "../api/types";

/**
 * A read-only row for a subscribed calendar's event -- no checkbox, not
 * clickable into a task, just the time and title with a colored bar,
 * matching Todoist's own calendar-feed rows.
 */
export default function CalendarEventRow({ event }: { event: CalendarEvent }) {
  const timeLabel =
    !event.allDay && event.start
      ? `${format(parseISO(event.start), "HH:mm")}${event.end ? `-${format(parseISO(event.end), "HH:mm")}` : ""}`
      : null;

  return (
    <div className="calendar-event-row" style={{ borderLeftColor: event.color }}>
      {timeLabel && <span className="calendar-event-time">{timeLabel}</span>}
      <span className="calendar-event-title">{event.title}</span>
    </div>
  );
}
