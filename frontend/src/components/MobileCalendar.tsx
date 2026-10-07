import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { dayFromParam } from "../utils/calendarTasks";
import { setCalendarDay } from "../utils/calendarDay";
import { appUi } from "../utils/appUi";
import {
  doneByDay,
  useCalendarDone,
  type DoneEntry,
} from "../utils/calendarDone";
import { EVENT_COLOR, eventTimeLabel, isEvent } from "../utils/events";
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, isSameDay, isSameMonth, isToday, parseISO, startOfMonth, startOfWeek, subMonths, subWeeks } from "date-fns";
import { tr, format, trn, isSl, cap } from "../i18n";
import type { CalendarEvent, Task } from "../api/types";
import { useBootstrap } from "../api/hooks";
import { PRIORITY_META } from "../utils/priority";
import { isOverdue } from "../utils/date";
import TaskListView from "./TaskListView";
import RescheduleButton from "./RescheduleButton";
import { ChevronIcon } from "./icons";
import type { AwayPeriod } from "../api/types";
import {
  awayRange,
  projectRoute,
  tripName,
  tripsOf,
  tripsOn,
  tripIcon,
  tripLook,
} from "../utils/away";
import { useNavigate } from "react-router-dom";
import AwaySheet from "./AwaySheet";

const WEEK_OPTS = { weekStartsOn: 1 as const };
const OPEN_KEY = "opravilko.mcalMonth";

/** Narrow screens (a phone): the month grid's cells are too small to read there. */
const NARROW = "(max-width: 600px)";
export function useNarrowScreen(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(NARROW);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(NARROW).matches,
  );
}

/** The whole month shows unless you've folded it down to a week. */
function storedOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

/**
 * The calendar on a phone: a week (or, opened, the month) of day numbers
 * with a dot per task, and the picked day's tasks as a normal list below --
 * readable, tickable, with Add task for that day.
 */
