import { Fragment, useMemo, useState, type ReactNode } from "react";
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
import {
  ChartIcon,
  CheckCircleIcon,
  ChevronIcon,
  EditIcon,
  FilterIcon,
  FocusIcon,
  InboxIcon,
  LabelIcon,
  LogOutIcon,
  MoonIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  ShareIcon,
  StarIcon,
  SunIcon,
  TodayIcon,
  TrashIcon,
  UpcomingIcon,
} from "./icons";
import EntityModal, { type EditableEntity, type EntityKind } from "./EntityModal";
import ShareModal from "./ShareModal";
import RowMenu from "./RowMenu";
import { useToast } from "./ToastProvider";
import { clearWidget } from "../native/widget";
import { activeSession, endSession, usingFirebase } from "../data/store";
import { signOut } from "../firebase/auth";

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

const COLLAPSED_KEY = "opravilko.collapsedProjects";

function loadCollapsedProjects(): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function saveCollapsedProjects(ids: Set<string>): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

export default function Sidebar({
  onSearch,
  onQuickAdd,
  onOpenSettings,
  pinned,
  onTogglePin,
  mobileOpen = false,
}: {
  onSearch: () => void;
  onQuickAdd: () => void;
  onOpenSettings: () => void;
  /** Sidebar stays open beside the page (wider screens), instead of sliding in. */
  pinned: boolean;
  onTogglePin: () => void;
  /** On narrow screens the sidebar is an off-canvas drawer; this slides it in. */
  mobileOpen?: boolean;
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

  const [modal, setModal] = useState<{
    kind: EntityKind;
    existing?: EditableEntity;
    defaultParentId?: string;
  } | null>(null);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(loadCollapsedProjects);

  function toggleProjectCollapsed(id: string) {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveCollapsedProjects(next);
      return next;
    });
  }
  const [sharing, setSharing] = useState<string | null>(null);
  const [theme, setThemeState] = useState(currentEffectiveTheme);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

  const counts = useMemo(() => {
    if (!data) return { today: 0, inbox: 0, midva: 0 };
    const active = data.tasks.filter((t) => !t.completed);
    return {
      today: active.filter((t) => isDueToday(t.due) || isOverdue(t.due)).length,
      inbox: active.filter((t) => t.projectId === "inbox").length,
      midva: active.filter((t) => t.sharedWith?.length && !t.parentId).length,
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
        navigate("/app");
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
        navigate("/app");
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
        navigate("/app");
        showToast({
          message: `Filter “${name}” deleted`,
          actionLabel: "Undo",
          onAction: () => restoreFilter.mutate(removed),
        });
      },
    });
  }

  // Projects form a tree via parentId; a project whose parent no longer
  // exists is treated as top-level rather than disappearing.
  const projectIds = new Set(topProjects.map((p) => p.id));
  const childrenOf = (id: string) => topProjects.filter((p) => p.parentId === id);
  const rootProjects = topProjects.filter((p) => !p.parentId || !projectIds.has(p.parentId));
  // Reserve a slot for the collapse arrow only once some project is nested,
  // so names stay aligned whether or not a row has children.
  const anyNested = topProjects.some((p) => p.parentId && projectIds.has(p.parentId));

  function renderProject(p: (typeof topProjects)[number], depth: number): ReactNode {
    const children = childrenOf(p.id);
    const collapsed = collapsedProjects.has(p.id);
    return (
      <Fragment key={p.id}>
        <NavLink
          to={`/app/project/${p.id}`}
          className={({ isActive }) => `sidebar-link sidebar-project-link ${isActive ? "active" : ""}`}
          style={depth > 0 ? { paddingLeft: 8 + depth * 18 } : undefined}
        >
          {children.length > 0 ? (
            <button
              className="sidebar-project-toggle"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleProjectCollapsed(p.id);
              }}
              aria-label={collapsed ? "Expand sub-projects" : "Collapse sub-projects"}
            >
              <ChevronIcon width={12} height={12} style={{ transform: collapsed ? "rotate(-90deg)" : undefined }} />
            </button>
          ) : anyNested ? (
            <span className="sidebar-project-toggle" />
          ) : null}
          <span className="project-hash" style={{ color: colorHex(p.color) }}>
            #
          </span>
          <span className="sidebar-link-label">{p.name}</span>
          {(p.members?.length ?? 0) > 1 && (
            <span className="sidebar-shared" title="Shared">
              <ShareIcon width={13} height={13} />
            </span>
          )}
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
                onClick: () =>
                  setModal({
                    kind: "project",
                    existing: { id: p.id, name: p.name, color: p.color, parentId: p.parentId },
                  }),
              },
              {
                label: "Add sub-project",
                icon: <PlusIcon width={14} height={14} />,
                onClick: () => setModal({ kind: "project", defaultParentId: p.id }),
              },
              ...(usingFirebase()
                ? [
                    {
                      label: "Share…",
                      icon: <ShareIcon width={14} height={14} />,
                      onClick: () => setSharing(p.id),
                    },
                  ]
                : []),
              // Only the owner can delete a shared project; others can leave it.
              p.ownerId && p.ownerId !== activeSession()?.userId
                ? {
                    label: "Leave project",
                    icon: <TrashIcon width={14} height={14} />,
                    danger: true,
                    onClick: () => {
                      void activeSession()?.leaveProject(p.id);
                      navigate("/app");
                      showToast({ message: `Left “${p.name}”` });
                    },
                  }
                : {
                    label: "Delete project",
                    icon: <TrashIcon width={14} height={14} />,
                    danger: true,
                    onClick: () => handleDeleteProject(p.id, p.name),
                  },
            ]}
          />
        </NavLink>
        {!collapsed && children.map((c) => renderProject(c, depth + 1))}
      </Fragment>
    );
  }

  return (
    <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
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
        {/* Keep the sidebar open, or let it slide away (wider screens only). */}
        <button
          className={`sidebar-icon-btn sidebar-pin ${pinned ? "is-pinned" : ""}`}
          onClick={onTogglePin}
          aria-pressed={pinned}
          aria-label={pinned ? "Let the sidebar hide" : "Keep the sidebar open"}
          title={pinned ? "Let the sidebar hide" : "Keep the sidebar open"}
        >
          <PinIcon width={16} height={16} />
        </button>
        <RowMenu
          label="Account"
          items={[
            {
              label: "Settings",
              icon: <SettingsIcon width={14} height={14} />,
              onClick: onOpenSettings,
            },
            usingFirebase()
              ? {
                  label: "Sign out",
                  icon: <LogOutIcon width={14} height={14} />,
                  danger: true,
                  onClick: async () => {
                    endSession();
                    await signOut();
                    navigate("/connect", { replace: true });
                  },
                }
              : {
                  label: "Disconnect Dropbox",
                  icon: <LogOutIcon width={14} height={14} />,
                  danger: true,
                  onClick: () => {
                    disconnect();
                    clearWidget();
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
        {data?.me && (
          <NavLink to="/app/midva" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
            <ShareIcon className="icon" />
            Midva
            {counts.midva > 0 && <span className="badge">{counts.midva}</span>}
          </NavLink>
        )}
        <NavLink to="/app/home" className={({ isActive }) => `sidebar-link sidebar-soca-only ${isActive ? "active" : ""}`}>
          <FocusIcon className="icon" />
          Now · Next · Later
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
        <NavLink to="/app/stats" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
          <ChartIcon className="icon" />
          Productivity
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
        {rootProjects.map((p) => renderProject(p, 0))}
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

      {modal && (
        <EntityModal
          kind={modal.kind}
          existing={modal.existing}
          defaultParentId={modal.defaultParentId}
          onClose={() => setModal(null)}
        />
      )}
      {sharing && data?.projects.find((p) => p.id === sharing) && (
        <ShareModal project={data.projects.find((p) => p.id === sharing)!} onClose={() => setSharing(null)} />
      )}
    </aside>
  );
}
