import { useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  useBootstrap,
  useDeleteFilter,
  useDeleteLabel,
  useDeleteProject,
  useRestoreFilter,
  useRestoreLabel,
  useRestoreProject,
  useUpdateFilter,
  useUpdateLabel,
  useUpdateProject,
} from "../api/hooks";
import { colorHex } from "../utils/colors";
import { isDueToday, isOverdue } from "../utils/date";
import { disconnect } from "../dropbox/auth";
import { currentEffectiveTheme, setTheme } from "../utils/theme";
import { disableReminders, enableReminders, remindersEnabled } from "../utils/notifications";
import {
  BellIcon,
  CalendarIcon,
  CheckCircleIcon,
  EditIcon,
  FilterIcon,
  ImportIcon,
  InboxIcon,
  LabelIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  StarIcon,
  SunIcon,
  TodayIcon,
  TrashIcon,
  UpcomingIcon,
} from "./icons";
import EntityModal, { type EditableEntity, type EntityKind } from "./EntityModal";
import ImportModal from "./ImportModal";
import CalendarFeedsModal from "./CalendarFeedsModal";
import RowMenu from "./RowMenu";
import { useToast } from "./ToastProvider";

function StarToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      className={`sidebar-star ${active ? "is-favorite" : ""}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-label={active ? "Remove from favorites" : "Add to favorites"}
      title={active ? "Remove from favorites" : "Add to favorites"}
    >
      <StarIcon width={14} height={14} fill={active ? "#ff9a14" : "none"} />
    </button>
  );
}

export default function Sidebar({
  onSearch,
  onQuickAdd,
}: {
  onSearch: () => void;
  onQuickAdd: () => void;
}) {
  const { data } = useBootstrap();
  const navigate = useNavigate();
  const showToast = useToast();

  const updateProject = useUpdateProject();
  const updateLabel = useUpdateLabel();
  const updateFilter = useUpdateFilter();
  const deleteProject = useDeleteProject();
  const deleteLabel = useDeleteLabel();
  const deleteFilter = useDeleteFilter();
  const restoreProject = useRestoreProject();
  const restoreLabel = useRestoreLabel();
  const restoreFilter = useRestoreFilter();

  const [modal, setModal] = useState<{ kind: EntityKind; existing?: EditableEntity } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [calendarsOpen, setCalendarsOpen] = useState(false);
  const [theme, setThemeState] = useState(currentEffectiveTheme);
  const [remindersOn, setRemindersOn] = useState(remindersEnabled);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

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
  const projectTaskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of data?.tasks || []) {
      if (t.completed) continue;
      counts[t.projectId] = (counts[t.projectId] || 0) + 1;
    }
    return counts;
  }, [data]);
  const labels = (data?.labels || []).slice().sort((a, b) => a.order - b.order);
  const filters = (data?.filters || []).slice().sort((a, b) => a.order - b.order);

  const favoriteProjects = (data?.projects || []).filter((p) => p.isFavorite);
  const favoriteLabels = labels.filter((l) => l.isFavorite);
  const favoriteFilters = filters.filter((f) => f.isFavorite);
  const hasFavorites = favoriteProjects.length + favoriteLabels.length + favoriteFilters.length > 0;

  function handleDeleteProject(id: string, name: string) {
    deleteProject.mutate(id, {
      onSuccess: (removed) => {
        if (!removed) return;
        navigate("/app/today");
        showToast({
          message: `Project “${name}” deleted`,
          actionLabel: "Undo",
          onAction: () => restoreProject.mutate(removed),
        });
      },
    });
  }

  function handleDeleteLabel(id: string, name: string) {
    deleteLabel.mutate(id, {
      onSuccess: (removed) => {
        if (!removed) return;
        navigate("/app/today");
        showToast({
          message: `Label “${name}” deleted`,
          actionLabel: "Undo",
          onAction: () => restoreLabel.mutate(removed),
        });
      },
    });
  }

  function handleDeleteFilter(id: string, name: string) {
    deleteFilter.mutate(id, {
      onSuccess: (removed) => {
        if (!removed) return;
        navigate("/app/today");
        showToast({
          message: `Filter “${name}” deleted`,
          actionLabel: "Undo",
          onAction: () => restoreFilter.mutate(removed),
        });
      },
    });
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-user">
        <div className="sidebar-avatar">O</div>
        <span className="sidebar-brand">Opravilko</span>
        <button
          className="sidebar-icon-btn"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <SunIcon width={16} height={16} /> : <MoonIcon width={16} height={16} />}
        </button>
        <RowMenu
          label="Account"
          items={[
            {
              label: "Import from Todoist",
              icon: <ImportIcon width={14} height={14} />,
              onClick: () => setImportOpen(true),
            },
            {
              label: "Calendars",
              icon: <CalendarIcon width={14} height={14} />,
              onClick: () => setCalendarsOpen(true),
            },
            {
              label: remindersOn ? "Turn off reminders" : "Turn on reminders",
              icon: <BellIcon width={14} height={14} />,
              onClick: async () => {
                if (remindersOn) {
                  disableReminders();
                  setRemindersOn(false);
                  showToast({ message: "Reminders off" });
                } else {
                  const ok = await enableReminders();
                  setRemindersOn(ok);
                  showToast({
                    message: ok
                      ? "Reminders on — you'll be notified for tasks with a time, while the app is open"
                      : "Your browser blocked notifications",
                  });
                }
              },
            },
            {
              label: "Disconnect Dropbox",
              icon: <TrashIcon width={14} height={14} />,
              danger: true,
              onClick: () => {
                disconnect();
                navigate("/connect", { replace: true });
              },
            },
          ]}
        />
      </div>

      <button className="sidebar-add-task" onClick={onQuickAdd}>
        <PlusIcon width={18} height={18} />
        Add task
      </button>

      <button className="sidebar-link sidebar-search" onClick={onSearch}>
        <SearchIcon className="icon" />
        Search
        <kbd className="sidebar-kbd">/</kbd>
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
        <NavLink to="/app/completed" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
          <CheckCircleIcon className="icon" />
          Completed
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
                <span className="project-hash" style={{ color: colorHex(p.color) }}>
                  #
                </span>
                <span className="sidebar-link-label">{p.name}</span>
                {projectTaskCounts[p.id] > 0 && <span className="badge">{projectTaskCounts[p.id]}</span>}
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
        <button onClick={() => setModal({ kind: "project" })} aria-label="Add project">
          <PlusIcon width={14} height={14} />
        </button>
      </div>
      <nav className="sidebar-nav">
        {topProjects.map((p) => (
          <NavLink
            key={p.id}
            to={`/app/project/${p.id}`}
            className={({ isActive }) => `sidebar-link sidebar-project-link ${isActive ? "active" : ""}`}
          >
            <span className="project-hash" style={{ color: colorHex(p.color) }}>
              #
            </span>
            <span className="sidebar-link-label">{p.name}</span>
            {projectTaskCounts[p.id] > 0 && <span className="badge sidebar-project-count">{projectTaskCounts[p.id]}</span>}
            <StarToggle
              active={p.isFavorite}
              onClick={() => updateProject.mutate({ id: p.id, isFavorite: !p.isFavorite })}
            />
            <RowMenu
              label={p.name}
              items={[
                {
                  label: "Edit project",
                  icon: <EditIcon width={14} height={14} />,
                  onClick: () => setModal({ kind: "project", existing: { id: p.id, name: p.name, color: p.color } }),
                },
                {
                  label: "Delete project",
                  icon: <TrashIcon width={14} height={14} />,
                  danger: true,
                  onClick: () => handleDeleteProject(p.id, p.name),
                },
              ]}
            />
          </NavLink>
        ))}
        {topProjects.length === 0 && <span className="sidebar-empty">No projects yet</span>}
      </nav>

      <div className="sidebar-section-title">
        <span>Labels</span>
        <button onClick={() => setModal({ kind: "label" })} aria-label="Add label">
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
            <span className="sidebar-link-label">{l.name}</span>
            <StarToggle
              active={l.isFavorite}
              onClick={() => updateLabel.mutate({ id: l.id, isFavorite: !l.isFavorite })}
            />
            <RowMenu
              label={l.name}
              items={[
                {
                  label: "Edit label",
                  icon: <EditIcon width={14} height={14} />,
                  onClick: () => setModal({ kind: "label", existing: { id: l.id, name: l.name, color: l.color } }),
                },
                {
                  label: "Delete label",
                  icon: <TrashIcon width={14} height={14} />,
                  danger: true,
                  onClick: () => handleDeleteLabel(l.id, l.name),
                },
              ]}
            />
          </NavLink>
        ))}
        {labels.length === 0 && <span className="sidebar-empty">No labels yet</span>}
      </nav>

      <div className="sidebar-section-title">
        <span>Filters</span>
        <button onClick={() => setModal({ kind: "filter" })} aria-label="Add filter">
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
            <span className="sidebar-link-label">{f.name}</span>
            <StarToggle
              active={f.isFavorite}
              onClick={() => updateFilter.mutate({ id: f.id, isFavorite: !f.isFavorite })}
            />
            <RowMenu
              label={f.name}
              items={[
                {
                  label: "Edit filter",
                  icon: <EditIcon width={14} height={14} />,
                  onClick: () =>
                    setModal({
                      kind: "filter",
                      existing: { id: f.id, name: f.name, color: f.color, query: f.query },
                    }),
                },
                {
                  label: "Delete filter",
                  icon: <TrashIcon width={14} height={14} />,
                  danger: true,
                  onClick: () => handleDeleteFilter(f.id, f.name),
                },
              ]}
            />
          </NavLink>
        ))}
        {filters.length === 0 && <span className="sidebar-empty">No filters yet</span>}
      </nav>

      {modal && <EntityModal kind={modal.kind} existing={modal.existing} onClose={() => setModal(null)} />}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
      {calendarsOpen && <CalendarFeedsModal onClose={() => setCalendarsOpen(false)} />}
    </aside>
  );
}
