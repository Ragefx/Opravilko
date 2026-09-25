import { useState, type ReactNode } from "react";
import { isNativeApp } from "../dropbox/auth";
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { CalendarEvent, Due, Task } from "../api/types";
import { useBootstrap, useUpdateTask } from "../api/hooks";
import type { AwayPeriod } from "../api/types";
import { awayRange, tripName, tripsOf, tripsOn } from "../utils/away";
import AwaySheet from "./AwaySheet";
import { PRIORITY_META } from "../utils/priority";
import TaskDetail from "./TaskDetail";
import { useToast } from "./ToastProvider";
import { requestQuickAdd } from "../native/widget";
import MobileCalendar, { useNarrowScreen } from "./MobileCalendar";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_VISIBLE_PER_DAY = 3;
const WEEK_OPTS = { weekStartsOn: 1 as const };
const MODE_KEY = "opravilko.calendarMode";

type Mode = "month" | "week";

/** Month cells are too narrow on a phone to read a task's name, so the app starts in Week there. */
function defaultMode(): Mode {
  return isNativeApp && window.innerWidth < 600 ? "week" : "month";
}

function storedMode(): Mode {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    return saved === "week" || saved === "month" ? saved : defaultMode();
  } catch {
    return defaultMode();
  }
}

/** The same due, moved to another day; a set time and any repeat stay as they were. */
function moveDue(due: Due, toDate: string): Due {
  if (!due.datetime) return { ...due, date: toDate };
  const shift = differenceInCalendarDays(parseISO(toDate), parseISO(due.date));
  return { ...due, date: toDate, datetime: addDays(new Date(due.datetime), shift).toISOString() };
}

function timeOf(t: Task): string | null {
  return t.due?.datetime ? format(new Date(t.due.datetime), "HH:mm") : null;
}

type CalendarProps = {
  tasks: Task[];
  projectId: string;
  eventsByDate?: Map<string, CalendarEvent[]>;
};

/** On a phone: a week/month of dots with the day's list below; otherwise the grid. */
export default function CalendarView(props: CalendarProps) {
  return useNarrowScreen() ? <MobileCalendar {...props} /> : <GridCalendar {...props} />;
}

