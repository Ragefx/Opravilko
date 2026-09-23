import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import type { CalendarEvent, Task } from "../api/types";
import TaskCheckbox from "./TaskCheckbox";
import PriorityMark from "./PriorityMark";

/** Minutes a timed task occupies on the rail (tasks have no duration of their own). */
const TASK_SPAN = 45;
const MIN_EVENT_SPAN = 30;

interface Placed {
  key: string;
  start: number; // minutes from midnight
  end: number;
  lane: number;
  lanes: number;
  task?: Task;
  event?: CalendarEvent;
}

function minutesOf(iso: string): number {
  const d = parseISO(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/** Side-by-side lanes for items that overlap, per cluster of overlapping items. */
function placeItems(items: Omit<Placed, "lane" | "lanes">[]): Placed[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((p) => p.lane + 1));
    cluster.forEach((p) => (p.lanes = lanes));
    cluster = [];
  };
  for (const item of sorted) {
    if (item.start >= clusterEnd) flush();
    const laneEnds: number[] = [];
    cluster.forEach((p) => (laneEnds[p.lane] = Math.max(laneEnds[p.lane] ?? -1, p.end)));
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.length;
    const p = { ...item, lane, lanes: 1 };
    cluster.push(p);
    placed.push(p);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return placed;
}

/**
 * A planner-style day: hours down the side, timed tasks and calendar events
 * at their time (events as long as they last), and on today a line at the
 * current time. Always shown, so the shape of the day is visible even when
 * nothing has a time yet -- tapping an hour gives one of the day's untimed
 * tasks that time.
 */
export default function DayRail({
  date,
  tasks,
  events,
  isToday,
  schedulable,
  onOpenTask,
  onComplete,
  onSchedule,
}: {
  date: string;
  /** Tasks due on `date` that have a time. */
  tasks: Task[];
  /** Timed (not all-day) events on `date`. */
  events: CalendarEvent[];
  isToday: boolean;
  /** Untimed tasks that tapping an hour can schedule. */
  schedulable: Task[];
  onOpenTask: (task: Task) => void;
  onComplete: (task: Task) => void;
  onSchedule: (task: Task, hour: number) => void;
}) {
  const [nowMin, setNowMin] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  useEffect(() => {
    const id = window.setInterval(() => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);
  const [pickHour, setPickHour] = useState<number | null>(null);
  useEffect(() => setPickHour(null), [date]);

  const items = placeItems([
    ...tasks
      .filter((t) => t.due?.datetime)
      .map((t) => {
        const start = minutesOf(t.due!.datetime!);
        return { key: `t-${t.id}`, start, end: start + TASK_SPAN, task: t };
      }),
    ...events
      .filter((e) => e.start)
      .map((e) => {
        const start = minutesOf(e.start!);
        // An event crossing midnight runs to the end of the rail.
        const rawEnd = e.end && e.end.slice(0, 10) === e.start!.slice(0, 10) ? minutesOf(e.end) : 24 * 60;
        return { key: `e-${e.id}`, start, end: Math.max(rawEnd, start + MIN_EVENT_SPAN), event: e };
      }),
  ]);

  // Working hours by default, stretched to fit whatever is scheduled and the current time.
  const startHour = Math.max(0, Math.min(8, ...items.map((i) => Math.floor(i.start / 60)), isToday ? Math.floor(nowMin / 60) : 8));
  const endHour = Math.min(24, Math.max(22, ...items.map((i) => Math.ceil(i.end / 60)), isToday ? Math.floor(nowMin / 60) + 1 : 22));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const at = (min: number) => `calc(var(--hour-h) * ${(min - startHour * 60) / 60})`;

  return (
    <div className="day-rail" style={{ height: `calc(var(--hour-h) * ${hours.length})` }}>
      {hours.map((h) => (
        <button
          key={h}
          className={`day-rail-hour ${pickHour === h ? "is-picking" : ""}`}
          style={{ top: at(h * 60) }}
          onClick={() => setPickHour(pickHour === h ? null : h)}
          disabled={schedulable.length === 0}
          aria-label={schedulable.length ? `Schedule a task at ${String(h).padStart(2, "0")}:00` : undefined}
        >
          <span className="day-rail-hour-label">{String(h).padStart(2, "0")}:00</span>
        </button>
      ))}

      {items.map((i) => {
        const style = {
          top: at(i.start),
          height: `calc(var(--hour-h) * ${(i.end - i.start) / 60} - 3px)`,
          left: `calc(var(--rail-gutter) + (100% - var(--rail-gutter)) * ${i.lane / i.lanes})`,
          width: `calc((100% - var(--rail-gutter)) / ${i.lanes} - 4px)`,
        };
        if (i.event) {
          const e = i.event;
          return (
            <div key={i.key} className="day-rail-event" style={{ ...style, ["--event-color" as string]: e.color }}>
              <span className="day-rail-time">
                {format(parseISO(e.start!), "HH:mm")}
                {e.end && `–${format(parseISO(e.end), "HH:mm")}`}
              </span>
              <span className="day-rail-title">{e.title}</span>
            </div>
          );
        }
        const t = i.task!;
        return (
          <div key={i.key} className="day-rail-task" style={style} onClick={() => onOpenTask(t)}>
            <TaskCheckbox
              completed={t.completed}
              priorityColor="var(--color-text-muted)"
              recurring={!!t.due?.isRecurring}
              onToggle={() => onComplete(t)}
            />
            <span className="day-rail-task-body">
              <span className="day-rail-time">{format(parseISO(t.due!.datetime!), "HH:mm")}</span>
              <span className="day-rail-title">{t.content}</span>
            </span>
            <PriorityMark priority={t.priority} />
          </div>
        );
      })}

      {isToday && nowMin >= startHour * 60 && nowMin < endHour * 60 && (
        <div className="day-rail-now" style={{ top: at(nowMin) }}>
          <span>{format(new Date(), "HH:mm")}</span>
        </div>
      )}

      {pickHour !== null && (
        <div className="day-rail-picker" style={{ top: at(pickHour * 60 + 60) }}>
          <div className="day-rail-picker-title">Do at {String(pickHour).padStart(2, "0")}:00</div>
          {schedulable.slice(0, 8).map((t) => (
            <button
              key={t.id}
              onClick={() => {
                onSchedule(t, pickHour);
                setPickHour(null);
              }}
            >
              {t.content}
            </button>
          ))}
          <button className="day-rail-picker-cancel" onClick={() => setPickHour(null)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
