import { useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useBootstrap, useUpdateFilter, useUpdateLabel, useUpdateProject } from "../api/hooks";
import { colorHex } from "../utils/colors";
import { isDueToday, isOverdue } from "../utils/date";
import { disconnect } from "../dropbox/auth";
import {
  FilterIcon,
  InboxIcon,
  LabelIcon,
  PlusIcon,
  StarIcon,
  TodayIcon,
  UpcomingIcon,
} from "./icons";
import NewProjectModal from "./NewProjectModal";
import NewLabelModal from "./NewLabelModal";
import NewFilterModal from "./NewFilterModal";

function StarToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      className="sidebar-star"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-label={active ? "Remove from favorites" : "Add to favorites"}
      title={active ? "Remove from favorites" : "Add to favorites"}
    >
      <StarIcon
        width={14}
        height={14}
        fill={active ? "#ff9a14" : "none"}
        style={{ color: active ? "#ff9a14" : undefined }}
      />
    </button>
  );
}

export default function Sidebar() {
  const { data } = useBootstrap();
  const navigate = useNavigate();
  const updateProject = useUpdateProject();
  const updateLabel = useUpdateLabel();
  const updateFilter = useUpdateFilter();
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

  const favoriteProjects = (data?.projects || []).filter((p) => p.isFavorite);
  const favoriteLabels = labels.filter((l) => l.isFavorite);
  const favoriteFilters = filters.filter((f) => f.isFavorite);
  const hasFavorites = favoriteProjects.length + favoriteLabels.length + favoriteFilters.length > 0;

  return (
    <aside className="sidebar">
      <div className="sidebar-user">
        <div className="sidebar-avatar">O</div>
        Opravilko
        <button
          className="btn-text"
          style={{ marginLeft: "auto", fontSize: 12, padding: "4px 6px" }}
          onClick={() => {
            disconnect();
            navigate("/connect", { replace: true });
          }}
        >
          Disconnect
        </button>
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

      {hasFavorites && (
        <>
          <div className="sidebar-section-title">
            <span>Favorites</span>
          </div>
          <nav className="sidebar-nav">
            {favoriteProjects.map((p) => (
              <NavLink
                key={p.id}
                to={`/app/project/${p.id}`}
                className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
              >
                <span className="color-dot" style={{ background: colorHex(p.color) }} />
                {p.name}
              </NavLink>
            ))}
            {favoriteLabels.map((l) => (
              <NavLink
                key={l.id}
                to={`/app/label/${encodeURIComponent(l.name)}`}
                className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
              >
                <LabelIcon className="icon" style={{ color: colorHex(l.color) }} />
                {l.name}
              </NavLink>
            ))}
            {favoriteFilters.map((f) => (
              <NavLink
                key={f.id}
                to={`/app/filter/${f.id}`}
                className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
              >
                <FilterIcon className="icon" style={{ color: colorHex(f.color) }} />
                {f.name}
              </NavLink>
            ))}
          </nav>
        </>
      )}

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
            <StarToggle
              active={p.isFavorite}
              onClick={() => updateProject.mutate({ id: p.id, isFavorite: !p.isFavorite })}
            />
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
            <StarToggle
              active={l.isFavorite}
              onClick={() => updateLabel.mutate({ id: l.id, isFavorite: !l.isFavorite })}
            />
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
            <StarToggle
              active={f.isFavorite}
              onClick={() => updateFilter.mutate({ id: f.id, isFavorite: !f.isFavorite })}
            />
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
