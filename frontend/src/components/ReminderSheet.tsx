import { useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import type { Due, Reminder } from "../api/types";
import { isNativeApp } from "../dropbox/auth";
import { enableReminders } from "../utils/notifications";
import {
  DAY_PRESETS,
  TIMED_PRESETS,
  describeReminder,
  isMine,
  newReminder,
  reminderTime,
  sameReminder,
  type ReminderSpec,
} from "../utils/reminders";
import { todayISO } from "../utils/date";
import TimeInput from "./TimeInput";
import { BellIcon, ClockIcon, PlusIcon, XIcon } from "./icons";

function whenText(at: Date | null): string {
  if (!at) return "Needs a date";
  return format(at, "EEE d MMM, HH:mm") + (at.getTime() < Date.now() ? " · passed" : "");
}

/**
 * A task's reminders: the ones set (✕ to remove), quick ones to add for its
 * date, and a specific day and time. A sheet from the bottom in the app, a
 * small window on the website (the same frame as the app's pickers).
 */
export default function ReminderSheet({
  due,
  reminders,
  me,
  onChange,
  onClose,
}: {
  due: Due | null;
  reminders: Reminder[];
  /** Firebase user id: stored on the reminders I add, so only my phone rings. */
  me?: string;
  onChange: (next: Reminder[]) => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState(false);
  const [day, setDay] = useState(() => due?.date ?? todayISO());
  const [time, setTime] = useState(() => (due?.datetime ? format(new Date(due.datetime), "HH:mm") : "09:00"));

  const presets = due?.datetime ? TIMED_PRESETS : due ? DAY_PRESETS : [];
  const available = presets.filter((p) => !reminders.some((r) => sameReminder(r, p.make())));

  function add(spec: ReminderSpec) {
    if (reminders.some((r) => sameReminder(r, spec))) return;
    // The phone needs notification permission to ring (asked once).
    if (isNativeApp) void enableReminders();
    onChange([...reminders, newReminder(spec, me)]);
  }

  return createPortal(
    <div
      className="modal-backdrop shop-picker-backdrop over-modal"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="shop-picker rem-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Reminders">
        <div className="shop-picker-handle" aria-hidden="true" />
        <h3>Reminders</h3>
        {!reminders.length && <p>{due ? "None yet. Add one below." : "None yet. Give the task a date for quick options, or pick a time."}</p>}

        {reminders.length > 0 && (
          <div className="shop-picker-list rem-list">
            {reminders.map((r) => (
              <div key={r.id} className="shop-picker-row rem-row is-set">
                <span className="shop-picker-icon" aria-hidden="true">
                  <BellIcon width={18} height={18} />
                </span>
                <span className="rem-text">
                  <span className="shop-picker-name">{describeReminder(r)}</span>
                  <span className="rem-when">
                    {r.type === "absolute"
                      ? (reminderTime(due, r)?.getTime() ?? 0) < Date.now()
                        ? "Passed"
                        : "At a set time"
                      : whenText(reminderTime(due, r))}
                    {!isMine(r, me) && " · your partner's"}
                  </span>
                </span>
                <button
                  type="button"
                  className="rem-remove"
                  aria-label={`Remove reminder ${describeReminder(r)}`}
                  onClick={() => onChange(reminders.filter((x) => x.id !== r.id))}
                >
                  <XIcon width={16} height={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        {(available.length > 0 || !custom) && <div className="rem-head">Add</div>}
        <div className="shop-picker-list">
          {available.map((p) => {
            const spec = p.make();
            const at = reminderTime(due, { ...(spec as Reminder), id: "" });
            return (
              <button key={p.key} type="button" className="shop-picker-row rem-row" onClick={() => add(spec)}>
                <span className="shop-picker-icon" aria-hidden="true">
                  <PlusIcon width={18} height={18} />
                </span>
                <span className="rem-text">
                  <span className="shop-picker-name">{p.label}</span>
                  <span className="rem-when">{whenText(at)}</span>
                </span>
              </button>
            );
          })}
          {!custom ? (
            <button type="button" className="shop-picker-row rem-row" onClick={() => setCustom(true)}>
              <span className="shop-picker-icon" aria-hidden="true">
                <ClockIcon width={18} height={18} />
              </span>
              <span className="shop-picker-name">Pick a day and time…</span>
            </button>
          ) : (
            <form
              className="rem-custom"
              onSubmit={(e) => {
                e.preventDefault();
                if (!day || !time) return;
                const at = new Date(`${day}T${time}:00`);
                if (isNaN(at.getTime())) return;
                add({ type: "absolute", at: at.toISOString() });
                setCustom(false);
              }}
            >
              <input type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day" required />
              <TimeInput idPrefix="reminder-time" value={time} onChange={setTime} label="Reminder" />
              <button type="submit" className="btn btn-primary">
                Add
              </button>
            </form>
          )}
        </div>
        <div className="rem-foot">
          <button type="button" className="btn btn-text" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
