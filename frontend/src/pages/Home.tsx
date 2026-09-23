import { useEffect, useMemo, useState } from "react";
import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from "date-fns";
import { useBootstrap, useCompleteTask, useRevertRecurringCompletion, useUpdateTask } from "../api/hooks";
import type { CalendarEvent, Due, Task } from "../api/types";
import TaskRow from "../components/TaskRow";
import TaskDetail from "../components/TaskDetail";
import FocusMode from "../components/FocusMode";
import PriorityMark from "../components/PriorityMark";
import DayRail from "../components/DayRail";
import { ChevronIcon } from "../components/icons";
import { useToast } from "../components/ToastProvider";
import { groupEventsByDate } from "../utils/calendarSync";
import { isDueToday, isOverdue, todayISO } from "../utils/date";

type Pane = "now" | "next" | "later";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** Stored priority 4 = p1 (most urgent). */
function focusRank(a: Task, b: Task): number {
  return (
    b.priority - a.priority ||
    Number(isOverdue(b.due)) - Number(isOverdue(a.due)) ||
    (a.due?.datetime || "~").localeCompare(b.due?.datetime || "~") ||
    (a.due?.date || "").localeCompare(b.due?.date || "") ||
    a.order - b.order
  );
}

function timeOf(value: string): string {
  return format(parseISO(value), "HH:mm");
}

/** "Tue" within the last week, otherwise "Sep 12" -- when a late task was due. */
function carriedLabel(date: string): string {
  const d = parseISO(date);
  return differenceInCalendarDays(new Date(), d) < 7 ? format(d, "EEE") : format(d, "MMM d");
}

/** Moves a due date to another day, keeping its time and repeat rule. */
function dueOn(due: Due | null, day: Date, label: string): Due {
  const date = iso(day);
  if (!due) return { date, string: label, isRecurring: false };
  let datetime = due.datetime;
  if (datetime) {
    const d = new Date(datetime);
    const t = new Date(day);
    t.setHours(d.getHours(), d.getMinutes(), 0, 0);
    datetime = t.toISOString();
  }
  return { ...due, date, datetime, string: due.isRecurring ? due.string : label };
}

/** Gives a task a time on its day (tapping an hour on the rail). */
function dueAt(due: Due, hour: number): Due {
  const t = parseISO(due.date);
  t.setHours(hour, 0, 0, 0);
  return {
    ...due,
    datetime: t.toISOString(),
    string: due.isRecurring ? due.string : format(t, "MMM d, yyyy 'at' HH:mm"),
  };
}

/**
 * The Soča home: Now (a day, today unless another is picked in the week
 * strip), Next (the rest of this week) and Later (everything further out).
 * The day is laid out like a planner page -- an hour rail with timed tasks,
 * calendar events and the current time, next to everything else due that day
 * -- with today's most urgent task lifted into a focus card.
 */
