import { useEffect, useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { useBootstrap, useCompleteTask, useRevertRecurringCompletion, useUpdateTask } from "../api/hooks";
import type { CalendarEvent, Due, Task } from "../api/types";
import TaskRow from "../components/TaskRow";
import TaskDetail from "../components/TaskDetail";
import FocusMode from "../components/FocusMode";
import PriorityMark from "../components/PriorityMark";
import { useToast } from "../components/ToastProvider";
import { groupEventsByDate } from "../utils/calendarSync";
import { isDueToday, isOverdue, todayISO } from "../utils/date";

type Pane = "now" | "next" | "later";

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

function timeOf(iso: string): string {
  return format(parseISO(iso), "HH:mm");
}

/** Moves a due date to tomorrow, keeping its time and repeat rule. */
function dueTomorrow(due: Due | null): Due {
  const tomorrow = addDays(new Date(), 1);
  const date = format(tomorrow, "yyyy-MM-dd");
  if (!due) return { date, string: "tomorrow", isRecurring: false };
  let datetime = due.datetime;
  if (datetime) {
    const d = new Date(datetime);
    const t = new Date(tomorrow);
    t.setHours(d.getHours(), d.getMinutes(), 0, 0);
    datetime = t.toISOString();
  }
  return { ...due, date, datetime, string: due.isRecurring ? due.string : "tomorrow" };
}

type ClockEntry =
  | { kind: "task"; at: string; task: Task }
  | { kind: "event"; at: string; event: CalendarEvent }
  | { kind: "now"; at: string };

/**
 * The Soča home: Now (today and anything late), Next (the rest of this week)
 * and Later (everything further out). Now leads with one focus task, then
 * splits into what's on the clock -- timed tasks and calendar events, with a
 * "now" marker -- and what can happen any time today.
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
  // Re-render each minute so the "now" marker and late labels stay current.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const today = todayISO();
    const weekEnd = format(addDays(new Date(), 7), "yyyy-MM-dd");
    const open = data.tasks.filter((t) => !t.completed && t.due);
    const nowTasks = open.filter((t) => isDueToday(t.due) || isOverdue(t.due)).sort(focusRank);
    const focus = nowTasks[0] || null;
    const rest = nowTasks.filter((t) => t !== focus);

    const eventsByDate = groupEventsByDate(data.calendarEvents, data.calendarFeeds);
    const todaysEvents = eventsByDate.get(today) || [];
    const allDay = todaysEvents.filter((e) => e.allDay || !e.start);

    const clock: ClockEntry[] = [
      ...rest.filter((t) => isDueToday(t.due) && t.due?.datetime).map((t) => ({ kind: "task" as const, at: t.due!.datetime!, task: t })),
      ...todaysEvents.filter((e) => !e.allDay && e.start).map((e) => ({ kind: "event" as const, at: e.start!, event: e })),
    ];
    if (clock.length) clock.push({ kind: "now", at: new Date().toISOString() });
    clock.sort((a, b) => a.at.localeCompare(b.at));
    // A marker with nothing after it (or before it) says nothing.
    const nowIdx = clock.findIndex((c) => c.kind === "now");
    if (nowIdx === clock.length - 1 || nowIdx === 0) clock.splice(nowIdx, 1);

    const anytime = rest.filter((t) => !(isDueToday(t.due) && t.due?.datetime));

    const nextDays: { date: string; tasks: Task[]; events: CalendarEvent[] }[] = [];
    for (let i = 1; i <= 7; i++) {
      const date = format(addDays(new Date(), i), "yyyy-MM-dd");
      nextDays.push({
        date,
        tasks: open.filter((t) => t.due!.date === date).sort(focusRank),
        events: eventsByDate.get(date) || [],
      });
    }
    const later = open
      .filter((t) => t.due!.date > weekEnd)
      .sort((a, b) => a.due!.date.localeCompare(b.due!.date) || focusRank(a, b));

    const lateCount = nowTasks.filter((t) => isOverdue(t.due)).length;
    const projectNameById = Object.fromEntries(data.projects.map((p) => [p.id, p.name]));
    return { nowTasks, focus, clock, allDay, anytime, nextDays, later, lateCount, projectNameById };
  }, [data]);

  if (isLoading || !data || !view) return null;

  const nextCount = view.nextDays.reduce((n, d) => n + d.tasks.length, 0);
  const projectLabel = (t: Task) => (t.projectId === "inbox" ? undefined : view.projectNameById[t.projectId]);

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
    updateTask.mutate({ id: task.id, due: dueTomorrow(task.due) });
    showToast({
      message: "Moved to tomorrow",
      actionLabel: "Undo",
      onAction: () => updateTask.mutate({ id: task.id, due: previousDue }),
    });
  }

  const focus = view.focus;
  const lateDays = focus && isOverdue(focus.due) ? Math.round((parseISO(todayISO()).getTime() - parseISO(focus.due!.date).getTime()) / 86_400_000) : 0;

  const nowPane = (
    <section className="home-now">
      <div className="home-date">
        <span className="home-day">{format(new Date(), "d")}</span>
        <span className="home-date-text">
          <b>{format(new Date(), "EEEE")}</b>
          <span>
            {format(new Date(), "MMMM")} · {view.nowTasks.length} for today
            {view.lateCount > 0 && `, ${view.lateCount} late`}
          </span>
        </span>
      </div>

      {view.allDay.map((e) => (
        <div key={e.id} className="home-allday">
          <span className="home-mono">ALL DAY</span> {e.title}
        </div>
      ))}

      {focus ? (
        <div className="home-focus">
          <div className="home-focus-row">
            <button className="home-focus-title" onClick={() => setOpenTask(focus)}>
              {focus.content}
            </button>
            <PriorityMark priority={focus.priority} />
          </div>
          <div className="home-focus-row">
            <span className="home-focus-meta">
              {view.projectNameById[focus.projectId]}
              {focus.due?.datetime && ` · ${timeOf(focus.due.datetime)}`}
              {lateDays > 0 && <span className="home-late"> · {lateDays === 1 ? "1 day late" : `${lateDays} days late`}</span>}
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
      )}

      {view.clock.length > 0 && (
        <div className="home-group">
          <div className="home-label">
            <span>On the clock</span>
          </div>
          {view.clock.map((c) =>
            c.kind === "now" ? (
              <div key="now" className="home-now-line">
                <span>{timeOf(c.at)}</span>
              </div>
            ) : c.kind === "event" ? (
              <div key={c.event.id} className="home-event" style={{ ["--event-color" as string]: c.event.color }}>
                <span className="home-mono">{timeOf(c.at)}</span>
                <span className="home-event-title">{c.event.title}</span>
                {c.event.end && <span className="home-mono home-event-end">–{timeOf(c.event.end)}</span>}
              </div>
            ) : (
              <div key={c.task.id} className="home-timed">
                <span className="home-mono home-time">{timeOf(c.at)}</span>
                <TaskRow task={c.task} onOpen={setOpenTask} projectLabel={projectLabel(c.task)} />
              </div>
            )
          )}
        </div>
      )}

      {view.anytime.length > 0 && (
        <div className="home-group">
          <div className="home-label">
            <span>{view.clock.length > 0 ? "Any time today" : "Also today"}</span>
            <span>{view.anytime.length}</span>
          </div>
          {view.anytime.map((t) => (
            <TaskRow key={t.id} task={t} onOpen={setOpenTask} projectLabel={projectLabel(t)} />
          ))}
        </div>
      )}
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
            <div className="home-day-label home-mono">{format(parseISO(b.day.date), "EEE d").toUpperCase()}</div>
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
      ) : (
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
            ["now", "Now", view.nowTasks.length],
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