export default function MobileCalendar({
  tasks,
  projectId,
  eventsByDate,
}: {
  tasks: Task[];
  projectId: string;
  eventsByDate?: Map<string, CalendarEvent[]>;
}) {
  const { data } = useBootstrap();
  const [searchParams] = useSearchParams();
  const [selected, setSelected] = useState(() =>
    dayFromParam(searchParams.get("day")),
  );
  const [cursor, setCursor] = useState(() =>
    dayFromParam(searchParams.get("day")),
  );
  // A day tapped in the widget while the calendar is already open: go to it.
  const location = useLocation();
  const dayParam = searchParams.get("day");
  useEffect(() => {
    if (!dayParam) return;
    const d = dayFromParam(dayParam);
    setSelected(d);
    setCursor(d);
  }, [dayParam, location.key]);
  const [monthOpen, setMonthOpenState] = useState(storedOpen);
  const touch = useRef<{ x: number; y: number } | null>(null);

  function setMonthOpen(open: boolean) {
    setMonthOpenState(open);
    setCursor(selected);
    try {
      localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  // Sub-tasks with their own date too (as in Now and Upcoming).
  const open = tasks.filter((t) => !t.completed && t.due);
  const trips = tripsOf(data);
  const navigate = useNavigate();
  const [awayEdit, setAwayEdit] = useState<{
    period?: AwayPeriod;
    startDay?: string;
  } | null>(null);
  const byDate = new Map<string, Task[]>();
  for (const t of open) {
    const key = t.due!.date;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(t);
  }

  const days: Date[] = [];
  if (monthOpen) {
    const end = endOfWeek(endOfMonth(cursor), WEEK_OPTS);
    for (
      let d = startOfWeek(startOfMonth(cursor), WEEK_OPTS);
      d <= end;
      d = addDays(d, 1)
    )
      days.push(d);
  } else {
    const start = startOfWeek(cursor, WEEK_OPTS);
    for (let i = 0; i < 7; i++) days.push(addDays(start, i));
  }

  function step(dir: 1 | -1) {
    setCursor((c) =>
      monthOpen
        ? dir > 0
          ? addMonths(c, 1)
          : subMonths(c, 1)
        : dir > 0
          ? addWeeks(c, 1)
          : subWeeks(c, 1),
    );
  }
  function goToday() {
    const now = new Date();
    setSelected(now);
    setCursor(now);
  }

  // Swipe the days sideways for the next / previous week (or month).
  function onTouchStart(e: React.TouchEvent) {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5)
      step(dx < 0 ? 1 : -1);
  }

  const key = format(selected, "yyyy-MM-dd");
  // The + at the bottom adds on the day picked here.
  useEffect(() => {
    setCalendarDay(key);
    return () => setCalendarDay(null);
  }, [key]);
  const selectedTrips = tripsOn(trips, key);
  // What got done that day (Settings > Appearance), under its trips.
  const showDone = useCalendarDone();
  const doneMap = showDone ? doneByDay(data) : new Map<string, DoneEntry[]>();
  const dayDone =
    key <= format(new Date(), "yyyy-MM-dd") ? (doneMap.get(key) ?? []) : [];
  const showOverdue = isToday(selected);
  const overdue = showOverdue ? open.filter((t) => isOverdue(t.due)) : [];
  const dayTasks = byDate.get(key) ?? [];
  // Events that are over stay on their day, greyed.
  const pastEvents = tasks.filter(
    (t) => isEvent(t) && t.completed && t.due?.date === key,
  );
  const dayLabel = `${cap(format(selected, tr("EEEE, d MMM", "EEEE, d. MMM")))}${isToday(selected) ? tr(" · Today", " · Danes") : ""}`;
  const projectNameById = Object.fromEntries(
    (data?.projects ?? []).map((p) => [p.id, p.name]),
  );

  return (
    <div className="mcal">
      <div
        className="mcal-top"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="mcal-head">
          <button
            className="mcal-title"
            onClick={() => setMonthOpen(!monthOpen)}
            aria-expanded={monthOpen}
          >
            {cap(format(cursor, "LLLL yyyy"))}
            <ChevronIcon
              width={16}
              height={16}
              className={monthOpen ? "open" : ""}
            />
          </button>
          <div className="mcal-nav">
            <button
              onClick={() => step(-1)}
              aria-label={monthOpen ? tr("Previous month", "Prejšnji mesec") : tr("Previous week", "Prejšnji teden")}
            >
              <ChevronIcon
                width={18}
                height={18}
                style={{ transform: "rotate(90deg)" }}
              />
            </button>
            <button
              className="mcal-away-btn"
              onClick={() =>
                setAwayEdit({ startDay: format(selected, "yyyy-MM-dd") })
              }
              aria-label={tr("Mark days you're away", "Označi dneve, ko te ni")}
            >
              ✈️
            </button>
            <button className="mcal-today" onClick={goToday}>
              {tr("Today", "Danes")}
            </button>
            <button
              onClick={() => step(1)}
              aria-label={monthOpen ? tr("Next month", "Naslednji mesec") : tr("Next week", "Naslednji teden")}
            >
              <ChevronIcon
                width={18}
                height={18}
                style={{ transform: "rotate(-90deg)" }}
              />
            </button>
          </div>
        </div>
        <div className="mcal-grid">
          {(isSl ? ["P", "T", "S", "Č", "P", "S", "N"] : ["M", "T", "W", "T", "F", "S", "S"]).map((d, i) => (
            <span key={i} className="mcal-wd">
              {d}
            </span>
          ))}
          {days.map((d) => {
            const k = format(d, "yyyy-MM-dd");
            const list = byDate.get(k) ?? [];
            const events = eventsByDate?.get(k) ?? [];
            const dots = [...list]
              .sort((a, b) => b.priority - a.priority)
              .slice(0, 3)
              .map((t) =>
                isEvent(t) ? EVENT_COLOR : PRIORITY_META[t.priority].color,
              );
            const more = list.length - dots.length;
            const dayTrips = tripsOn(trips, k);
            const trip = dayTrips[0]?.period;
            return (
              <button
                key={k}
                className={[
                  "mcal-day",
                  isSameDay(d, selected) ? "is-selected" : "",
                  isToday(d) ? "is-today" : "",
                  monthOpen && !isSameMonth(d, cursor) ? "is-outside" : "",
                  trip ? "is-away" : "",
                  dayTrips.length > 0 &&
                  dayTrips.every((t) => tripLook(t) === "partner")
                    ? "is-away-partner"
                    : "",
                  dayTrips.length > 0 && tripLook(dayTrips[0]) === "off"
                    ? "is-away-off"
                    : "",
                  trip && k === trip.start ? "is-away-start" : "",
                  trip && k === trip.end ? "is-away-end" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setSelected(d)}
                aria-label={`${format(d, tr("EEEE d MMMM", "EEEE, d. MMMM"))}: ${trn(list.length, ["# task", "# tasks"], ["# naloga", "# nalogi", "# naloge", "# nalog"])}`}
              >
                <span className="mcal-num">{format(d, "d")}</span>
                <span className="mcal-dots">
                  {dots.map((c, i) => (
                    <i key={i} style={{ background: c }} />
                  ))}
                  {events.length > 0 && <i className="is-event" />}
                  {list.length === 0 &&
                    (doneMap.get(k)?.length ?? 0) > 0 &&
                    k <= format(new Date(), "yyyy-MM-dd") && (
                      <i className="is-done" />
                    )}
                  {more > 0 && <b>+{more}</b>}
                </span>
              </button>
            );
          })}
        </div>
        <button
          className="mcal-handle"
          onClick={() => setMonthOpen(!monthOpen)}
          aria-label={monthOpen ? tr("Show one week", "Pokaži en teden") : tr("Show the whole month", "Pokaži cel mesec")}
        />
      </div>
      {awayEdit && (
        <AwaySheet
          period={awayEdit.period}
          startDay={awayEdit.startDay}
          onClose={() => setAwayEdit(null)}
        />
      )}
      <TaskListView
        key={key}
        header={
          <div
            className={`mcal-list-pad ${selectedTrips.length ? "has-away" : ""}`}
          >
            {selectedTrips.map((t) => (
              <button
                key={t.period.id}
                className={`mcal-away-banner ${tripLook(t) === "mine" ? "" : `is-${tripLook(t)}`} ${t.mine ? "" : "is-theirs"}`}
                onClick={() =>
                  t.projectId
                    ? navigate(projectRoute(t.projectId))
                    : t.mine && setAwayEdit({ period: t.period })
                }
              >
                {tripIcon(t.period)}
                <span className="mcal-away-text">
                  <b>
                    {t.period.by === "off" ? tr("Off work", "Dopust") : tr("Away", "Odsoten")} ·{" "}
                    {tripName(t)}
                  </b>
                  <span>
                    {awayRange(t.period)}
                    {t.period.note ? ` · ${t.period.note}` : ""}
                    {!t.mine && t.period.together ? ` · added by ${t.who}` : ""}
                  </span>
                </span>
              </button>
            ))}
          </div>
        }
        title={dayLabel}
        tasks={[...overdue, ...dayTasks]}
        // The app adds with the + at the bottom (on the day picked here), so no "Add task" line.
        quickAddProjectId={appUi ? undefined : projectId}
        quickAddDue={{ date: key, string: format(parseISO(key), tr("MMM d", "d. MMM")) }}
        groupLabel={(t) =>
          showOverdue && isOverdue(t.due) ? tr("Overdue", "Zamujeno") : dayLabel
        }
        showProjectChip
        projectNameById={projectNameById}
        groupExtra={(label, items) =>
          label === tr("Overdue", "Zamujeno") && items.length > 0 ? (
            <RescheduleButton tasks={items} />
          ) : undefined
        }
        eventsByDate={eventsByDate}
        footer={
          (dayDone.length > 0 || pastEvents.length > 0) && (
            <>
              {pastEvents.length > 0 && (
                <div className="mcal-done">
                  <b>{tr("Past events", "Pretekli dogodki")}</b>
                  {pastEvents.map((t) => (
                    <span key={t.id} className="mcal-done-row is-event">
                      <span>📅 {t.content}</span>
                      <i>{eventTimeLabel(t)}</i>
                    </span>
                  ))}
                </div>
              )}
              {dayDone.length > 0 && (
                <div className="mcal-done">
                  <b>{tr("Done", "Opravljeno")}</b>
                  {dayDone.map((d) => (
                    <span key={`${d.taskId}@${d.at}`} className="mcal-done-row">
                      <s>✓ {d.content}</s>
                      <i>{format(new Date(d.at), "HH:mm")}</i>
                    </span>
                  ))}
                </div>
              )}
            </>
          )
        }
        dateGroups={[
          ...(overdue.length ? [{ label: tr("Overdue", "Zamujeno"), date: null }] : []),
          { label: dayLabel, date: key, keepEmpty: true },
        ]}
      />
    </div>
  );
}
