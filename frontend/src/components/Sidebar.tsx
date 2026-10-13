import { tr } from "../i18n";
import { useHidden } from "../utils/simple";
import { appUi } from "../utils/appUi";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { openThisMonth } from "../utils/calendarTasks";
import { NavLink, useNavigate } from "react-router-dom";
import { shoppingListOf } from "../utils/shopping";
import {
  useBootstrap,
  useDeleteFilter,
  useDeleteLabel,
  useRestoreFilter,
  useRestoreLabel,
  useUpdateFilter,
  useUpdateLabel,
  useUpdateProject,
} from "../api/hooks";
import { colorHex } from "../utils/colors";
import { isDueToday, isOverdue } from "../utils/date";
import { currentEffectiveTheme, setTheme } from "../utils/theme";
import {
  ChartIcon,
  CheckCircleIcon,
  ChevronIcon,
  EditIcon,
  FilterIcon,
  FocusIcon,
  CalendarIcon,
  CartIcon,
  InboxIcon,
  LabelIcon,
  MoonIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  ShareIcon,
  StarIcon,
  SunIcon,
  TrashIcon,
  ReviewIcon,
} from "./icons";
import EntityModal, { type EditableEntity, type EntityKind } from "./EntityModal";
import RowMenu from "./RowMenu";
import ProjectMenu from "./ProjectMenu";
import { useToast } from "./ToastProvider";
import { OPEN_WEEKLY_REVIEW, reviewDueToday } from "./WeeklyReview";
import { useWeeklyReview } from "../utils/weeklyReview";

function StarToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      className={`sidebar-star ${active ? "is-favorite" : ""}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-label={active ? tr("Remove from favorites", "Odstrani iz priljubljenih") : tr("Add to favorites", "Dodaj med priljubljene")}
      title={active ? tr("Remove from favorites", "Odstrani iz priljubljenih") : tr("Add to favorites", "Dodaj med priljubljene")}
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
  const deleteLabel = useDeleteLabel();
  const deleteFilter = useDeleteFilter();
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
  const [theme, setThemeState] = useState(currentEffectiveTheme);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

  // On the weekend, until done: how many tasks the weekly review has to sort.
  const reviewOn = useWeeklyReview();
  const reviewCount = reviewOn ? reviewDueToday(data) : 0;
  const counts = useMemo(() => {
    if (!data) return { today: 0, inbox: 0, midva: 0, calendar: 0, shopping: 0 };
    const active = data.tasks.filter((t) => !t.completed);
    return {
      today: active.filter((t) => isDueToday(t.due) || isOverdue(t.due)).length,
      inbox: active.filter((t) => t.projectId === "inbox").length,
      midva: active.filter((t) => t.sharedWith?.length && !t.parentId).length,
      calendar: openThisMonth(data),
      shopping: (() => {
        const list = shoppingListOf(data.projects);
        return list ? active.filter((t) => t.projectId === list.id && !t.parentId).length : 0;
      })(),
    };
  }, [data]);

  const shoppingList = data ? shoppingListOf(data.projects) : undefined;
  const topProjects = (data?.projects || [])
    .filter((p) => !p.isInboxProject && p.id !== shoppingList?.id)
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

  const favoriteProjects = (data?.projects || []).filter((p) => p.isFavorite && p.id !== shoppingList?.id);
  const hideLabels = useHidden("labels");
  const hideCompleted = useHidden("completed");
  const hideProductivity = useHidden("productivity");
  const favoriteLabels = labels.filter((l) => l.isFavorite);
  const favoriteFilters = filters.filter((f) => f.isFavorite);
  const hasFavorites = favoriteProjects.length + favoriteLabels.length + favoriteFilters.length > 0;

  function handleDeleteLabel(id: string, name: string) {
    deleteLabel.mutate(id, {
      onSuccess: (removed) => {
        if (!removed) return;
        navigate("/app");
        showToast({
          message: tr(`Label “${name}” deleted`, `Oznaka »${name}« izbrisana`),
          actionLabel: tr("Undo", "Razveljavi"),
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
          message: tr(`Filter “${name}” deleted`, `Filter »${name}« izbrisan`),
          actionLabel: tr("Undo", "Razveljavi"),
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
              aria-label={collapsed ? tr("Expand sub-projects", "Razširi podprojekte") : tr("Collapse sub-projects", "Strni podprojekte")}
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
            <span className={`sidebar-shared ${projectTaskCounts[p.id] > 0 ? "has-count" : ""}`} title={tr("Shared", "Deljeno")}>
              <ShareIcon width={13} height={13} />
            </span>
          )}
          {projectTaskCounts[p.id] > 0 && <span className="badge sidebar-project-count">{projectTaskCounts[p.id]}</span>}
          <StarToggle
            active={p.isFavorite}
            onClick={() => updateProject.mutate({ id: p.id, isFavorite: !p.isFavorite })}
          />
          <ProjectMenu project={p} />
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
          aria-label={theme === "dark" ? tr("Switch to light mode", "Preklopi na svetlo") : tr("Switch to dark mode", "Preklopi na temno")}
          title={theme === "dark" ? tr("Switch to light mode", "Preklopi na svetlo") : tr("Switch to dark mode", "Preklopi na temno")}
        >
          {theme === "dark" ? <SunIcon width={16} height={16} /> : <MoonIcon width={16} height={16} />}
        </button>
        {/* Keep the sidebar open, or let it slide away (wider screens only). */}
        <button
          className={`sidebar-icon-btn sidebar-pin ${pinned ? "is-pinned" : ""}`}
          onClick={onTogglePin}
          aria-pressed={pinned}
          aria-label={pinned ? tr("Let the sidebar hide", "Naj se meni skrije") : tr("Keep the sidebar open", "Naj meni ostane odprt")}
          title={pinned ? tr("Let the sidebar hide", "Naj se meni skrije") : tr("Keep the sidebar open", "Naj meni ostane odprt")}
        >
          <PinIcon width={16} height={16} />
        </button>
        {/* Settings, straight away (signing out is in there, under your account). */}
        <button className="sidebar-icon-btn" onClick={onOpenSettings} aria-label={tr("Settings", "Nastavitve")} title={tr("Settings", "Nastavitve")}>
          <SettingsIcon width={17} height={17} />
        </button>
      </div>

      <button className="sidebar-add-task" onClick={onQuickAdd}>
        <PlusIcon width={18} height={18} />
        {tr("Add task", "Dodaj nalogo")}
      </button>

      <button className="sidebar-link sidebar-search" onClick={onSearch}>
        <SearchIcon className="icon" />
        {tr("Search", "Iskanje")}
        {!appUi && <kbd className="sidebar-kbd">/</kbd>}
      </button>

      <nav className="sidebar-nav">
        <NavLink to="/app/home" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
          <FocusIcon className="icon" />
          {tr("Now", "Zdaj")}
          {counts.today > 0 && <span className="badge">{counts.today}</span>}
        </NavLink>
        <NavLink to="/app/inbox" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
          <InboxIcon className="icon" />
          {tr("Inbox", "Prejeto")}
          {counts.inbox > 0 && <span className="badge">{counts.inbox}</span>}
        </NavLink>
        <NavLink to="/app/calendar" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
          <CalendarIcon className="icon" />
          {tr("Calendar", "Koledar")}
          {counts.calendar > 0 && <span className="badge">{counts.calendar}</span>}
        </NavLink>
        <NavLink to="/app/shopping" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
          <CartIcon className="icon" />
          {tr("Shopping", "Nakupi")}
          {counts.shopping > 0 && <span className="badge">{counts.shopping}</span>}
        </NavLink>
        {data?.me && (
          <NavLink to="/app/midva" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
            <ShareIcon className="icon" />
            {tr("Midva", "Midva")}
            {counts.midva > 0 && <span className="badge">{counts.midva}</span>}
          </NavLink>
        )}
        {!hideCompleted && (
          <NavLink to="/app/completed" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
            <CheckCircleIcon className="icon" />
            {tr("Completed", "Opravljeno")}
          </NavLink>
        )}
        {!hideProductivity && (
          <NavLink to="/app/stats" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
            <ChartIcon className="icon" />
            {tr("Productivity", "Produktivnost")}
          </NavLink>
        )}
        {reviewOn && (
          <button className="sidebar-link" onClick={() => window.dispatchEvent(new Event(OPEN_WEEKLY_REVIEW))}>
            <ReviewIcon className="icon" />
            {tr("Weekly review", "Tedenski pregled")}
            {reviewCount > 0 && <span className="badge">{reviewCount}</span>}
          </button>
        )}
      </nav>

      {hasFavorites && (
        <>
          <div className="sidebar-section-title">
            <span>{tr("Favorites", "Priljubljeno")}</span>
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
        <span>{tr("Projects", "Projekti")}</span>
        <button onClick={() => setModal({ kind: "project" })} aria-label={tr("Add project", "Dodaj projekt")}>
          <PlusIcon width={14} height={14} />
        </button>
      </div>
      <nav className="sidebar-nav">
        {rootProjects.map((p) => renderProject(p, 0))}
        {topProjects.length === 0 && <span className="sidebar-empty">{tr("No projects yet", "Še ni projektov")}</span>}
      </nav>

      {/* Simple (Settings): no labels, so no labels or filters either. */}
      {!hideLabels && (
      <>
      <div className="sidebar-section-title">
        <span>{tr("Labels", "Oznake")}</span>
        <button onClick={() => setModal({ kind: "label" })} aria-label={tr("Add label", "Dodaj oznako")}>
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
                  label: tr("Edit label", "Uredi oznako"),
                  icon: <EditIcon width={14} height={14} />,
                  onClick: () => setModal({ kind: "label", existing: { id: l.id, name: l.name, color: l.color } }),
                },
                {
                  label: tr("Delete label", "Izbriši oznako"),
                  icon: <TrashIcon width={14} height={14} />,
                  danger: true,
                  onClick: () => handleDeleteLabel(l.id, l.name),
                },
              ]}
            />
          </NavLink>
        ))}
        {labels.length === 0 && <span className="sidebar-empty">{tr("No labels yet", "Še ni oznak")}</span>}
      </nav>

      <div className="sidebar-section-title">
        <span>{tr("Filters", "Filtri")}</span>
        <button onClick={() => setModal({ kind: "filter" })} aria-label={tr("Add filter", "Dodaj filter")}>
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
                  label: tr("Edit filter", "Uredi filter"),
                  icon: <EditIcon width={14} height={14} />,
                  onClick: () =>
                    setModal({
                      kind: "filter",
                      existing: { id: f.id, name: f.name, color: f.color, query: f.query },
                    }),
                },
                {
                  label: tr("Delete filter", "Izbriši filter"),
                  icon: <TrashIcon width={14} height={14} />,
                  danger: true,
                  onClick: () => handleDeleteFilter(f.id, f.name),
                },
              ]}
            />
          </NavLink>
        ))}
        {filters.length === 0 && <span className="sidebar-empty">{tr("No filters yet", "Še ni filtrov")}</span>}
      </nav>
      </>
      )}

      {modal && (
        <EntityModal
          kind={modal.kind}
          existing={modal.existing}
          defaultParentId={modal.defaultParentId}
          onClose={() => setModal(null)}
        />
      )}
    </aside>
  );
}
