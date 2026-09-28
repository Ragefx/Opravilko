import { useState } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "./icons";

const QUICK = ["09:00", "12:00", "17:00", "20:00"];
const DAY_HOURS = Array.from({ length: 17 }, (_, i) => i + 7); // 7..23
const EARLY_HOURS = Array.from({ length: 7 }, (_, i) => i); // 0..6
const MINUTES = [0, 15, 30, 45];

const pad = (n: number) => String(n).padStart(2, "0");

/** "9", "930", "9:30", "9.30", "21h" -> "09:30"; null if it isn't a time. */
export function parseTypedTime(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/h$/, "");
  if (!t) return null;
  let m = /^(\d{1,2})[:.\s](\d{2})$/.exec(t);
  if (!m && /^\d{3,4}$/.test(t)) m = /^(\d{1,2})(\d{2})$/.exec(t);
  const h = m ? Number(m[1]) : /^\d{1,2}$/.test(t) ? Number(t) : NaN;
  const min = m ? Number(m[2]) : 0;
  if (!(h >= 0 && h <= 23 && min >= 0 && min <= 59)) return null;
  return `${pad(h)}:${pad(min)}`;
}

/**
 * Setting the time on a date: common times in one tap, or an hour and then
 * :00/:15/:30/:45 from a grid, or typed ("16:30", "930"). No scrolling
 * lists. On a phone it shows as a sheet from the bottom (see the CSS).
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
  /** The new "HH:mm", or "" to remove the time. */
  onSave: (time: string) => void;
  onCancel: () => void;
}) {
  const [hour, setHour] = useState<number | null>(time ? Number(time.split(":")[0]) : null);
  const [minute, setMinute] = useState<number>(time ? Number(time.split(":")[1]) : 0);
  const [typed, setTyped] = useState(time);
  const [early, setEarly] = useState(hour !== null && hour < 7);
  const current = hour === null ? "" : `${pad(hour)}:${pad(minute)}`;

  function pickHour(h: number) {
    setHour(h);
    setTyped(`${pad(h)}:${pad(minute)}`);
  }
  function pickMinute(m: number) {
    const h = hour ?? 9;
    setHour(h);
    setMinute(m);
    setTyped(`${pad(h)}:${pad(m)}`);
  }
  function type(text: string) {
    setTyped(text);
    const t = parseTypedTime(text);
    if (!t) return;
    const [h, m] = t.split(":").map(Number);
    setHour(h);
    setMinute(m);
    if (h < 7) setEarly(true);
  }

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
          top: Math.max(8, Math.min(anchor.top, window.innerHeight - 420)),
          left: Math.max(8, Math.min(anchor.left, window.innerWidth - 300)),
          zIndex: 341,
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tp-typed">
          <input
            aria-label="Time"
            inputMode="numeric"
            placeholder="Type a time, e.g. 16:30"
            value={typed}
            onChange={(e) => type(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && current) onSave(current);
            }}
          />
          {time && (
            <button className="tp-clear" aria-label="Remove the time" title="Remove the time" onClick={() => onSave("")}>
              <XIcon width={16} height={16} />
            </button>
          )}
        </div>

        <div className="tp-label">Quick</div>
        <div className="tp-quick">
          {QUICK.map((q) => (
            <button key={q} className={`tp-chip ${current === q ? "is-on" : ""}`} onClick={() => onSave(q)}>
              {q.replace(/^0/, "")}
            </button>
          ))}
        </div>

        <div className="tp-label">Hour</div>
        <div className="tp-hours">
          {(early ? EARLY_HOURS : DAY_HOURS).map((h) => (
            <button key={h} className={`tp-cell ${hour === h ? "is-on" : ""}`} onClick={() => pickHour(h)}>
              {h}
            </button>
          ))}
          <button className="tp-cell tp-more" onClick={() => setEarly(!early)}>
            {early ? "7–23" : "0–6"}
          </button>
        </div>

        <div className="tp-label">Minutes</div>
        <div className="tp-minutes">
          {MINUTES.map((m) => (
            <button key={m} className={`tp-cell ${hour !== null && minute === m ? "is-on" : ""}`} onClick={() => pickMinute(m)}>
              :{pad(m)}
            </button>
          ))}
        </div>
        {hour !== null && !MINUTES.includes(minute) && <div className="tp-note">:{pad(minute)} as typed</div>}

        <div className="time-picker-actions">
          <button className="btn btn-text" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!current} onClick={() => onSave(current)}>
            Save{current ? ` ${current}` : ""}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
