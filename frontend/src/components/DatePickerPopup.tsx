import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday as isTodayFn,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { useBootstrap, useUpdateTask } from "../api/hooks";
import { makeDue, makeDueFromDateString, parseNaturalDate } from "../utils/date";
import type { Due } from "../api/types";
import { weekendOffsetDays } from "../utils/quickDates";
import { dueWithPreset, type RepeatPreset } from "../utils/recurrence";
import { CalendarIcon, ChevronIcon, ClockIcon, CouchIcon, RepeatIcon, SkipForwardIcon, SunIcon, XIcon } from "./icons";
import TimePickerPopup from "./TimePickerPopup";

const WEEK_OPTS = { weekStartsOn: 1 as const };
const touchScreen = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

/**
 * The full date picker opened from a task's "⋯" menu (the "…" next to the
 * quick date icons), matching Todoist's: a typed-date field, the same four
 * quick picks as full rows, a month calendar, and Time/Repeat.
 *
 * With `onPick` instead of `taskId` it picks a date for a task that doesn't
 * exist yet (the Add task box): the choice is handed back, not saved, and
 * repeating is left to that box's own Repeat control.
 */
export default function DatePickerPopup({
  taskId,
  value,
  onPick,
  anchor,
  onClose,
}: {
  taskId?: string;
  value?: Due | null;
  onPick?: (due: Due | null) => void;
  anchor: { top: number; right: number };
  onClose: () => void;
}) {
  const { data } = useBootstrap();
  const updateTask = useUpdateTask();
  const task = taskId ? data?.tasks.find((t) => t.id === taskId) : undefined;
  const due = onPick ? value ?? null : task?.due ?? null;

  function setDue(next: Due | null) {
    if (onPick) onPick(next);
    else if (taskId) updateTask.mutate({ id: taskId, due: next });
  }

  const [text, setText] = useState("");
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(due ? parseISO(due.date) : new Date()));
  const [showTime, setShowTime] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);
  const timeBtnRef = useRef<HTMLButtonElement>(null);
  const repeatRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Keep the whole panel on screen on short windows.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const over = el.getBoundingClientRect().bottom - (window.innerHeight - 8);
    if (over > 0) el.style.top = `${Math.max(8, anchor.top - over)}px`;
  }, [anchor.top]);
  // Near the bottom of the screen the flyout would open off it; lift it up.
  useLayoutEffect(() => {
    const el = repeatRef.current;
    if (!showRepeat || !el) return;
    el.style.top = "0px";
    const over = el.getBoundingClientRect().bottom - (window.innerHeight - 8);
    if (over > 0) el.style.top = `${-over}px`;
  }, [showRepeat]);

  if (!onPick && !task) return null;

  function currentTimeStr(): string | undefined {
    return due?.datetime ? format(parseISO(due.datetime), "HH:mm") : undefined;
  }

  function applyDateOffset(days: number) {
    const date = addDays(new Date(), days);
    const dateStr = format(date, "yyyy-MM-dd");
    const timeStr = currentTimeStr();
    const label = days === 0 ? "Today" : days === 1 ? "Tomorrow" : format(date, "EEE d MMM");
    setDue(timeStr ? makeDueFromDateString(dateStr, timeStr) : makeDue(date, label));
    onClose();
  }

  function applyDay(d: Date) {
    setDue(makeDueFromDateString(format(d, "yyyy-MM-dd"), currentTimeStr()));
    onClose();
  }

  function submitTypedDate() {
    if (!text.trim()) return;
    const parsed = parseNaturalDate(text.trim());
    if (parsed.due) {
      setDue(parsed.due);
      onClose();
    }
  }

  function clearDate() {
    setDue(null);
    onClose();
  }

  function saveTime(time: string) {
    const dateStr = due?.date || format(new Date(), "yyyy-MM-dd");
    setDue(makeDueFromDateString(dateStr, time));
    setShowTime(false);
    onClose();
  }

  function setRepeat(preset: RepeatPreset) {
    const dateStr = due?.date || format(new Date(), "yyyy-MM-dd");
    setDue(dueWithPreset(makeDueFromDateString(dateStr, currentTimeStr()), preset));
    onClose();
  }

  const gridStart = startOfWeek(startOfMonth(viewMonth), WEEK_OPTS);
  const gridEnd = endOfWeek(endOfMonth(viewMonth), WEEK_OPTS);
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  const selectedDate = due ? parseISO(due.date) : null;
  const today = new Date();
  const weekend = addDays(today, weekendOffsetDays());
  const nextWeek = addDays(today, 7);

  return createPortal(
    <>
      <div
        className={`dropdown-backdrop ${onPick ? "over-modal" : ""}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        ref={panelRef}
        className={`dropdown-panel date-picker-panel ${onPick ? "over-modal" : ""}`}
        style={{ top: anchor.top, right: anchor.right }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          className="date-picker-input"
          // Straight into typing with a mouse; on a phone that would pop the
          // keyboard up over the picker, so there you tap the field to type.
          autoFocus={!touchScreen}
          placeholder="Type a date"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitTypedDate()}
        />

        <button className="date-picker-quick-row" onClick={() => applyDateOffset(0)}>
          <span className="date-picker-quick-icon today">
            <CalendarIcon width={15} height={15} />
          </span>
          Today
          <span className="date-picker-quick-day">{format(today, "EEE")}</span>
        </button>
        <button className="date-picker-quick-row" onClick={() => applyDateOffset(1)}>
          <span className="date-picker-quick-icon tomorrow">
            <SunIcon width={15} height={15} />
          </span>
          Tomorrow
          <span className="date-picker-quick-day">{format(addDays(today, 1), "EEE")}</span>
        </button>
        <button className="date-picker-quick-row" onClick={() => applyDateOffset(weekendOffsetDays())}>
          <span className="date-picker-quick-icon weekend">
            <CouchIcon width={15} height={15} />
          </span>
          This weekend
          <span className="date-picker-quick-day">{format(weekend, "EEE")}</span>
        </button>
        <button className="date-picker-quick-row" onClick={() => applyDateOffset(7)}>
          <span className="date-picker-quick-icon nextweek">
            <SkipForwardIcon width={15} height={15} />
          </span>
          Next week
          <span className="date-picker-quick-day">{format(nextWeek, "EEE d MMM")}</span>
        </button>
        {due && (
          <button className="date-picker-quick-row" onClick={clearDate}>
            <span className="date-picker-quick-icon">
              <XIcon width={15} height={15} />
            </span>
            No date
          </button>
        )}

        <div className="date-picker-calendar">
          <div className="date-picker-cal-header">
            <span>{format(viewMonth, "MMMM yyyy")}</span>
            <div>
              <button onClick={() => setViewMonth((m) => subMonths(m, 1))} aria-label="Previous month">
                <ChevronIcon width={14} height={14} style={{ transform: "rotate(90deg)" }} />
              </button>
              <button onClick={() => setViewMonth((m) => addMonths(m, 1))} aria-label="Next month">
                <ChevronIcon width={14} height={14} style={{ transform: "rotate(-90deg)" }} />
              </button>
            </div>
          </div>
          <div className="date-picker-cal-weekdays">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="date-picker-cal-grid">
            {days.map((d) => (
              <button
                key={d.toISOString()}
                className={[
                  "date-picker-cal-day",
                  !isSameMonth(d, viewMonth) ? "outside" : "",
                  selectedDate && isSameDay(d, selectedDate) ? "selected" : "",
                  isTodayFn(d) ? "is-today" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => applyDay(d)}
              >
                {format(d, "d")}
              </button>
            ))}
          </div>
        </div>

        <button ref={timeBtnRef} className="date-picker-action-btn" onClick={() => setShowTime(true)}>
          <ClockIcon width={14} height={14} /> {currentTimeStr() || "Time"}
        </button>

        {!onPick && (
          <div
            className="date-picker-repeat-wrap"
            onMouseEnter={() => setShowRepeat(true)}
            onMouseLeave={() => setShowRepeat(false)}
          >
            <button className="date-picker-action-btn">
              <RepeatIcon width={14} height={14} /> Repeat
            </button>
            {showRepeat && (
              <div ref={repeatRef} className="date-picker-repeat-flyout">
                <button onClick={() => setRepeat("daily")}>Every day</button>
                <button onClick={() => setRepeat("weekdays")}>Every weekday (Mon - Fri)</button>
                <button onClick={() => setRepeat("weekly")}>Every week on {format(selectedDate || today, "EEEE")}</button>
                <button onClick={() => setRepeat("biweekly")}>Every 2 weeks on {format(selectedDate || today, "EEEE")}</button>
                <button onClick={() => setRepeat("monthly")}>Every month on the {format(selectedDate || today, "do")}</button>
                <button onClick={() => setRepeat("monthly_last")}>Every month on the last day</button>
                <button onClick={() => setRepeat("yearly")}>Every year on {format(selectedDate || today, "MMM d")}</button>
              </div>
            )}
          </div>
        )}
      </div>

      {showTime && (
        <TimePickerPopup
          time={currentTimeStr() || ""}
          anchor={{
            top: (timeBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
            left: timeBtnRef.current?.getBoundingClientRect().left ?? 0,
          }}
          onSave={saveTime}
          onCancel={() => setShowTime(false)}
        />
      )}
    </>,
    document.body
  );
}
