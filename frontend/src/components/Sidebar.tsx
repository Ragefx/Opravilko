import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { useBootstrap } from "../api/hooks";
import { colorHex } from "../utils/colors";
import { isDueToday, isOverdue } from "../utils/date";
import {
  FilterIcon,
  InboxIcon,
  LabelIcon,
  PlusIcon,
  TodayIcon,
  UpcomingIcon,
} from "./icons";
import NewProjectModal from "./NewProjectModal";
import NewLabelModal from "./NewLabelModal";
import NewFilterModal from "./NewFilterModal";

export default function Sidebar() {
  const { data } = useBootstrap();
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewLabel, setShowNewLabel] = useState(false);
  const [showNewFilter, setShowNewFilter] = useState(false);

  const counts = useMemo(() => {
    if (!data) return { today: 0, inbox: 0 };
    const active = data.tasks.filter((t) => !t.completed);
    return {
      today: active.filter((t) => isDueToday(t.due) || isOverdue(t.due)).length,
      inbox: active.filter((t) => t.projectId === "inbox").length,
    };
  }, [data]);

  const topProjects = (data?.projects || [])
    .filter((p) => !p.isInboxProject)
    .sort((a, b) => a.order - b.order);
  const labels = (data?.labels || []).slice().sort((a, b) => a.order - b.order);
  const filters = (data?.filters || []).slice().sort((a, b) => a.order - b.order);

  return (
    <aside className="sidebar">
      <div className="sidebar-user">
        <div className="sidebar-avatar">O</div>
        Opravilko
      </div>

      <button className="sidebar-add" onClick={() => setShowNewProject(true)}>
        <PlusIcon width={16} height={16} />
        Add project
      </button>

      <nav className="sidebar-nav">
        <NavLink to="/app/inbox" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
          <InboxIcon className="icon" />
          Inbox
          {counts.inbox > 0 && <span className="badge">{counts.inbox}</span>}
        </NavLink>
        <NavLink to="/app/today" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
          <TodayIcon className="icon" />
          Today
          {counts.today > 0 && <span className="badge">{counts.today}</span>}
        </NavLink>
        <NavLink to="/app/upcoming" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
          <UpcomingIcon className="icon" />
          Upcoming
        </NavLink>
      </nav>

      <div className="sidebar-section-title">
        <span>Projects</span>
        <button onClick={() => setShowNewProject(true)} aria-label="Add project">
          <PlusIcon width={14} height={14} />
        </button>
      </div>
      <nav className="sidebar-nav">
        {topProjects.map((p) => (
          <NavLink
            key={p.id}
            to={`/app/project/${p.id}`}
            className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
          >
            <span className="color-dot" style={{ background: colorHex(p.color) }} />
            {p.name}
          </NavLink>
        ))}
        {topProjects.length === 0 && (
          <span style={{ color: "var(--color-text-muted)", padding: "4px 8px", fontSize: 13 }}>
            No projects yet
          </span>
        )}
      </nav>

      <div className="sidebar-section-title">
        <span>Labels</span>
        <button onClick={() => setShowNewLabel(true)} aria-label="Add label">
          <PlusIcon width={14} height={14} />
        </button>
      </div>
      <nav className="sidebar-nav">
        {labels.map((l) => (
          <NavLink
            key={l.id}
            to={`/app/label/${encodeURIComponent(l.name)}`}
            className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
          >
            <LabelIcon className="icon" style={{ color: colorHex(l.color) }} />
            {l.name}
          </NavLink>
        ))}
        {labels.length === 0 && (
          <span style={{ color: "var(--color-text-muted)", padding: "4px 8px", fontSize: 13 }}>
            No labels yet
          </span>
        )}
      </nav>

      <div className="sidebar-section-title">
        <span>Filters</span>
        <button onClick={() => setShowNewFilter(true)} aria-label="Add filter">
          <PlusIcon width={14} height={14} />
        </button>
      </div>
      <nav className="sidebar-nav">
        {filters.map((f) => (
          <NavLink
            key={f.id}
            to={`/app/filter/${f.id}`}
            className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
          >
            <FilterIcon className="icon" style={{ color: colorHex(f.color) }} />
            {f.name}
          </NavLink>
        ))}
        {filters.length === 0 && (
          <span style={{ color: "var(--color-text-muted)", padding: "4px 8px", fontSize: 13 }}>
            No filters yet
          </span>
        )}
      </nav>

      {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} />}
      {showNewLabel && <NewLabelModal onClose={() => setShowNewLabel(false)} />}
      {showNewFilter && <NewFilterModal onClose={() => setShowNewFilter(false)} />}
    </aside>
  );
}