function GridCalendar({ tasks, projectId, eventsByDate }: CalendarProps) {
  const [mode, setModeState] = useState<Mode>(storedMode);
  const [cursor, setCursor] = useState(() => new Date());
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Task | null>(null);
  const updateTask = useUpdateTask();
  const showToast = useToast();
  const trips = tripsOf(useBootstrap().data);
  const [awayEdit, setAwayEdit] = useState<{ period?: AwayPeriod; startDay?: string } | null>(null);

  // A short press still opens the task; dragging starts after a small move
  // (mouse) or a long press (touch), like the board.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } })
  );

  function setMode(next: Mode) {
    setModeState(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  const days: Date[] = [];
  if (mode === "month") {
    const gridStart = startOfWeek(startOfMonth(cursor), WEEK_OPTS);
    const gridEnd = endOfWeek(endOfMonth(cursor), WEEK_OPTS);
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  } else {
    const weekStart = startOfWeek(cursor, WEEK_OPTS);
    for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i));
  }
  const weekCount = days.length / 7;

  const tasksByDate = new Map<string, Task[]>();
  for (const t of tasks) {
    // Sub-tasks with their own date show too (as in Now and Upcoming).
    if (t.completed || !t.due) continue;
    const key = t.due.date;
    if (!tasksByDate.has(key)) tasksByDate.set(key, []);
    tasksByDate.get(key)!.push(t);
  }
  // Timed tasks first, in time order; then the rest by priority.
  const sortDay = (list: Task[]) =>
    [...list].sort((a, b) => {
      const ta = timeOf(a);
      const tb = timeOf(b);
      if (ta && tb) return ta.localeCompare(tb);
      if (ta) return -1;
      if (tb) return 1;
      return b.priority - a.priority;
    });

  function handleDragEnd(e: DragEndEvent) {
    setDragging(null);
    const task = tasks.find((t) => t.id === e.active.id);
    const toDate = e.over?.id as string | undefined;
    if (!task?.due || !toDate || toDate === task.due.date) return;
    const before = task.due;
    updateTask.mutate({ id: task.id, due: moveDue(before, toDate) });
    showToast({
      message: `Moved to ${format(parseISO(toDate), "EEE, MMM d")}`,
      actionLabel: "Undo",
      onAction: () => updateTask.mutate({ id: task.id, due: before }),
    });
  }

  const title =
    mode === "month"
      ? format(cursor, "MMMM yyyy")
      : (() => {
          const a = days[0];
          const b = days[6];
          return isSameMonth(a, b)
            ? `${format(a, "MMM d")} – ${format(b, "d, yyyy")}`
            : `${format(a, "MMM d")} – ${format(b, "MMM d, yyyy")}`;
        })();

  return (
    <div className={`calendar-view calendar-${mode}`}>
      <div className="topbar" style={{ padding: "0 0 16px", border: "none", flexShrink: 0 }}>
        <h1>{title}</h1>
        <div className="calendar-controls">
          <button className="btn btn-secondary calendar-away-btn" onClick={() => setAwayEdit({})} title="Mark days you're away">
            ✈️ Away
          </button>
          <div className="view-toggle" role="radiogroup" aria-label="Calendar layout">
            {(["month", "week"] as const).map((m) => (
              <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? "active" : ""} onClick={() => setMode(m)}>
                {m === "month" ? "Month" : "Week"}
              </button>
            ))}
          </div>
          <div className="view-toggle">
            <button
              onClick={() => setCursor((c) => (mode === "month" ? subMonths(c, 1) : subWeeks(c, 1)))}
              aria-label={mode === "month" ? "Previous month" : "Previous week"}
            >
              ‹
            </button>
            <button onClick={() => setCursor(new Date())}>Today</button>
            <button
              onClick={() => setCursor((c) => (mode === "month" ? addMonths(c, 1) : addWeeks(c, 1)))}
              aria-label={mode === "month" ? "Next month" : "Next week"}
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {mode === "month" && (
        <div className="calendar-weekdays-row">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} className="calendar-weekday">
              {w}
            </div>
          ))}
        </div>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setDragging(tasks.find((t) => t.id === e.active.id) ?? null)}
        onDragCancel={() => setDragging(null)}
        onDragEnd={handleDragEnd}
      >
        <div
          className="calendar-days-grid"
          style={mode === "month" ? { gridTemplateRows: `repeat(${weekCount}, 1fr)` } : undefined}
        >
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayTasks = sortDay(tasksByDate.get(key) || []);
            const dayEvents = eventsByDate?.get(key) || [];
            // The week view has room for everything; the month shows three lines a day.
            const expanded = mode === "week" || expandedDay === key;
            const limit = expanded ? Infinity : MAX_VISIBLE_PER_DAY;
            const shownEvents = dayEvents.slice(0, limit);
            const shownTasks = dayTasks.slice(0, Math.max(0, limit - shownEvents.length));
            const hidden = dayEvents.length + dayTasks.length - shownEvents.length - shownTasks.length;
            // A trip: a band across its days, named where it starts and at the start of each week.
            const dayTrips = tripsOn(trips, key);
            const trip = dayTrips[0]?.period;
            const onlyPartner = dayTrips.length > 0 && dayTrips.every((t) => !t.mine);
            return (
              <DayCell
                key={key}
                dateKey={key}
                className={`calendar-cell ${mode === "month" && !isSameMonth(day, cursor) ? "outside-month" : ""} ${
                  isToday(day) ? "is-today" : ""
                } ${trip ? "is-away" : ""} ${onlyPartner ? "is-away-partner" : ""} ${trip && key === trip.start ? "is-away-start" : ""} ${
                  trip && key === trip.end ? "is-away-end" : ""
                }`}
                onAdd={() => requestQuickAdd({ projectId, today: false, date: key })}
              >
                <div className="calendar-cell-header">
                  <span>{format(day, "d")}</span>
                  {mode === "week" && <b className="calendar-cell-weekday">{format(day, "EEE")}</b>}
                </div>
                {dayTrips.map((t) => {
                  // Named where it starts and at the start of each week.
                  const named = key === t.period.start || day.getDay() === 1;
                  return (
                    <button
                      key={t.period.id}
                      className={`calendar-away-label ${named ? "" : "is-quiet"} ${t.mine ? "" : "is-partner"}`}
                      onClick={() =>
                        t.mine
                          ? setAwayEdit({ period: t.period })
                          : showToast({ message: `${tripName(t)} · ${awayRange(t.period)}` })
                      }
                      title={`Away: ${tripName(t)} · ${awayRange(t.period)}`}
                      aria-label={`Away: ${tripName(t)}`}
                    >
                      {named ? `✈️ ${tripName(t)}` : ""}
                    </button>
                  );
                })}
                {shownEvents.map((e) => (
                  <div key={e.id} className="calendar-event-chip" style={{ borderLeftColor: e.color }} title={e.title}>
                    {e.start && !e.allDay && <span className="calendar-chip-time">{format(new Date(e.start), "HH:mm")}</span>}
                    {e.title}
                  </div>
                ))}
                {shownTasks.map((t) => (
                  <TaskChip key={t.id} task={t} onOpen={() => setOpenTask(t)} />
                ))}
                {hidden > 0 && (
                  <button className="calendar-more" onClick={() => setExpandedDay(key)}>
                    +{hidden} more
                  </button>
                )}
                {mode === "month" && expandedDay === key && dayEvents.length + dayTasks.length > MAX_VISIBLE_PER_DAY && (
                  <button className="calendar-more" onClick={() => setExpandedDay(null)}>
                    Show less
                  </button>
                )}
              </DayCell>
            );
          })}
        </div>
        <DragOverlay dropAnimation={null}>
          {dragging ? (
            <div
              className="calendar-task-chip calendar-chip-dragging"
              style={{ borderLeftColor: PRIORITY_META[dragging.priority].color }}
            >
              {timeOf(dragging) && <span className="calendar-chip-time">{timeOf(dragging)}</span>}
              {dragging.content}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {openTask && <TaskDetail task={openTask} onClose={() => setOpenTask(null)} onOpenTask={setOpenTask} />}
      {awayEdit && <AwaySheet period={awayEdit.period} startDay={awayEdit.startDay} onClose={() => setAwayEdit(null)} />}
    </div>
  );
}

/** A day: a drop target for dragged tasks, and clicking its empty space adds a task on it. */
function DayCell({
  dateKey,
  className,
  onAdd,
  children,
}: {
  dateKey: string;
  className: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dateKey });
  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isOver ? "is-drop-target" : ""}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(".calendar-task-chip, .calendar-event-chip, .calendar-more, .calendar-away-label")) return;
        onAdd();
      }}
    >
      {children}
    </div>
  );
}

function TaskChip({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: task.id });
  const time = timeOf(task);
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`calendar-task-chip ${isDragging ? "is-dragging" : ""}`}
      style={{ borderLeftColor: PRIORITY_META[task.priority].color }}
      onClick={onOpen}
      title={task.content}
    >
      {time && <span className="calendar-chip-time">{time}</span>}
      {task.content}
    </button>
  );
}