export default function Home() {
  const { data, isLoading } = useBootstrap();
  const completeTask = useCompleteTask();
  const revertRecurring = useRevertRecurringCompletion();
  const updateTask = useUpdateTask();
  const showToast = useToast();
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [focusTask, setFocusTask] = useState<Task | null>(null);
  const [pane, setPane] = useState<Pane>("now");
  const [laterOpen, setLaterOpen] = useState(false);
  const [selected, setSelected] = useState(todayISO);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  // Re-render each minute so "today" and late labels stay current past midnight.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const today = todayISO();
  const isToday = selected === today;

  const view = useMemo(() => {
    if (!data) return null;
    const weekEnd = iso(addDays(new Date(), 7));
    const open = data.tasks.filter((t) => !t.completed && t.due);
    const nowTasks = open.filter((t) => isDueToday(t.due) || isOverdue(t.due)).sort(focusRank);
    const eventsByDate = groupEventsByDate(data.calendarEvents, data.calendarFeeds);

    const nextDays: { date: string; tasks: Task[]; events: CalendarEvent[] }[] = [];
    for (let i = 1; i <= 7; i++) {
      const date = iso(addDays(new Date(), i));
      nextDays.push({ date, tasks: open.filter((t) => t.due!.date === date).sort(focusRank), events: eventsByDate.get(date) || [] });
    }
    const later = open
      .filter((t) => t.due!.date > weekEnd)
      .sort((a, b) => a.due!.date.localeCompare(b.due!.date) || focusRank(a, b));

    const busyDays = new Set<string>([...open.map((t) => t.due!.date), ...[...eventsByDate.keys()]]);
    const projectNameById = Object.fromEntries(data.projects.map((p) => [p.id, p.name]));
    return { open, nowTasks, eventsByDate, nextDays, later, busyDays, projectNameById };
    // `today` keeps the buckets right when the date rolls over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, today]);

  if (isLoading || !data || !view) return null;

  // ---- the day shown in Now ----
  const dayTasks = isToday ? view.nowTasks : view.open.filter((t) => t.due!.date === selected).sort(focusRank);
  const focus = isToday ? dayTasks[0] || null : null;
  const rest = dayTasks.filter((t) => t !== focus);
  const onRail = rest.filter((t) => t.due!.date === selected && t.due!.datetime);
  const anytime = rest.filter((t) => !onRail.includes(t));
  const dayEvents = view.eventsByDate.get(selected) || [];
  const allDay = dayEvents.filter((e) => e.allDay || !e.start);
  const timedEvents = dayEvents.filter((e) => !e.allDay && e.start);
  const lateCount = isToday ? dayTasks.filter((t) => isOverdue(t.due)).length : 0;
  const selectedDate = parseISO(selected);

  const nextCount = view.nextDays.reduce((n, d) => n + d.tasks.length, 0);
  const projectLabel = (t: Task) => (t.projectId === "inbox" ? undefined : view.projectNameById[t.projectId]);
  const carried = (t: Task) => (isToday && isOverdue(t.due) ? carriedLabel(t.due!.date) : undefined);

  function complete(task: Task) {
    const previousDue = task.due;
    completeTask.mutate({ id: task.id, completed: true });
    showToast({
      message: task.due?.isRecurring ? "Moved to next occurrence" : "Task completed",
      actionLabel: "Undo",
      onAction: () =>
        task.due?.isRecurring
          ? revertRecurring.mutate({ id: task.id, due: previousDue })
          : completeTask.mutate({ id: task.id, completed: false }),
    });
  }

  function moveToTomorrow(task: Task) {
    const previousDue = task.due;
    updateTask.mutate({ id: task.id, due: dueOn(task.due, addDays(new Date(), 1), "tomorrow") });
    showToast({ message: "Moved to tomorrow", actionLabel: "Undo", onAction: () => updateTask.mutate({ id: task.id, due: previousDue }) });
  }

  function schedule(task: Task, hour: number) {
    const previousDue = task.due;
    // A late task scheduled from today's rail moves to today as well.
    const base = task.due!.date === selected ? task.due! : dueOn(task.due, selectedDate, format(selectedDate, "MMM d"));
    updateTask.mutate({ id: task.id, due: dueAt(base, hour) });
    showToast({
      message: `“${task.content}” at ${String(hour).padStart(2, "0")}:00`,
      actionLabel: "Undo",
      onAction: () => updateTask.mutate({ id: task.id, due: previousDue }),
    });
  }

  function pickDay(date: string) {
    setSelected(date);
    setPane("now");
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => iso(addDays(weekStart, i)));
  const focusCarried = focus && isOverdue(focus.due) ? carriedLabel(focus.due!.date) : null;

  const nowPane = (
    <section className="home-now">
      <div className="home-head">
        <div className="home-date">
          <span className="home-day">{format(selectedDate, "d")}</span>
          <span className="home-date-text">
            <b>{format(selectedDate, "EEEE")}</b>
            <span>
              {format(selectedDate, "MMMM")} · {dayTasks.length} {isToday ? "for today" : dayTasks.length === 1 ? "task" : "tasks"}
              {lateCount > 0 && `, ${lateCount} carried over`}
            </span>
          </span>
        </div>
        <div className="home-week" aria-label="Week">
          <button className="home-week-arrow" onClick={() => setWeekStart((w) => addDays(w, -7))} aria-label="Previous week">
            <ChevronIcon width={14} height={14} style={{ transform: "rotate(90deg)" }} />
          </button>
          {weekDays.map((d) => {
            const date = parseISO(d);
            return (
              <button
                key={d}
                className={`home-week-day ${d === selected ? "is-selected" : ""} ${d === today ? "is-today" : ""}`}
                onClick={() => pickDay(d)}
                aria-pressed={d === selected}
                aria-label={format(date, "EEEE d MMMM")}
              >
                <span>{format(date, "EEEEE")}</span>
                <b>{format(date, "d")}</b>
                <i className={view.busyDays.has(d) ? "has-items" : ""} />
              </button>
            );
          })}
          <button className="home-week-arrow" onClick={() => setWeekStart((w) => addDays(w, 7))} aria-label="Next week">
            <ChevronIcon width={14} height={14} style={{ transform: "rotate(-90deg)" }} />
          </button>
        </div>
      </div>

      {!isToday && (
        <button
          className="home-back-today"
          onClick={() => {
            setSelected(today);
            setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
          }}
        >
          ← Back to today
        </button>
      )}

      {allDay.map((e) => (
        <div key={e.id} className="home-allday">
          <span className="home-mono">ALL DAY</span> {e.title}
        </div>
      ))}

      {isToday &&
        (focus ? (
          <div className={`home-focus ${focusCarried ? "is-carried" : ""}`}>
            <div className="home-focus-row">
              <button className="home-focus-title" onClick={() => setOpenTask(focus)}>
                <span>{focus.content}</span>
              </button>
              <PriorityMark priority={focus.priority} />
            </div>
            <div className="home-focus-row">
              <span className="home-focus-meta">
                {view.projectNameById[focus.projectId]}
                {focus.due?.datetime && ` · ${timeOf(focus.due.datetime)}`}
                {focusCarried && <span className="home-carried-note"> · ↪ carried over from {focusCarried}</span>}
              </span>
              <span className="home-focus-actions">
                <button className="btn btn-text" onClick={() => moveToTomorrow(focus)}>
                  Tomorrow
                </button>
                <button className="btn btn-text" onClick={() => complete(focus)}>
                  Done
                </button>
                <button className="btn btn-primary" onClick={() => setFocusTask(focus)}>
                  Start focus
                </button>
              </span>
            </div>
          </div>
        ) : (
          <div className="home-clear">
            <b>Nothing due today.</b>
            <span>Pick something from Next, or enjoy the free day.</span>
          </div>
        ))}

      <div className="home-spread">
        <div className="home-group home-rail-group">
          <div className="home-label">
            <span>The day</span>
            <span>{anytime.length > 0 ? "tap an hour to schedule" : ""}</span>
          </div>
          <DayRail
            date={selected}
            tasks={onRail}
            events={timedEvents}
            isToday={isToday}
            schedulable={anytime}
            onOpenTask={setOpenTask}
            onComplete={complete}
            onSchedule={schedule}
          />
        </div>
        <div className="home-group home-anytime">
          <div className="home-label">
            <span>{isToday ? "Any time today" : "Any time"}</span>
            <span>{anytime.length}</span>
          </div>
          {anytime.map((t) => (
            <TaskRow key={t.id} task={t} onOpen={setOpenTask} projectLabel={projectLabel(t)} carriedFrom={carried(t)} />
          ))}
          {anytime.length === 0 && <div className="home-day-empty">Nothing without a time.</div>}
        </div>
      </div>
    </section>
  );

  // Runs of empty days fold into one line ("Fri–Sun · nothing planned").
  const dayBlocks: ({ kind: "day"; day: (typeof view.nextDays)[number] } | { kind: "empty"; from: string; to: string })[] = [];
  for (const day of view.nextDays) {
    if (day.tasks.length === 0 && day.events.length === 0) {
      const last = dayBlocks[dayBlocks.length - 1];
      if (last?.kind === "empty") last.to = day.date;
      else dayBlocks.push({ kind: "empty", from: day.date, to: day.date });
    } else {
      dayBlocks.push({ kind: "day", day });
    }
  }
  const dayName = (d: string) => format(parseISO(d), "EEE d").toUpperCase();

  const nextPane = (
    <section className="home-next">
      <div className="home-label">
        <span>Next · this week</span>
        <span>{nextCount}</span>
      </div>
      {dayBlocks.map((b) =>
        b.kind === "empty" ? (
          <div key={b.from} className="home-day-empty">
            <span className="home-mono">{b.from === b.to ? dayName(b.from) : `${dayName(b.from)} – ${dayName(b.to)}`}</span>
            <span>Nothing planned</span>
          </div>
        ) : (
          <div key={b.day.date} className="home-day-block">
            <button className="home-day-label home-mono" onClick={() => pickDay(b.day.date)} title="Show this day">
              {dayName(b.day.date)}
            </button>
            {b.day.events.map((e) => (
              <div key={e.id} className="home-event compact" style={{ ["--event-color" as string]: e.color }}>
                <span className="home-mono">{e.allDay || !e.start ? "all day" : timeOf(e.start)}</span>
                <span className="home-event-title">{e.title}</span>
              </div>
            ))}
            {b.day.tasks.map((t) => (
              <TaskRow key={t.id} task={t} onOpen={setOpenTask} projectLabel={projectLabel(t)} />
            ))}
          </div>
        )
      )}
    </section>
  );

  const laterPreview = view.later.slice(0, 3).map((t) => t.content).join(", ");
  const laterPane = (
    <section className="home-later">
      <div className="home-label">
        <span>Later</span>
        <span>{view.later.length}</span>
      </div>
      {view.later.length === 0 ? (
        <div className="home-day-empty">
          <span>Nothing scheduled beyond this week.</span>
        </div>
      ) : laterOpen || pane === "later" ? (
        view.later.map((t, i) => {
          const month = format(parseISO(t.due!.date), "MMMM yyyy");
          const showMonth = i === 0 || format(parseISO(view.later[i - 1].due!.date), "MMMM yyyy") !== month;
          return (
            <div key={t.id}>
              {showMonth && <div className="home-day-label home-mono">{month.toUpperCase()}</div>}
              <TaskRow task={t} onOpen={setOpenTask} projectLabel={projectLabel(t)} />
            </div>
          );
        })
      ) : (
        <button className="home-later-toggle" onClick={() => setLaterOpen(true)}>
          <span>
            {laterPreview}
            {view.later.length > 3 && "…"}
          </span>
          <span className="home-mono">Show all →</span>
        </button>
      )}
    </section>
  );

  return (
    <div className="home" data-pane={pane}>
      <div className="home-grid">
        <div className="home-col home-col-now">{nowPane}</div>
        <div className="home-col home-col-side">
          {nextPane}
          {laterPane}
        </div>
      </div>

      <nav className="home-segments" aria-label="Horizon">
        {(
          [
            ["now", isToday ? "Now" : format(selectedDate, "EEE d"), dayTasks.length],
            ["next", "Next", nextCount],
            ["later", "Later", view.later.length],
          ] as const
        ).map(([id, label, n]) => (
          <button key={id} className={pane === id ? "is-active" : ""} onClick={() => setPane(id)}>
            {label}
            <b>{n}</b>
          </button>
        ))}
      </nav>

      {openTask && <TaskDetail task={openTask} onClose={() => setOpenTask(null)} onOpenTask={setOpenTask} />}
      {focusTask && (
        <FocusMode
          task={focusTask}
          projectName={view.projectNameById[focusTask.projectId]}
          onDone={() => {
            complete(focusTask);
            setFocusTask(null);
          }}
          onClose={() => setFocusTask(null)}
        />
      )}
    </div>
  );
}
