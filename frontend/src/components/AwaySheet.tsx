import { useState } from "react";
import { createPortal } from "react-dom";
import { nanoid } from "nanoid";
import { useBootstrap, useSaveAway, useUpdateProject } from "../api/hooks";
import type { AwayPeriod, TripDates } from "../api/types";
import Select from "./Select";
import { XIcon } from "./icons";

/**
 * A trip: its days, and optionally leaving / back times and a note. It's
 * either just yours ("I'm away", kept with your profile) or a project's
 * (Tromsø: its prep tasks and packing list, seen by everyone on it).
 */
export default function AwaySheet({
  period,
  projectId,
  startDay,
  onClose,
}: {
  /** One of your own trips to change. */
  period?: AwayPeriod;
  /** A project whose trip dates to set or change. */
  projectId?: string;
  /** A new one starts on this day ("yyyy-MM-dd"). */
  startDay?: string;
  onClose: () => void;
}) {
  const { data } = useBootstrap();
  const saveAway = useSaveAway();
  const updateProject = useUpdateProject();
  const projects = (data?.projects ?? []).filter((p) => p.viewStyle !== "shopping" && !p.isInboxProject && p.id !== "inbox");
  const existingProject = projectId ? projects.find((p) => p.id === projectId) : undefined;
  const from: Partial<TripDates> = existingProject?.trip ?? period ?? {};

  const [linked, setLinked] = useState(projectId ?? "");
  const [title, setTitle] = useState(period?.title ?? "");
  const [start, setStart] = useState(from.start ?? startDay ?? "");
  const [end, setEnd] = useState(from.end ?? startDay ?? "");
  const [startTime, setStartTime] = useState(from.startTime ?? "");
  const [endTime, setEndTime] = useState(from.endTime ?? "");
  const [note, setNote] = useState(from.note ?? "");
  const all = data?.away ?? [];
  const valid = Boolean(start && end);
  const editing = Boolean(period || existingProject?.trip);

  function dates(): TripDates {
    const [a, b] = start <= end ? [start, end] : [end, start];
    return {
      start: a,
      end: b,
      // Only what's filled in (the database refuses empty values).
      ...(startTime ? { startTime } : {}),
      ...(endTime ? { endTime } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
  }

  /** Takes it off where it was (your trips, or another project) when it moves. */
  function removeFromOld(keepProject?: string) {
    if (period) saveAway.mutate(all.filter((a) => a.id !== period.id));
    if (projectId && projectId !== keepProject) updateProject.mutate({ id: projectId, trip: undefined });
  }

  function save() {
    if (!valid) return;
    if (linked) {
      removeFromOld(linked);
      updateProject.mutate({ id: linked, trip: dates() });
    } else {
      const next: AwayPeriod = { id: period?.id ?? nanoid(8), title: title.trim() || "Away", ...dates() };
      if (projectId) updateProject.mutate({ id: projectId, trip: undefined });
      saveAway.mutate(period ? all.map((a) => (a.id === period.id ? next : a)) : [...all, next]);
    }
    onClose();
  }

  function remove() {
    removeFromOld();
    onClose();
  }

  const partnerName = data?.partner?.name.split(" ")[0];
  const linkedProject = projects.find((p) => p.id === linked);

  return createPortal(
    <div className="modal-backdrop over-modal" onClick={onClose}>
      <div className="modal away-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Trip">
        <div className="settings-head">
          <h3>✈️ {editing ? "Trip" : "New trip"}</h3>
          <button className="sidebar-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon width={18} height={18} />
          </button>
        </div>
        <p className="away-note">
          {linkedProject
            ? `Shows across these days for everyone on “${linkedProject.name}”; its tasks are the prep.`
            : `Shows across these days in the calendar${partnerName ? `, yours and ${partnerName}'s` : ""}. Tasks on them stay as they are.`}
        </p>
        <label className="away-field">
          <span>Trip for a project</span>
          <Select
            id="away-project"
            className="away-select"
            sheetTitle="Trip for a project"
            value={linked}
            onChange={(e) => setLinked(e.target.value)}
          >
            <option value="">No project, just me away</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </label>
        {!linked && (
          <label className="away-field">
            <span>Where / what</span>
            <input
              id="away-title"
              value={title}
              placeholder="e.g. Athens"
              autoFocus={!editing}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
          </label>
        )}
        <div className="away-dates">
          <label className="away-field">
            <span>Leaving</span>
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
            <span>Time (optional)</span>
            <input id="away-start-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
          <label className="away-field">
            <span>Back</span>
            <input id="away-end" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <label className="away-field">
            <span>Time (optional)</span>
            <input id="away-end-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </label>
        </div>
        <label className="away-field">
          <span>Note (optional)</span>
          <input id="away-note" value={note} placeholder="e.g. flight JU 386, Terminal 1" onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="modal-actions away-actions">
          {editing && (
            <button className="btn btn-text meal-danger" onClick={remove}>
              {existingProject ? "Remove trip dates" : "Delete"}
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
