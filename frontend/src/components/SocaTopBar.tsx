import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { useBootstrap } from "../api/hooks";
import { colorHex } from "../utils/colors";
import { isDueToday, isOverdue } from "../utils/date";
import SyncIndicator from "./SyncIndicator";
import { MenuIcon, PlusIcon, SearchIcon } from "./icons";

/**
 * The Soča look's header, in place of the fixed sidebar: menu (opens the
 * full project/label/filter list as a drawer), the command bar, sync status
 * and add -- then a row of chips for the places you use most.
 */
export default function SocaTopBar({
  onMenu,
  onCommand,
  onQuickAdd,
}: {
  onMenu: () => void;
  onCommand: () => void;
  onQuickAdd: () => void;
}) {
  const { data } = useBootstrap();

  const chips = useMemo(() => {
    if (!data) return [];
    const open = data.tasks.filter((t) => !t.completed);
    const count = (projectId: string) => open.filter((t) => t.projectId === projectId).length;
    const projectIds = new Set(data.projects.map((p) => p.id));
    // Favorites first, then the other top-level projects in sidebar order.
    const projects = data.projects
      .filter((p) => !p.isInboxProject && (!p.parentId || !projectIds.has(p.parentId) || p.isFavorite))
      .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.order - b.order);
    return [
      {
        to: "/app/home",
        label: "Now",
        count: open.filter((t) => isDueToday(t.due) || isOverdue(t.due)).length,
      },
      { to: "/app/inbox", label: "Inbox", count: count("inbox") },
      ...projects.map((p) => ({ to: `/app/project/${p.id}`, label: p.name, count: count(p.id), color: colorHex(p.color) })),
      ...data.labels
        .filter((l) => l.isFavorite)
        .map((l) => ({ to: `/app/label/${encodeURIComponent(l.name)}`, label: `@${l.name}`, count: undefined })),
      ...data.filters
        .filter((f) => f.isFavorite)
        .map((f) => ({ to: `/app/filter/${f.id}`, label: f.name, count: undefined })),
    ] as { to: string; label: string; count?: number; color?: string }[];
  }, [data]);

  return (
    <header className="soca-top">
      <div className="soca-bar">
        <button className="soca-icon-btn" onClick={onMenu} aria-label="Projects, labels and settings">
          <MenuIcon width={20} height={20} />
        </button>
        <NavLink to="/app/home" className="soca-wordmark" aria-label="Opravilko home">
          opravilko<i>.</i>
        </NavLink>
        <button className="soca-command" onClick={onCommand}>
          <SearchIcon width={15} height={15} />
          <span>Jump to a project, or type a new task…</span>
          <kbd>/</kbd>
        </button>
        <div className="soca-sync">
          <SyncIndicator />
        </div>
        <button className="soca-icon-btn soca-command-mobile" onClick={onCommand} aria-label="Search or jump">
          <SearchIcon width={19} height={19} />
        </button>
        <button className="soca-add" onClick={onQuickAdd} aria-label="Add task">
          <PlusIcon width={18} height={18} />
          <span>Add</span>
        </button>
      </div>
      <nav className="soca-chips" aria-label="Places">
        {chips.map((c) => (
          <NavLink key={c.to} to={c.to} className={({ isActive }) => `soca-chip ${isActive ? "is-active" : ""}`}>
            {c.color && <span className="soca-chip-dot" style={{ background: c.color }} />}
            {c.label}
            {c.count ? <b>{c.count}</b> : null}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
