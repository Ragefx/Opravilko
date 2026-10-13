import { tr } from "../i18n";
import { useState } from "react";
import { createPortal } from "react-dom";
import { nanoid } from "nanoid";
import { useBootstrap, useSaveAway, useUpdateProject } from "../api/hooks";
import type { AwayPeriod, TripDates } from "../api/types";
import Select from "./Select";
import TimeInput from "./TimeInput";
import { XIcon } from "./icons";
import { tripIcon } from "../utils/away";

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
  const projects = (data?.projects ?? []).filter(
    (p) => p.viewStyle !== "shopping" && !p.isInboxProject && p.id !== "inbox",
  );
  const existingProject = projectId
    ? projects.find((p) => p.id === projectId)
    : undefined;
  const from: Partial<TripDates> = existingProject?.trip ?? period ?? {};

  const [linked, setLinked] = useState(projectId ?? "");
  const [title, setTitle] = useState(period?.title ?? "");
  const [start, setStart] = useState(from.start ?? startDay ?? "");
  const [end, setEnd] = useState(from.end ?? startDay ?? "");
  const [startTime, setStartTime] = useState(from.startTime ?? "");
  const [endTime, setEndTime] = useState(from.endTime ?? "");
  const [note, setNote] = useState(from.note ?? "");
  const [by, setBy] = useState<AwayPeriod["by"]>(from.by ?? "plane");
  const [together, setTogether] = useState(Boolean(from.together));
  // Days off work (🏖️): no getting there, no times, no project.
  const off = by === "off";
  const all = data?.away ?? [];
  const partnerName = data?.partner?.name.split(" ")[0];
  const valid = Boolean(start && end);
  const editing = Boolean(period || existingProject?.trip);

  function dates(): TripDates {
    const [a, b] = start <= end ? [start, end] : [end, start];
    return {
      start: a,
      end: b,
      // Only what's filled in (the database refuses empty values).
      ...(startTime && !off ? { startTime } : {}),
      ...(endTime && !off ? { endTime } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      by,
      ...(together && !linked && partnerName ? { together: true } : {}),
    };
  }

  /** Takes it off where it was (your trips, or another project) when it moves. */
  function removeFromOld(keepProject?: string) {
    if (period) saveAway.mutate(all.filter((a) => a.id !== period.id));
    if (projectId && projectId !== keepProject)
      updateProject.mutate({ id: projectId, trip: undefined });
  }

  function save() {
    if (!valid) return;
    if (linked) {
      removeFromOld(linked);
      updateProject.mutate({ id: linked, trip: dates() });
    } else {
      const next: AwayPeriod = {
        id: period?.id ?? nanoid(8),
        title: title.trim() || (off ? tr("Off work", "Dopust") : tr("Away", "Odsoten")),
        ...dates(),
      };
      if (projectId) updateProject.mutate({ id: projectId, trip: undefined });
      saveAway.mutate(
        period
          ? all.map((a) => (a.id === period.id ? next : a))
          : [...all, next],
      );
    }
    onClose();
  }

  function remove() {
    removeFromOld();
    onClose();
  }

  const linkedProject = projects.find((p) => p.id === linked);

  return createPortal(
    <div className="modal-backdrop over-modal" onClick={onClose}>
      <div
        className="modal away-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={off ? tr("Off work", "Dopust") : tr("Trip", "Potovanje")}
      >
        <div className="settings-head">
          <h3>
            {tripIcon({ by })}{" "}
            {off
              ? editing
                ? tr("Off work", "Dopust")
                : tr("Time off", "Prosti dnevi")
              : editing
                ? tr("Trip", "Potovanje")
                : tr("New trip", "Novo potovanje")}
          </h3>
          <button
            className="sidebar-icon-btn"
            onClick={onClose}
            aria-label={tr("Close", "Zapri")}
          >
            <XIcon width={18} height={18} />
          </button>
        </div>
        <p className="away-note">
          {linkedProject
            ? tr(
                `Shows across these days for everyone on “${linkedProject.name}”; its tasks are the prep.`,
                `Prikaže se čez te dni za vse na »${linkedProject.name}«; njegove naloge so priprave.`
              )
            : tr(
                `Shows across these days in the calendar${partnerName ? `, yours and ${partnerName}'s` : ""}. Tasks on them stay as they are.`,
                `Prikaže se čez te dni v koledarju${partnerName ? `, tvojem in od ${partnerName}` : ""}. Naloge na te dni ostanejo, kot so.`
              )}
        </p>
        {!existingProject && (
          <div
            className="segmented away-kind"
            role="radiogroup"
            aria-label={tr("Trip or off work", "Potovanje ali dopust")}
          >
            {(["trip", "off"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={(k === "off") === off}
                className={(k === "off") === off ? "active" : ""}
                onClick={() => {
                  if (k === "off") {
                    setBy("off");
                    setLinked("");
                  } else if (off) setBy("plane");
                }}
              >
                {k === "off" ? tr("🏖️ Off work", "🏖️ Dopust") : tr("✈️ Trip", "✈️ Potovanje")}
              </button>
            ))}
          </div>
        )}
        {!off && (
          <label className="away-field">
            <span>{tr("Trip for a project", "Potovanje za projekt")}</span>
            <Select
              id="away-project"
              className="away-select"
              sheetTitle={tr("Trip for a project", "Potovanje za projekt")}
              value={linked}
              onChange={(e) => setLinked(e.target.value)}
            >
              <option value="">{tr("No project, just me away", "Brez projekta, samo jaz odsoten")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </label>
        )}
        {!linked && (
          <label className="away-field">
            <span>{off ? tr("What", "Kaj") : tr("Where / what", "Kam / kaj")}</span>
            <input
              id="away-title"
              value={title}
              placeholder={off ? tr("e.g. Summer holiday", "npr. Poletni dopust") : tr("e.g. Athens", "npr. Atene")}
              autoFocus={!editing}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
          </label>
        )}
        {!linked && partnerName && (
          <label className="away-together">
            <input
              type="checkbox"
              className="switch"
              checked={together}
              onChange={(e) => setTogether(e.target.checked)}
            />
            <span>
              <b>{tr(`Together with ${partnerName}`, `Skupaj z ${partnerName}`)}</b>
              <small>
                {tr(
                  "Shows as both of yours in both calendars; only you can change it.",
                  "Prikaže se kot vajino v obeh koledarjih; spremeniš ga lahko le ti."
                )}
              </small>
            </span>
          </label>
        )}
        {!off && (
          <div className="away-field">
            <span>{tr("Getting there", "Prevoz")}</span>
            <div
              className="segmented away-by"
              role="radiogroup"
              aria-label={tr("Getting there", "Prevoz")}
            >
              {(["plane", "car"] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={by === b}
                  className={by === b ? "active" : ""}
                  onClick={() => setBy(b)}
                >
                  {b === "plane" ? tr("✈️ Plane", "✈️ Letalo") : tr("🚗 Car", "🚗 Avto")}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="away-dates">
          <label className="away-field">
            <span>{off ? tr("From", "Od") : tr("Leaving", "Odhod")}</span>
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
          {!off && (
            <label className="away-field">
              <span>{tr("Time (optional)", "Ura (neobvezno)")}</span>
              <TimeInput
                idPrefix="away-start-time"
                value={startTime}
                onChange={setStartTime}
                optional
                label={tr("Leaving", "Odhod")}
              />
            </label>
          )}
          <label className="away-field">
            <span>{off ? tr("Until", "Do") : tr("Back", "Povratek")}</span>
            <input
              id="away-end"
              type="date"
              value={end}
              min={start || undefined}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          {!off && (
            <label className="away-field">
              <span>{tr("Time (optional)", "Ura (neobvezno)")}</span>
              <TimeInput
                idPrefix="away-end-time"
                value={endTime}
                onChange={setEndTime}
                optional
                label={tr("Back", "Povratek")}
              />
            </label>
          )}
        </div>
        <label className="away-field">
          <span>{tr("Note (optional)", "Opomba (neobvezno)")}</span>
          <input
            id="away-note"
            value={note}
            placeholder={
              off
                ? tr("e.g. out of office from 13:00", "npr. odsoten od 13:00")
                : by === "car"
                  ? tr("e.g. via Graz, charge in Maribor", "npr. čez Gradec, polnjenje v Mariboru")
                  : tr("e.g. flight JU 386, Terminal 1", "npr. let JU 386, terminal 1")
            }
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="modal-actions away-actions">
          {editing && (
            <button className="btn btn-text meal-danger" onClick={remove}>
              {existingProject ? tr("Remove trip dates", "Odstrani datume potovanja") : tr("Delete", "Izbriši")}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn btn-text" onClick={onClose}>
            {tr("Cancel", "Prekliči")}
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!valid}>
            {tr("Save", "Shrani")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
