import { tr } from "../i18n";
import { useMemo } from "react";
import { shoppingListOf } from "../utils/shopping";
import { openThisMonth } from "../utils/calendarTasks";
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
    const shopping = shoppingListOf(data.projects);
    // Favorites first, then the other top-level projects in sidebar order.
    const projects = data.projects
      .filter((p) => !p.isInboxProject && p.id !== shopping?.id && (!p.parentId || !projectIds.has(p.parentId) || p.isFavorite))
      .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.order - b.order);
    return [
      {
        to: "/app/home",
        label: tr("Now", "Zdaj"),
        count: open.filter((t) => isDueToday(t.due) || isOverdue(t.due)).length,
      },
      { to: "/app/inbox", label: tr("Inbox", "Prejeto"), count: count("inbox") },
      { to: "/app/calendar", label: tr("Calendar", "Koledar"), count: openThisMonth(data) },
      { to: "/app/shopping", label: tr("Shopping", "Nakupi"), count: shopping ? open.filter((t) => t.projectId === shopping.id && !t.parentId).length : 0 },
      // Midva: only with Firebase, where tasks can be shared.
      ...(data.me
        ? [{ to: "/app/midva", label: tr("Midva", "Midva"), count: open.filter((t) => t.sharedWith?.length && !t.parentId).length, color: "var(--color-accent)" }]
        : []),
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
        <button className="soca-icon-btn" onClick={onMenu} aria-label={tr("Projects, labels and settings", "Projekti, oznake in nastavitve")}>
          <MenuIcon width={20} height={20} />
        </button>
        <NavLink to="/app/home" className="soca-wordmark" aria-label={tr("Opravilko home", "Opravilko, začetek")}>
          opravilko<i>.</i>
        </NavLink>
        <button className="soca-command" onClick={onCommand}>
          <SearchIcon width={15} height={15} />
          <span>{tr("Jump to a project, or type a new task…", "Skoči na projekt ali vpiši novo nalogo …")}</span>
          <kbd>/</kbd>
        </button>
        <div className="soca-sync">
          <SyncIndicator />
        </div>
        <button className="soca-icon-btn soca-command-mobile" onClick={onCommand} aria-label={tr("Search or jump", "Išči ali skoči")}>
          <SearchIcon width={19} height={19} />
        </button>
        <button className="soca-add" onClick={onQuickAdd} aria-label={tr("Add task", "Dodaj nalogo")}>
          <PlusIcon width={18} height={18} />
          <span>{tr("Add", "Dodaj")}</span>
        </button>
      </div>
      <nav className="soca-chips" aria-label={tr("Places", "Mesta")}>
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
