import type { Label } from "../api/types";
import { PRIORITY_META, PRIORITY_ORDER } from "../utils/priority";
import { DEFAULT_DISPLAY_OPTIONS, type DisplayOptions } from "../utils/displayOptions";
import { BoardViewIcon, ListViewIcon, UpcomingIcon } from "./icons";

export default function DisplayMenu({
  value,
  onChange,
  labels,
  onClose,
}: {
  value: DisplayOptions;
  onChange: (next: DisplayOptions) => void;
  labels: Label[];
  onClose: () => void;
}) {
  function set<K extends keyof DisplayOptions>(key: K, val: DisplayOptions[K]) {
    onChange({ ...value, [key]: val });
  }

  return (
    <>
      <div
        className="dropdown-backdrop"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
      />
      <div className="dropdown-panel display-menu">
        <div className="display-menu-title">Layout</div>
        <div className="layout-picker">
          <button
            className={value.layout === "list" ? "active" : ""}
            onClick={() => set("layout", "list")}
          >
            <ListViewIcon width={18} height={18} />
            List
          </button>
          <button
            className={value.layout === "board" ? "active" : ""}
            onClick={() => set("layout", "board")}
          >
            <BoardViewIcon width={18} height={18} />
            Board
          </button>
          <button
            className={value.layout === "calendar" ? "active" : ""}
            onClick={() => set("layout", "calendar")}
          >
            <UpcomingIcon width={18} height={18} />
            Calendar
          </button>
        </div>

        {value.layout === "list" && (
          <label className="display-menu-row">
            <span>Completed tasks</span>
            <input
              type="checkbox"
              className="switch"
              checked={value.showCompleted}
              onChange={(e) => set("showCompleted", e.target.checked)}
            />
          </label>
        )}

        <div className="display-menu-section-title">Sort</div>
        <label className="display-menu-row">
          <span>Grouping</span>
          <select value={value.grouping} onChange={(e) => set("grouping", e.target.value as DisplayOptions["grouping"])}>
            <option value="none">None</option>
            <option value="priority">Priority</option>
            <option value="label">Label</option>
            <option value="dueDate">Due date</option>
          </select>
        </label>
        <label className="display-menu-row">
          <span>Sorting</span>
          <select value={value.sorting} onChange={(e) => set("sorting", e.target.value as DisplayOptions["sorting"])}>
            <option value="manual">Manual</option>
            <option value="date">Date</option>
            <option value="priority">Priority</option>
            <option value="name">Name</option>
            <option value="created">Date created</option>
          </select>
        </label>
        <label className="display-menu-row">
          <span>Direction</span>
          <select
            value={value.direction}
            disabled={value.sorting === "manual"}
            onChange={(e) => set("direction", e.target.value as DisplayOptions["direction"])}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>

        <div className="display-menu-section-title">Filter</div>
        <label className="display-menu-row">
          <span>Date</span>
          <select value={value.filterDate} onChange={(e) => set("filterDate", e.target.value as DisplayOptions["filterDate"])}>
            <option value="all">All</option>
            <option value="today">Today</option>
            <option value="overdue">Overdue</option>
            <option value="upcoming">Upcoming (14d)</option>
            <option value="noDate">No date</option>
          </select>
        </label>
        <label className="display-menu-row">
          <span>Priority</span>
          <select
            value={value.filterPriority}
            onChange={(e) =>
              set("filterPriority", e.target.value === "all" ? "all" : (Number(e.target.value) as DisplayOptions["filterPriority"]))
            }
          >
            <option value="all">All</option>
            {PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_META[p].label}
              </option>
            ))}
          </select>
        </label>
        <label className="display-menu-row">
          <span>Label</span>
          <select value={value.filterLabel} onChange={(e) => set("filterLabel", e.target.value)}>
            <option value="all">All</option>
            {labels.map((l) => (
              <option key={l.id} value={l.name}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

        <button className="btn-text display-menu-reset" onClick={() => onChange({ ...DEFAULT_DISPLAY_OPTIONS, layout: value.layout })}>
          Reset all
        </button>
      </div>
    </>
  );
}
