import { tr } from "../i18n";
import { useState } from "react";
import type { Direction, DisplayOptions, Sorting } from "../utils/displayOptions";

/** How each direction reads, per sorting ("asc" first). */
const DIRECTIONS: Record<Exclude<Sorting, "manual">, [string, string]> = {
  date: [tr("Soonest first", "Najprej najbližje"), tr("Latest first", "Najprej najkasnejše")],
  priority: [tr("Highest first", "Najprej najvišja"), tr("Lowest first", "Najprej najnižja")],
  name: ["A → Z", "Z → A"],
  created: [tr("Oldest first", "Najprej najstarejše"), tr("Newest first", "Najprej najnovejše")],
};

const CHOICES: { id: Sorting; label: string }[] = [
  { id: "manual", label: tr("My order (drag)", "Moj vrstni red (vleci)") },
  { id: "date", label: tr("Date", "Datum") },
  { id: "priority", label: tr("Priority", "Prednost") },
  { id: "name", label: tr("Name", "Ime") },
  { id: "created", label: tr("Date added", "Datum dodajanja") },
];

/** A project's Sort button (the layout is fixed: the Inbox a board, projects lists). */
export default function SortMenu({ value, onChange }: { value: DisplayOptions; onChange: (next: DisplayOptions) => void }) {
  const [open, setOpen] = useState(false);
  const sorted = value.sorting !== "manual";
  const set = (sorting: Sorting, direction: Direction = value.direction) => onChange({ ...value, sorting, direction });
  return (
    <div style={{ position: "relative" }}>
      <button
        className={`display-icon-btn sort-btn ${sorted ? "is-on" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={tr("Sort", "Razvrsti")}
        title={
          sorted
            ? tr(`Sorted by ${CHOICES.find((c) => c.id === value.sorting)?.label.toLowerCase()}`, `Razvrščeno po: ${CHOICES.find((c) => c.id === value.sorting)?.label.toLowerCase()}`)
            : tr("Sort", "Razvrsti")
        }
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />
        </svg>
      </button>
      {open && (
        <>
          <div
            className="dropdown-backdrop"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div className="dropdown-panel sort-menu" role="menu" aria-label={tr("Sort", "Razvrsti")}>
            <div className="display-menu-title">{tr("Sort by", "Razvrsti po")}</div>
            {CHOICES.map((c) => (
              <button
                key={c.id}
                role="menuitemradio"
                aria-checked={value.sorting === c.id}
                className={`sort-menu-item ${value.sorting === c.id ? "is-on" : ""}`}
                onClick={() => {
                  set(c.id);
                  setOpen(false);
                }}
              >
                {c.label}
                {value.sorting === c.id && <span aria-hidden="true">✓</span>}
              </button>
            ))}
            {sorted && (
              <div className="sort-menu-direction">
                <button className={value.direction === "asc" ? "is-on" : ""} onClick={() => set(value.sorting, "asc")}>
                  {DIRECTIONS[value.sorting as Exclude<Sorting, "manual">][0]}
                </button>
                <button className={value.direction === "desc" ? "is-on" : ""} onClick={() => set(value.sorting, "desc")}>
                  {DIRECTIONS[value.sorting as Exclude<Sorting, "manual">][1]}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
