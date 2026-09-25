import { useState } from "react";
import { createPortal } from "react-dom";
import { nanoid } from "nanoid";
import { useBootstrap, useSaveAway } from "../api/hooks";
import type { AwayPeriod } from "../api/types";
import { XIcon } from "./icons";

/**
 * Days you're away (a trip): a name and the first and last day. They show
 * across the calendar; tasks on those days stay as they are.
 */
export default function AwaySheet({
  period,
  startDay,
  onClose,
}: {
  /** An existing period to change, or none for a new one. */
  period?: AwayPeriod;
  /** A new one starts on this day ("yyyy-MM-dd"). */
  startDay?: string;
  onClose: () => void;
}) {
  const { data } = useBootstrap();
  const saveAway = useSaveAway();
  const [title, setTitle] = useState(period?.title ?? "");
  const [start, setStart] = useState(period?.start ?? startDay ?? "");
  const [end, setEnd] = useState(period?.end ?? startDay ?? "");
  const all = data?.away ?? [];
  const valid = Boolean(start && end);

  function save() {
    if (!valid) return;
    // The days in order, whichever way round they were picked.
    const [from, to] = start <= end ? [start, end] : [end, start];
    const next: AwayPeriod = { id: period?.id ?? nanoid(8), title: title.trim() || "Away", start: from, end: to };
    saveAway.mutate(period ? all.map((a) => (a.id === period.id ? next : a)) : [...all, next]);
    onClose();
  }

  function remove() {
    if (period) saveAway.mutate(all.filter((a) => a.id !== period.id));
    onClose();
  }

  return createPortal(
    <div className="modal-backdrop over-modal" onClick={onClose}>
      <div className="modal away-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Away">
        <div className="settings-head">
          <h3>✈️ {period ? "Away" : "I'll be away"}</h3>
          <button className="sidebar-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon width={18} height={18} />
          </button>
        </div>
        <p className="away-note">Shows across these days in the calendar. Tasks on them stay as they are.</p>
        <label className="away-field">
          <span>Where / what</span>
          <input
            id="away-title"
            value={title}
            placeholder="e.g. Athens"
            autoFocus={!period}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </label>
        <div className="away-dates">
          <label className="away-field">
            <span>From</span>
            <input
              id="away-start"
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (!end || end < e.target.value) setEnd(e.target.value);
              }}
            />
          </label>
          <label className="away-field">
            <span>To</span>
            <input id="away-end" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <div className="modal-actions away-actions">
          {period && (
            <button className="btn btn-text meal-danger" onClick={remove}>
              Delete
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn btn-text" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!valid}>
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
