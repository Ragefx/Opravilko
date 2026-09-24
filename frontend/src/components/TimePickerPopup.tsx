import { useState } from "react";
import { createPortal } from "react-dom";
import Select from "./Select";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

/**
 * A small popup for setting the time-of-day on a due date, matching
 * Todoist's Time popup. Duration and Time zone aren't in our data model (we
 * only store one due datetime, no separate duration or per-task timezone),
 * so this only offers what we actually support: the time itself.
 */
export default function TimePickerPopup({
  time,
  anchor,
  onSave,
  onCancel,
}: {
  /** Current "HH:mm", or "" if unset. */
  time: string;
  anchor: { top: number; left: number };
  onSave: (time: string) => void;
  onCancel: () => void;
}) {
  const [hh, mm] = time ? time.split(":") : ["12", "00"];
  const [hour, setHour] = useState(hh);
  const [minute, setMinute] = useState(mm);

  return createPortal(
    <>
      <div
        className="dropdown-backdrop"
        // Above the date picker, which itself sits over the Add task window.
        style={{ zIndex: 340 }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }}
      />
      <div
        className="dropdown-panel time-picker-panel"
        style={{
          top: Math.max(8, Math.min(anchor.top, window.innerHeight - 140)),
          left: Math.max(8, Math.min(anchor.left, window.innerWidth - 260)),
          zIndex: 341,
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="time-picker-row">
          <span className="time-picker-label">Time</span>
          <div className="time-picker-inputs">
            <Select sheetTitle="Hour" value={hour} onChange={(e) => setHour(e.target.value)}>
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </Select>
            :
            <Select sheetTitle="Minute" value={minute} onChange={(e) => setMinute(e.target.value)}>
              {MINUTES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="time-picker-actions">
          <button className="btn btn-text" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => onSave(`${hour}:${minute}`)}>
            Save
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
