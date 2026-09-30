import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { dayFromParam } from "../utils/calendarTasks";
import { eventTimeLabel, isEvent } from "../utils/events";
import { doneByDay, useCalendarDone, type DoneEntry } from "../utils/calendarDone";
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
import { awayRange, awayTimeOn, projectRoute, tripName, tripsOf, tripsOn, tripIcon, tripLook, type Trip } from "../utils/away";
import { useNavigate } from "react-router-dom";
import AwaySheet from "./AwaySheet";
import { PRIORITY_META } from "../utils/priority";
import TaskDetail from "./TaskDetail";
import { useToast } from "./ToastProvider";
import { requestQuickAdd } from "../native/widget";
import MobileCalendar, { useNarrowScreen } from "./MobileCalendar";
import TaskRow from "./TaskRow";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_VISIBLE_PER_DAY = 3;
/**
 * The month beside its day panel fills each day with as many lines as fit
 * (at least this many), then "+ N more": a big screen shows more, not bigger boxes.
 */
const MONTH_LINES = 2;
/** One line in a day (its height plus the gap), and the day number above them. */
const LINE_PX = 20;
const CELL_TOP_PX = 30;

/** Wide enough for the month and the day panel side by side. */
const PANEL_QUERY = "(min-width: 1000px)";
function useDayPanel(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(PANEL_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(PANEL_QUERY).matches
  );
}
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
  const [searchParams] = useSearchParams();
  const [cursor, setCursor] = useState(() => dayFromParam(searchParams.get("day")));
  // Month: the day shown in full in the panel on the right.
  const [selectedKey, setSelectedKey] = useState(() => format(dayFromParam(searchParams.get("day")), "yyyy-MM-dd"));
  const wide = useDayPanel();
  // How tall a week row is, to fit that many lines in each day.
  const gridRef = useRef<HTMLDivElement>(null);
  const [rowPx, setRowPx] = useState(0);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Task | null>(null);
  const updateTask = useUpdateTask();
  const showToast = useToast();
  const data = useBootstrap().data;
  const trips = tripsOf(data);
  // Completed tasks, on the day they were done (Settings > Appearance).
  const showDone = useCalendarDone();
  const done = showDone ? doneByDay(data) : new Map<string, DoneEntry[]>();
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const navigate = useNavigate();
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
    // Events stay on their day once they're over, greyed.
    if ((t.completed && t.kind !== "event") || !t.due) continue;
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

  // The month with the chosen day in full beside it (wide windows).
  const panel = mode === "month" && wide;
  useEffect(() => {
    const el = gridRef.current;
    if (!el || !panel) return;
    const measure = () => setRowPx(el.clientHeight / Math.max(1, weekCount));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [panel, weekCount]);
  // Room for the "+ N more" line is kept when a day has more than fits.
  const monthLines = Math.max(MONTH_LINES, Math.floor((rowPx - CELL_TOP_PX) / LINE_PX) - 1);

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
            <button
              onClick={() => {
                setCursor(new Date());
                setSelectedKey(todayKey);
              }}
            >
              Today
            </button>
            <button
              onClick={() => setCursor((c) => (mode === "month" ? addMonths(c, 1) : addWeeks(c, 1)))}
              aria-label={mode === "month" ? "Next month" : "Next week"}
            >
              ›
            </button>
          </div>
        </div>
      </div>

      <div className={panel ? "calendar-month-layout" : "calendar-plain-layout"}>
      <div className="calendar-month-main">
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
          ref={gridRef}
          className="calendar-days-grid"
          style={mode === "month" ? { gridTemplateRows: `repeat(${weekCount}, 1fr)` } : undefined}
        >
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayTasks = sortDay(tasksByDate.get(key) || []);
            const dayEvents = eventsByDate?.get(key) || [];
            // The week view has room for everything; the month shows three lines a day.
            // Beside the day panel, two lines a day and the rest in the panel.
            const expanded = mode === "week" || (!panel && expandedDay === key);
            const limit = expanded ? Infinity : panel ? monthLines : MAX_VISIBLE_PER_DAY;
            const shownEvents = dayEvents.slice(0, limit);
            const shownTasks = dayTasks.slice(0, Math.max(0, limit - shownEvents.length));
            const dayDone = key <= todayKey ? done.get(key) ?? [] : [];
            const shownDone = dayDone.slice(0, Math.max(0, limit - shownEvents.length - shownTasks.length));
            const hidden =
              dayEvents.length + dayTasks.length + dayDone.length - shownEvents.length - shownTasks.length - shownDone.length;
            // A trip: a band across its days, named where it starts and at the start of each week.
            const dayTrips = tripsOn(trips, key);
            const trip = dayTrips[0]?.period;
            const onlyPartner = dayTrips.length > 0 && dayTrips.every((t) => tripLook(t) === "partner");
            const offWork = dayTrips.length > 0 && tripLook(dayTrips[0]) === "off";
            return (
              <DayCell
                key={key}
                dateKey={key}
                className={`calendar-cell ${mode === "month" && !isSameMonth(day, cursor) ? "outside-month" : ""} ${
                  isToday(day) ? "is-today" : ""
                } ${trip ? "is-away" : ""} ${onlyPartner ? "is-away-partner" : ""} ${offWork ? "is-away-off" : ""} ${trip && key === trip.start ? "is-away-start" : ""} ${
                  trip && key === trip.end ? "is-away-end" : ""
                } ${panel && key === selectedKey ? "is-selected" : ""}`}
                onAdd={() => (panel ? setSelectedKey(key) : requestQuickAdd({ projectId, today: false, date: key }))}
              >
                <div className="calendar-cell-header">
                  <span>{format(day, "d")}</span>
                  {mode === "week" && <b className="calendar-cell-weekday">{format(day, "EEE")}</b>}
                </div>
                {dayTrips.map((t) => {
                  // Every day of a trip carries its name; leaving and back times on the ends.
                  const time = awayTimeOn(t.period, key);
                  return (
                  <button
                    key={t.period.id}
                    className={`calendar-away-label ${tripLook(t) === "mine" ? "" : `is-${tripLook(t)}`}`}
                    onClick={() =>
                      // A project's trip opens the project (its prep tasks); yours opens to change.
                      t.projectId
                        ? navigate(projectRoute(t.projectId))
                        : t.mine
                          ? setAwayEdit({ period: t.period })
                          : showToast({
                              message: `${tripName(t)} · ${awayRange(t.period)}${t.period.note ? ` · ${t.period.note}` : ""}${
                                t.period.together ? ` · added by ${t.who}, who can change it` : ""
                              }`,
                            })
                    }
                    title={`${t.period.by === "off" ? "Off work" : "Away"}: ${tripName(t)} · ${awayRange(t.period)}${t.period.note ? ` · ${t.period.note}` : ""}`}
                  >
                    {tripIcon(t.period)} {tripName(t)}
                    {time && <span className="calendar-away-time">{time}</span>}
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
                  <TaskChip key={t.id} task={t} onOpen={() => setOpenTask(t)} short={panel} />
                ))}
                {shownDone.map((d) => {
                  const task = data?.tasks.find((t) => t.id === d.taskId);
                  return (
                    <button
                      key={`${d.taskId}@${d.at}`}
                      className="calendar-done-chip"
                      title={`Done: ${d.content} · ${format(new Date(d.at), "HH:mm")}`}
                      onClick={() => task && setOpenTask(task)}
                    >
                      ✓ {d.content}
                    </button>
                  );
                })}
                {hidden > 0 && (
                  <button className="calendar-more" onClick={() => (panel ? setSelectedKey(key) : setExpandedDay(key))}>
                    +{hidden} more
                  </button>
                )}
                {mode === "month" && !panel && expandedDay === key && dayEvents.length + dayTasks.length + dayDone.length > MAX_VISIBLE_PER_DAY && (
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
      </div>
      {panel && (
        <DayPanel
          dayKey={selectedKey}
          todayKey={todayKey}
          tasks={tasks}
          events={eventsByDate?.get(selectedKey) ?? []}
          dayTrips={tripsOn(trips, selectedKey)}
          done={selectedKey <= todayKey ? done.get(selectedKey) ?? [] : []}
          projectNames={Object.fromEntries((data?.projects ?? []).map((p) => [p.id, p.name]))}
          onOpenTask={(t) => setOpenTask(t)}
          onTrip={(t) =>
            t.projectId ? navigate(projectRoute(t.projectId)) : t.mine ? setAwayEdit({ period: t.period }) : undefined
          }
          onAdd={() => requestQuickAdd({ projectId, today: false, date: selectedKey })}
        />
      )}
      </div>

      {openTask && <TaskDetail task={openTask} onClose={() => setOpenTask(null)} onOpenTask={setOpenTask} />}
      {awayEdit && <AwaySheet period={awayEdit.period} startDay={awayEdit.startDay} onClose={() => setAwayEdit(null)} />}
    </div>
  );
}

/**
 * The month's chosen day in full: its trips and holidays, events, what's to
 * do (today also what's late), adding to it, and what got done.
 */
function DayPanel({
  dayKey,
  todayKey,
  tasks,
  events,
  dayTrips,
  done,
  projectNames,
  onOpenTask,
  onTrip,
  onAdd,
}: {
  dayKey: string;
  todayKey: string;
  tasks: Task[];
  events: CalendarEvent[];
  dayTrips: Trip[];
  done: DoneEntry[];
  projectNames: Record<string, string>;
  onOpenTask: (t: Task) => void;
  onTrip: (t: Trip) => void;
  onAdd: () => void;
}) {
  const isTodayKey = dayKey === todayKey;
  const onDay = tasks.filter((t) => t.due?.date === dayKey);
  const byTime = (a: Task, b: Task) =>
    (a.due?.datetime ?? "~").localeCompare(b.due?.datetime ?? "~") || b.priority - a.priority;
  const ownEvents = onDay.filter(isEvent).sort(byTime);
  const late = isTodayKey ? tasks.filter((t) => !t.completed && !isEvent(t) && t.due && t.due.date < todayKey) : [];
  const todo = [...late, ...onDay.filter((t) => !isEvent(t) && !t.completed).sort(byTime)];
  const label = (t: Task) => (t.projectId === "inbox" ? undefined : projectNames[t.projectId]);
  const counts = [
    ownEvents.length + events.length ? `${ownEvents.length + events.length} ${ownEvents.length + events.length === 1 ? "event" : "events"}` : "",
    todo.length ? `${todo.length} ${todo.length === 1 ? "task" : "tasks"}` : "",
  ].filter(Boolean);
  const empty = !ownEvents.length && !events.length && !todo.length && !done.length && !dayTrips.length;
  return (
    <aside className="calendar-day-panel" aria-label={`${format(parseISO(dayKey), "EEEE d MMMM")}`}>
      <h2>{format(parseISO(dayKey), "EEEE d MMMM")}</h2>
      <div className="calendar-day-sub">
        {[isTodayKey ? "Today" : "", ...counts].filter(Boolean).join(" · ") || (empty ? "Nothing planned" : "")}
      </div>
      {dayTrips.map((t) => (
        <button
          key={t.period.id}
          className={`mcal-away-banner ${tripLook(t) === "mine" ? "" : `is-${tripLook(t)}`} ${t.mine || t.projectId ? "" : "is-theirs"}`}
          onClick={() => onTrip(t)}
        >
          {tripIcon(t.period)}
          <span className="mcal-away-text">
            <b>
              {t.period.by === "off" ? "Off work" : "Away"} · {tripName(t)}
            </b>
            <span>
              {awayRange(t.period)}
              {t.period.note ? ` · ${t.period.note}` : ""}
            </span>
          </span>
        </button>
      ))}
      {(ownEvents.length > 0 || events.length > 0) && <div className="calendar-day-head">Events</div>}
      {events.map((e) => (
        <div key={e.id} className="calendar-event-chip calendar-day-feed" style={{ borderLeftColor: e.color }} title={e.title}>
          {e.start && !e.allDay && <span className="calendar-chip-time">{format(new Date(e.start), "HH:mm")}</span>}
          {e.title}
        </div>
      ))}
      {ownEvents.map((t) => (
        <TaskRow key={t.id} task={t} onOpen={onOpenTask} projectLabel={label(t)} />
      ))}
      {todo.length > 0 && <div className="calendar-day-head">To do</div>}
      {todo.map((t) => (
        <TaskRow key={t.id} task={t} onOpen={onOpenTask} projectLabel={label(t)} />
      ))}
      <button className="calendar-day-add" onClick={onAdd}>
        + Add task or event
      </button>
      {done.length > 0 && (
        <>
          <div className="calendar-day-head">Done</div>
          <div className="mcal-done">
            {done.map((d) => (
              <span key={`${d.taskId}@${d.at}`} className="mcal-done-row">
                <s>✓ {d.content}</s>
                <i>{format(new Date(d.at), "HH:mm")}</i>
              </span>
            ))}
          </div>
        </>
      )}
    </aside>
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

/** `short`: just the start time (the month beside its day panel, where room is tight). */
function TaskChip({ task, onOpen, short }: { task: Task; onOpen: () => void; short?: boolean }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: task.id });
  const time = timeOf(task);
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`calendar-task-chip ${isEvent(task) ? "is-event" : ""} ${task.completed ? "is-past" : ""} ${isDragging ? "is-dragging" : ""}`}
      style={
        isEvent(task)
          ? undefined
          : ({ borderLeftColor: PRIORITY_META[task.priority].color, "--dot": PRIORITY_META[task.priority].color } as React.CSSProperties)
      }
      onClick={onOpen}
      title={isEvent(task) ? `${task.content} · ${eventTimeLabel(task)}` : task.content}
    >
      {time && <span className="calendar-chip-time">{isEvent(task) && task.endTime && !short ? `${time}–${task.endTime}` : time}</span>}
      {task.content}
    </button>
  );
}
