import { useEffect, useMemo, useState } from "react";
import { addDays, parseISO } from "date-fns";
import { tr, format, trn, cap } from "../i18n";
import { useBootstrap, useCompleteTask, useRevertRecurringCompletion, useUpdateTask } from "../api/hooks";
import type { CalendarEvent, Due, Task } from "../api/types";
import TaskRow from "../components/TaskRow";
import TaskDetail from "../components/TaskDetail";
import FocusMode from "../components/FocusMode";
import { useFocusCard } from "../utils/focusCard";
import { useWeeklyReview } from "../utils/weeklyReview";
import { useHidden } from "../utils/simple";
import PriorityMark from "../components/PriorityMark";
import { useToast } from "../components/ToastProvider";
import { groupEventsByDate } from "../utils/calendarSync";
import { isDueToday, isOverdue, todayISO } from "../utils/date";
import { EVENT_COLOR, eventEnd, isEvent } from "../utils/events";
import { OPEN_WEEKLY_REVIEW, reviewDueToday } from "../components/WeeklyReview";
import { TRIP_NOW, awayRange, projectRoute, tripsOf, tripWhen, tripIcon } from "../utils/away";
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
  if (mins < 60) return tr(`in ${mins} min`, `čez ${mins} min`);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m && h < 3 ? tr(`in ${h} h ${m} min`, `čez ${h} h ${m} min`) : tr(`in ${h} h`, `čez ${h} h`);
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
  const reviewOn = useWeeklyReview();
  // Simple (Settings): a free day is just a free day.
  const plainEmpty = useHidden("nowNext");
  const view = useMemo(() => {
    if (!data) return null;
    const today = todayISO();
    const weekEnd = format(addDays(new Date(), 7), "yyyy-MM-dd");
    const open = data.tasks.filter((t) => !t.completed && t.due);
    // Events aren't things to do: never the focus task, never late.
    const nowTasks = open.filter((t) => !isEvent(t) && (isDueToday(t.due) || isOverdue(t.due))).sort(focusRank);
    const todaysOwnEvents = open.filter((t) => isEvent(t) && isDueToday(t.due));
    const focus = focusOn ? nowTasks[0] || null : null;
    const rest = nowTasks.filter((t) => t !== focus);

    const eventsByDate = groupEventsByDate(data.calendarEvents, data.calendarFeeds);
    const todaysEvents = eventsByDate.get(today) || [];
    const allDay = todaysEvents.filter((e) => e.allDay || !e.start);

    // Timed tasks (still open, so a passed one is late) and the calendar
    // events not over yet -- finished ones are only clutter.
    const nowMs = Date.now();
    const clock: ClockEntry[] = [
      ...[...rest, ...todaysOwnEvents]
        .filter((t) => isDueToday(t.due) && t.due?.datetime)
        .map((t) => ({ kind: "task" as const, at: t.due!.datetime!, task: t })),
      ...todaysEvents
        .filter((e) => !e.allDay && e.start && new Date(e.end || e.start).getTime() > nowMs)
        .map((e) => ({ kind: "event" as const, at: e.start!, event: e })),
    ];
    clock.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    const anytime = [...todaysOwnEvents.filter((t) => !t.due?.datetime), ...rest.filter((t) => !(isDueToday(t.due) && t.due?.datetime))];

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
      message: task.due?.isRecurring ? tr("Moved to next occurrence", "Prestavljeno na naslednjič") : tr("Task completed", "Naloga opravljena"),
      actionLabel: tr("Undo", "Razveljavi"),
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
      message: tr("Moved to tomorrow", "Prestavljeno na jutri"),
      actionLabel: tr("Undo", "Razveljavi"),
      onAction: () => updateTask.mutate({ id: task.id, due: previousDue }),
    });
  }

  const focus = view.focus;
  const reviewCount = reviewOn ? reviewDueToday(data) : 0;
  // The next trip (yours or a project's) in the coming two months, or the one under way.
  const nextTrip = (() => {
    const today = todayISO();
    const soon = format(addDays(new Date(), 60), "yyyy-MM-dd");
    const trip = tripsOf(data)
      .filter((t) => (t.mine || t.period.together) && t.period.end >= today && t.period.start <= soon)
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
          <b>{cap(format(new Date(), "EEEE"))}</b>
          <span>
            {format(new Date(), "LLLL")} · {tr(`${view.nowTasks.length} for today`, `danes ${view.nowTasks.length}`)}
            {view.lateCount > 0 && tr(`, ${view.lateCount} late`, `, zamujenih ${view.lateCount}`)}
          </span>
        </span>
      </div>

      {view.allDay.map((e) => (
        <div key={e.id} className="home-allday">
          <span className="home-mono">{tr("ALL DAY", "VES DAN")}</span> {e.title}
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
              {lateDays > 0 && (
                <span className="home-late">
                  {" · "}
                  {trn(lateDays, ["# day late", "# days late"], ["# dan zamude", "# dneva zamude", "# dni zamude", "# dni zamude"])}
                </span>
              )}
            </span>
            <span className="home-focus-actions">
              <button className="btn btn-text" onClick={() => moveToTomorrow(focus)}>
                {tr("Tomorrow", "Jutri")}
              </button>
              <button className="btn btn-text" onClick={() => complete(focus)}>
                {tr("Done", "Opravljeno")}
              </button>
              <button className="btn btn-primary" onClick={() => setFocusTask(focus)}>
                {tr("Start focus", "Začni fokus")}
              </button>
            </span>
          </div>
        </div>
      ) : view.nowTasks.length > 0 ? null : (
        <div className="home-clear">
          <b>{tr("Nothing due today.", "Danes ni nič na sporedu.")}</b>
          <span>
            {plainEmpty
              ? tr("Enjoy the free day.", "Uživaj v prostem dnevu.")
              : tr("Pick something from Next, or enjoy the free day.", "Izberi kaj iz Naslednje ali uživaj v prostem dnevu.")}
          </span>
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
              {nextTrip.trip.period.by === "off"
                ? nextTrip.when === TRIP_NOW
                  ? tr("Off work · ", "Dopust · ")
                  : tr("Time off · ", "Prosti dnevi · ")
                : nextTrip.when === TRIP_NOW
                  ? tr("Away · ", "Odsoten · ")
                  : tr("Next trip · ", "Naslednje potovanje · ")}
              {nextTrip.trip.period.title}
            </b>
            <span>
              {awayRange(nextTrip.trip.period)}
              {nextTrip.todo > 0 ? tr(` · ${nextTrip.todo} to do`, ` · še ${nextTrip.todo}`) : ""}
            </span>
          </span>
          <span className="home-trip-when">{nextTrip.when}</span>
        </button>
      )}

      {reviewCount > 0 && (
        <button className="home-review" onClick={() => window.dispatchEvent(new Event(OPEN_WEEKLY_REVIEW))}>
          <span aria-hidden="true">🗂️</span>
          <span className="home-review-text">
            <b>{tr("Weekly review", "Tedenski pregled")}</b>
            <span>
              {trn(
                reviewCount,
                ["# task to sort: overdue or without a date", "# tasks to sort: overdue or without a date"],
                ["# naloga za urediti: zamujena ali brez datuma", "# nalogi za urediti: zamujeni ali brez datuma", "# naloge za urediti: zamujene ali brez datuma", "# nalog za urediti: zamujene ali brez datuma"]
              )}
            </span>
          </span>
          <span className="home-review-go">{tr("Start", "Začni")}</span>
        </button>
      )}

      {view.clock.length > 0 && (
        <div className="home-agenda">
          <div className="home-agenda-head">
            <span>{tr("Later today", "Pozneje danes")}</span>
            <span>{view.clock.length}</span>
          </div>
          {(agendaOpen ? view.clock : view.clock.slice(0, AGENDA_ROWS)).map((c) => {
            const start = new Date(c.at).getTime();
            const own = c.kind === "task" && isEvent(c.task);
            const end =
              c.kind === "event" && c.event.end
                ? new Date(c.event.end).getTime()
                : own
                  ? (eventEnd(c.task)?.getTime() ?? start)
                  : start;
            const now = Date.now();
            const state = start > now ? "ahead" : end > now ? "on" : "late";
            const title = c.kind === "event" ? c.event.title : c.task.content;
            const rel = state === "ahead" ? untilText(c.at) : state === "on" ? tr("now", "zdaj") : tr("late", "zamuja");
            const body = (
              <>
                <span className="home-agenda-time">
                  {timeOf(c.at)}
                  {own && c.task.endTime ? `–${c.task.endTime}` : ""}
                </span>
                <span
                  className={`home-agenda-kind ${c.kind === "event" || own ? "is-event" : ""}`}
                  style={c.kind === "event" && c.event.color ? { background: c.event.color } : own ? { background: EVENT_COLOR } : undefined}
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
              {agendaOpen ? tr("Show less", "Pokaži manj") : tr(`+ ${view.clock.length - AGENDA_ROWS} more`, `+ še ${view.clock.length - AGENDA_ROWS}`)}
            </button>
          )}
        </div>
      )}

      {view.anytime.length > 0 && (
        <div className="home-group">
          <div className="home-label">
            <span>{tr("Also today", "Tudi danes")}</span>
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
  const dayName = (d: string) => format(parseISO(d), tr("EEE d", "EEE d.")).toUpperCase();

  const nextPane = (
    <section className="home-next">
      <div className="home-label">
        <span>{tr("Next · this week", "Naslednje · ta teden")}</span>
        <span>{nextCount}</span>
      </div>
      {dayBlocks.map((b) =>
        b.kind === "empty" ? (
          <div key={b.from} className="home-day-empty">
            <span className="home-mono">{b.from === b.to ? dayName(b.from) : `${dayName(b.from)} – ${dayName(b.to)}`}</span>
            <span>{tr("Nothing planned", "Nič načrtovanega")}</span>
          </div>
        ) : (
          <div key={b.day.date} className="home-day-block">
            <div className="home-day-label home-mono">{dayName(b.day.date)}</div>
            {b.day.events.map((e) => (
              <div key={e.id} className="home-event compact" style={{ ["--event-color" as string]: e.color }}>
                <span className="home-mono">{e.allDay || !e.start ? tr("all day", "ves dan") : timeOf(e.start)}</span>
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
        <span>{tr("Later", "Pozneje")}</span>
        <span>{view.later.length}</span>
      </div>
      {view.later.length === 0 ? (
        <div className="home-day-empty">
          <span>{tr("Nothing scheduled beyond this week.", "Po tem tednu ni nič načrtovano.")}</span>
        </div>
      ) : (
        view.later.map((t, i) => {
          const month = format(parseISO(t.due!.date), "LLLL yyyy");
          const showMonth = i === 0 || format(parseISO(view.later[i - 1].due!.date), "LLLL yyyy") !== month;
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

      <nav className="home-segments" aria-label={tr("Horizon", "Obzorje")}>
        {(
          [
            ["now", tr("Now", "Zdaj"), view.nowTasks.length],
            ["next", tr("Next", "Naslednje"), nextCount],
            ["later", tr("Later", "Pozneje"), view.later.length],
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
