import { useState } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import type { Task } from "../api/types";
import { PRIORITY_META } from "../utils/priority";
import TaskDetail from "./TaskDetail";
import QuickAdd from "./QuickAdd";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_VISIBLE_PER_DAY = 3;
const WEEK_OPTS = { weekStartsOn: 1 as const };

export default function CalendarView({ tasks, projectId }: { tasks: Task[]; projectId: string }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [addingFor, setAddingFor] = useState<string | null>(null);

  const gridStart = startOfWeek(startOfMonth(month), WEEK_OPTS);
  const gridEnd = endOfWeek(endOfMonth(month), WEEK_OPTS);
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const tasksByDate = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.completed || !t.due || t.parentId) continue;
    const key = t.due.date;
    if (!tasksByDate.has(key)) tasksByDate.set(key, []);
    tasksByDate.get(key)!.push(t);
  }

  return (
    <div className="content-scroll" style={{ maxWidth: 960 }}>
      <div className="topbar" style={{ padding: "0 0 16px", border: "none" }}>
        <h1>{format(month, "MMMM yyyy")}</h1>
        <div className="view-toggle">
          <button onClick={() => setMonth((m) => subMonths(m, 1))} aria-label="Previous month">
            ‹
          </button>
          <button onClick={() => setMonth(startOfMonth(new Date()))}>Today</button>
          <button onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month">
            ›
          </button>
        </div>
      </div>

      <div className="calendar-grid">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="calendar-weekday">
            {w}
          </div>
        ))}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayTasks = (tasksByDate.get(key) || []).sort((a, b) => a.priority - b.priority);
          const inMonth = isSameMonth(day, month);
          return (
            <div
              key={key}
              className={`calendar-cell ${inMonth ? "" : "outside-month"} ${isToday(day) ? "is-today" : ""}`}
            >
              <div className="calendar-cell-header">
                <span>{format(day, "d")}</span>
                <button
                  className="calendar-add-btn"
                  onClick={() => setAddingFor(addingFor === key ? null : key)}
                  aria-label="Add task"
                >
                  +
                </button>
              </div>
              {dayTasks.slice(0, MAX_VISIBLE_PER_DAY).map((t) => (
                <button
                  key={t.id}
                  className="calendar-task-chip"
                  style={{ borderLeftColor: PRIORITY_META[t.priority].color }}
                  onClick={() => setOpenTask(t)}
                  title={t.content}
                >
                  {t.content}
                </button>
              ))}
              {dayTasks.length > MAX_VISIBLE_PER_DAY && (
                <div className="calendar-more">+{dayTasks.length - MAX_VISIBLE_PER_DAY} more</div>
              )}
              {addingFor === key && (
                <div onClick={(e) => e.stopPropagation()}>
                  <QuickAdd projectId={projectId} defaultDue={{ date: key, string: format(day, "MMM d") }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {openTask && <TaskDetail task={openTask} onClose={() => setOpenTask(null)} onOpenTask={setOpenTask} />}
    </div>
  );
}
