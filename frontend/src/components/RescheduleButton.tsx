import { useRescheduleTasks } from "../api/hooks";
import type { Task } from "../api/types";
import { makeDue } from "../utils/date";

/** "Reschedule all to today" for an Overdue group header. */
export default function RescheduleButton({ tasks }: { tasks: Task[] }) {
  const rescheduleTasks = useRescheduleTasks();
  return (
    <button
      className="btn-text"
      style={{ fontSize: 12, padding: "2px 6px", marginLeft: "auto" }}
      onClick={() => rescheduleTasks.mutate({ ids: tasks.map((t) => t.id), due: makeDue(new Date(), "Today") })}
    >
      Reschedule all to today
    </button>
  );
}
