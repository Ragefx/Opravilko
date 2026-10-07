import { tr } from "../i18n";
import type { Label } from "../api/types";
import { PRIORITY_META, PRIORITY_ORDER } from "../utils/priority";
import { DEFAULT_DISPLAY_OPTIONS, type DisplayOptions } from "../utils/displayOptions";
import { BoardViewIcon, ListViewIcon, UpcomingIcon } from "./icons";
import Select from "./Select";

export default function DisplayMenu({
  value,
  onChange,
  labels,
  allowCalendar = true,
  onClose,
}: {
  value: DisplayOptions;
  onChange: (next: DisplayOptions) => void;
  labels: Label[];
  allowCalendar?: boolean;
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
        <div className="display-menu-title">{tr("Layout", "Postavitev")}</div>
        <div className="layout-picker">
          <button
            className={value.layout === "list" ? "active" : ""}
            onClick={() => set("layout", "list")}
          >
            <ListViewIcon width={18} height={18} />
            {tr("List", "Seznam")}
          </button>
          <button
            className={value.layout === "board" ? "active" : ""}
            onClick={() => set("layout", "board")}
          >
            <BoardViewIcon width={18} height={18} />
            {tr("Board", "Tabla")}
          </button>
          {allowCalendar && (
            <button
              className={value.layout === "calendar" ? "active" : ""}
              onClick={() => set("layout", "calendar")}
            >
              <UpcomingIcon width={18} height={18} />
              {tr("Calendar", "Koledar")}
            </button>
          )}
        </div>

        {value.layout === "list" && (
          <label className="display-menu-row">
            <span>{tr("Completed tasks", "Opravljene naloge")}</span>
            <input
              type="checkbox"
              className="switch"
              checked={value.showCompleted}
              onChange={(e) => set("showCompleted", e.target.checked)}
            />
          </label>
        )}

        <div className="display-menu-section-title">{tr("Sort", "Razvrsti")}</div>
        <label className="display-menu-row">
          <span>{tr("Grouping", "Združevanje")}</span>
          <Select sheetTitle={tr("Grouping", "Združevanje")} value={value.grouping} onChange={(e) => set("grouping", e.target.value as DisplayOptions["grouping"])}>
            <option value="none">{tr("None", "Brez")}</option>
            <option value="priority">{tr("Priority", "Prednost")}</option>
            <option value="label">{tr("Label", "Oznaka")}</option>
            <option value="dueDate">{tr("Due date", "Datum")}</option>
          </Select>
        </label>
        <label className="display-menu-row">
          <span>{tr("Sorting", "Razvrščanje")}</span>
          <Select sheetTitle={tr("Sorting", "Razvrščanje")} value={value.sorting} onChange={(e) => set("sorting", e.target.value as DisplayOptions["sorting"])}>
            <option value="manual">{tr("Manual", "Ročno")}</option>
            <option value="date">{tr("Date", "Datum")}</option>
            <option value="priority">{tr("Priority", "Prednost")}</option>
            <option value="name">{tr("Name", "Ime")}</option>
            <option value="created">{tr("Date created", "Datum nastanka")}</option>
          </Select>
        </label>
        <label className="display-menu-row">
          <span>{tr("Direction", "Smer")}</span>
          <Select
            sheetTitle={tr("Direction", "Smer")}
            value={value.direction}
            disabled={value.sorting === "manual"}
            onChange={(e) => set("direction", e.target.value as DisplayOptions["direction"])}
          >
            <option value="asc">{tr("Ascending", "Naraščajoče")}</option>
            <option value="desc">{tr("Descending", "Padajoče")}</option>
          </Select>
        </label>

        <div className="display-menu-section-title">{tr("Filter", "Filter")}</div>
        <label className="display-menu-row">
          <span>{tr("Date", "Datum")}</span>
          <Select sheetTitle={tr("Show by date", "Prikaži po datumu")} value={value.filterDate} onChange={(e) => set("filterDate", e.target.value as DisplayOptions["filterDate"])}>
            <option value="all">{tr("All", "Vse")}</option>
            <option value="today">{tr("Today", "Danes")}</option>
            <option value="overdue">{tr("Overdue", "Zamujeno")}</option>
            <option value="upcoming">{tr("Upcoming (14d)", "Prihajajoče (14 dni)")}</option>
            <option value="noDate">{tr("No date", "Brez datuma")}</option>
          </Select>
        </label>
        <label className="display-menu-row">
          <span>{tr("Priority", "Prednost")}</span>
          <Select
            sheetTitle={tr("Show by priority", "Prikaži po prednosti")}
            value={value.filterPriority}
            onChange={(e) =>
              set("filterPriority", e.target.value === "all" ? "all" : (Number(e.target.value) as DisplayOptions["filterPriority"]))
            }
          >
            <option value="all">{tr("All", "Vse")}</option>
            {PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_META[p].label}
              </option>
            ))}
          </Select>
        </label>
        <label className="display-menu-row">
          <span>{tr("Label", "Oznaka")}</span>
          <Select sheetTitle={tr("Show by label", "Prikaži po oznaki")} value={value.filterLabel} onChange={(e) => set("filterLabel", e.target.value)}>
            <option value="all">{tr("All", "Vse")}</option>
            {labels.map((l) => (
              <option key={l.id} value={l.name}>
                {l.name}
              </option>
            ))}
          </Select>
        </label>

        <button className="btn-text display-menu-reset" onClick={() => onChange({ ...DEFAULT_DISPLAY_OPTIONS, layout: value.layout })}>
          {tr("Reset all", "Ponastavi vse")}
        </button>
      </div>
    </>
  );
}
