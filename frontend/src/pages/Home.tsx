import { useEffect, useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { useBootstrap, useCompleteTask, useRevertRecurringCompletion, useUpdateTask } from "../api/hooks";
import type { CalendarEvent, Due, Task } from "../api/types";
import TaskRow from "../components/TaskRow";
import TaskDetail from "../components/TaskDetail";
import FocusMode from "../components/FocusMode";
import { useFocusCard } from "../utils/focusCard";
import { useWeeklyReview } from "../utils/weeklyReview";
import PriorityMark from "../components/PriorityMark";
import { useToast } from "../components/ToastProvider";
import { groupEventsByDate } from "../utils/calendarSync";
import { isDueToday, isOverdue, todayISO } from "../utils/date";
import { OPEN_WEEKLY_REVIEW, reviewDueToday } from "../components/WeeklyReview";
import { awayRange, projectRoute, tripsOf, tripWhen, tripIcon } from "../utils/away";
import { useNavigate } from "react-router-dom";

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

/** How many timed things the Later today card lists before "+ N more". */
const AGENDA_ROWS = 3;

/** "in 25 min", "in 1 h 35 min", "in 4 h" (minutes dropped from 3 h on). */
function untilText(iso: string): string {
  const mins = Math.max(1, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m && h < 3 ? `in ${h} h ${m} min` : `in ${h} h`;
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
  | { kind: "event"; at: string; event: CalendarEvent };

/**
 * The Soča home: Now (today and anything late), Next (the rest of this week)
 * and Later (everything further out). Now leads with one focus task, then
 * shows a small Later today card -- timed tasks and calendar events not over
 * yet, with how soon -- and then what can happen any time today.
 */
export default function Home() {
  const { data, isLoading } = useBootstrap();
  const navigate = useNavigate();
  const completeTask = useCompleteTask();
  const revertRecurring = useRevertRecurringCompletion();
  const updateTask = useUpdateTask();
  const showToast = useToast();
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [focusTask, setFocusTask] = useState<Task | null>(null);
  const [pane, setPane] = useState<Pane>("now");
  const [agendaOpen, setAgendaOpen] = useState(false);
  // Re-render each minute so the "now" marker and late labels stay current.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // The focus task can be switched off (Settings > Appearance): then it's
  // just one of today's tasks in the lists below.
  const focusOn = useFocusCard();
  const view = useMemo(() => {
    if (!data) return null;
    const today = todayISO();
    const weekEnd = format(addDays(new Date(), 7), "yyyy-MM-dd");
    const open = data.tasks.filter((t) => !t.completed && t.due);
    const nowTasks = open.filter((t) => isDueToday(t.due) || isOverdue(t.due)).sort(focusRank);
    const focus = focusOn ? nowTasks[0] || null : null;
    const rest = nowTasks.filter((t) => t !== focus);

    const eventsByDate = groupEventsByDate(data.calendarEvents, data.calendarFeeds);
    const todaysEvents = eventsByDate.get(today) || [];
    const allDay = todaysEvents.filter((e) => e.allDay || !e.start);

    // Timed tasks (still open, so a passed one is late) and the calendar
    // events not over yet -- finished ones are only clutter.
    const nowMs = Date.now();
    const clock: ClockEntry[] = [
      ...rest.filter((t) => isDueToday(t.due) && t.due?.datetime).map((t) => ({ kind: "task" as const, at: t.due!.datetime!, task: t })),
      ...todaysEvents
        .filter((e) => !e.allDay && e.start && new Date(e.end || e.start).getTime() > nowMs)
        .map((e) => ({ kind: "event" as const, at: e.start!, event: e })),
    ];
    clock.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

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
  }, [data, focusOn]);

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
  const reviewOn = useWeeklyReview();
  const reviewCount = reviewOn ? reviewDueToday(data) : 0;
  // The next trip (yours or a project's) in the coming two months, or the one under way.
  const nextTrip = (() => {
    const today = todayISO();
    const soon = format(addDays(new Date(), 60), "yyyy-MM-dd");
    const trip = tripsOf(data)
      .filter((t) => t.mine && t.period.end >= today && t.period.start <= soon)
      .sort((a, b) => a.period.start.localeCompare(b.period.start))[0];
    if (!trip) return null;
    const todo = trip.projectId ? data.tasks.filter((t) => t.projectId === trip.projectId && !t.completed).length : 0;
    return { trip, when: tripWhen(trip.period, today)!, todo };
  })();
  // The next thing still to come: highlighted in Later today.
  const firstAhead = view.clock.find(
    (c) => (c.kind === "event" && c.event.end ? new Date(c.event.end) : new Date(c.at)).getTime() > Date.now()
  );
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
      ) : view.nowTasks.length > 0 ? null : (
        <div className="home-clear">
          <b>Nothing due today.</b>
          <span>Pick something from Next, or enjoy the free day.</span>
        </div>
      )}

      {nextTrip && (
        <button
          className="home-trip"
          onClick={() => {
            // Open the calendar on the trip's month (today's, if it's already under way).
            const start = nextTrip.trip.period.start;
            const day = start > todayISO() ? start : todayISO();
            navigate(nextTrip.trip.projectId ? projectRoute(nextTrip.trip.projectId) : `/app/calendar?day=${day}`);
          }}
        >
          <span aria-hidden="true">{tripIcon(nextTrip.trip.period)}</span>
          <span className="home-trip-text">
            <b>
              {nextTrip.when === "now" ? "Away · " : "Next trip · "}
              {nextTrip.trip.period.title}
            </b>
            <span>
              {awayRange(nextTrip.trip.period)}
              {nextTrip.todo > 0 ? ` · ${nextTrip.todo} to do` : ""}
            </span>
          </span>
          <span className="home-trip-when">{nextTrip.when === "now" ? "now" : nextTrip.when}</span>
        </button>
      )}

      {reviewCount > 0 && (
        <button className="home-review" onClick={() => window.dispatchEvent(new Event(OPEN_WEEKLY_REVIEW))}>
          <span aria-hidden="true">🗂️</span>
          <span className="home-review-text">
            <b>Weekly review</b>
            <span>
              {reviewCount} {reviewCount === 1 ? "task" : "tasks"} to sort: overdue or without a date
            </span>
          </span>
          <span className="home-review-go">Start</span>
        </button>
      )}

      {view.clock.length > 0 && (
        <div className="home-agenda">
          <div className="home-agenda-head">
            <span>Later today</span>
            <span>{view.clock.length}</span>
          </div>
          {(agendaOpen ? view.clock : view.clock.slice(0, AGENDA_ROWS)).map((c) => {
            const start = new Date(c.at).getTime();
            const end = c.kind === "event" && c.event.end ? new Date(c.event.end).getTime() : start;
            const now = Date.now();
            const state = start > now ? "ahead" : end > now ? "on" : "late";
            const title = c.kind === "event" ? c.event.title : c.task.content;
            const rel = state === "ahead" ? untilText(c.at) : state === "on" ? "now" : "late";
            const body = (
              <>
                <span className="home-agenda-time">{timeOf(c.at)}</span>
                <span
                  className={`home-agenda-kind ${c.kind === "event" ? "is-event" : ""}`}
                  style={c.kind === "event" && c.event.color ? { background: c.event.color } : undefined}
                  aria-hidden="true"
                />
                <span className="home-agenda-title">{title}</span>
                <span className="home-agenda-rel">{rel}</span>
              </>
            );
            const cls = `home-agenda-row is-${state} ${c === firstAhead ? "is-first" : ""}`;
            return c.kind === "task" ? (
              <button key={c.task.id} type="button" className={cls} onClick={() => setOpenTask(c.task)}>
                {body}
              </button>
            ) : (
              <div key={c.event.id} className={cls}>
                {body}
              </div>
            );
          })}
          {view.clock.length > AGENDA_ROWS && (
            <button type="button" className="home-agenda-more" onClick={() => setAgendaOpen((o) => !o)}>
              {agendaOpen ? "Show less" : `+ ${view.clock.length - AGENDA_ROWS} more`}
            </button>
          )}
        </div>
      )}

      {view.anytime.length > 0 && (
        <div className="home-group">
          <div className="home-label">
            <span>Also today</span>
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
