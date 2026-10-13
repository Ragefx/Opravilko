import { tr } from "../i18n";
import { useEffect, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { shoppingListOf } from "../utils/shopping";
import { useBootstrap } from "../api/hooks";
import TaskListView from "../components/TaskListView";
import BoardView from "../components/BoardView";
import CalendarView from "../components/CalendarView";
import ShoppingView from "../components/ShoppingView";
import ProjectMenu from "../components/ProjectMenu";
import ProjectFilesButton from "../components/ProjectFilesButton";
import SortMenu from "../components/SortMenu";
import { getStoredDisplayOptions, setStoredDisplayOptions } from "../utils/displayOptionsStorage";
import ProjectDescription from "../components/ProjectDescription";
import ArchivedSectionsMenu from "../components/ArchivedSectionsMenu";
import { ArchiveIcon } from "../components/icons";
import { DEFAULT_DISPLAY_OPTIONS, filterTasks, groupKeyFor, sortTasks, type DisplayOptions } from "../utils/displayOptions";
import { groupEventsByDate } from "../utils/calendarSync";
import AwaySheet from "../components/AwaySheet";
import { awayRange, tripWhen, tripIcon } from "../utils/away";
import { todayISO } from "../utils/date";

export default function ProjectView() {
  const { id } = useParams<{ id: string }>();
  const projectId = id || "inbox";
  const { data, isLoading } = useBootstrap();
  const [searchParams, setSearchParams] = useSearchParams();
  const [autoOpenId, setAutoOpenId] = useState(() => searchParams.get("open"));
  const [showArchivedMenu, setShowArchivedMenu] = useState(false);
  const [display, setDisplay] = useState<DisplayOptions>(DEFAULT_DISPLAY_OPTIONS);
  const [initializedFor, setInitializedFor] = useState<string | null>(null);
  const [tripOpen, setTripOpen] = useState(false);
  // From "Make it a trip project": straight to the trip dates.
  useEffect(() => {
    if (searchParams.get("trip") !== "1") return;
    setTripOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("trip");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const project = data?.projects.find((p) => p.id === projectId);
  // The shopping list has its own page, and a task from a project you're not
  // on (your partner's Inbox) opens in Midva: this page only passes those on,
  // ?open included -- so it mustn't clear ?open itself (nor before the data's in).
  const forwards = !!data && (!project || shoppingListOf(data.projects)?.id === project.id);

  // ?open=<task id> opens that task (also when it arrives while this page is
  // already showing, e.g. from the Android widget); then drop it from the URL.
  useEffect(() => {
    const open = searchParams.get("open");
    if (!open || !data || forwards) return;
    setSearchParams({}, { replace: true });
    setAutoOpenId(null);
    // Cleared first so the same task opens again if it's picked twice. (No
    // cancel on cleanup: clearing the URL above re-runs this effect.)
    window.requestAnimationFrame(() => setAutoOpenId(open));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, !!data, forwards]);

  // Seed grouping/sort/filters from this project's remembered choices, and
  // layout from its saved viewStyle, once per project -- without clobbering
  // in-session tweaks on re-renders.
  useEffect(() => {
    if (project && initializedFor !== project.id) {
      // No display menu any more: the Inbox is always a board, other projects
      // keep their layout (list, or the shopping list), and nothing is filtered.
      const layout = project.isInboxProject ? "board" : project.viewStyle === "shopping" ? "shopping" : "list";
      // Only the sorting is remembered (the Sort button).
      const stored = getStoredDisplayOptions(project.id);
      setDisplay({
        ...DEFAULT_DISPLAY_OPTIONS,
        layout,
        ...(stored?.sorting ? { sorting: stored.sorting, direction: stored.direction ?? "asc" } : {}),
      });
      setInitializedFor(project.id);
    }
  }, [project, initializedFor]);

  if (isLoading || !data) return null;
  if (!project) {
    // A task shared with you from a project you're not on (your partner's
    // Inbox): open it where shared tasks live.
    const wanted = autoOpenId ?? searchParams.get("open");
    if (wanted && data.tasks.some((t) => t.id === wanted)) {
      return <Navigate to={`/app/midva?open=${encodeURIComponent(wanted)}`} replace />;
    }
    return <div className="empty-state">{tr("Project not found.", "Projekta ni.")}</div>;
  }
  if (shoppingListOf(data.projects)?.id === project.id) {
    // An item opened from elsewhere (the widget) opens on the list's own page.
    const open = searchParams.get("open");
    return <Navigate to={`/app/shopping${open ? `?open=${encodeURIComponent(open)}` : ""}`} replace />;
  }

  const archivedSections = data.sections.filter((s) => s.projectId === projectId && s.archived);
  const archivedTaskCounts = Object.fromEntries(
    archivedSections.map((s) => [s.id, data.tasks.filter((t) => t.sectionId === s.id).length])
  );

  const header = (
    <div className="topbar project-topbar" style={{ padding: "0 0 16px", border: "none" }}>
      <div className="project-title-row">
        <h1>{project.name}</h1>
        {tripOpen && <AwaySheet projectId={project.id} onClose={() => setTripOpen(false)} />}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {archivedSections.length > 0 && (
          <div style={{ position: "relative" }}>
            <button className="btn btn-secondary" onClick={() => setShowArchivedMenu((v) => !v)}>
              <ArchiveIcon width={14} height={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
              Archived ({archivedSections.length})
            </button>
            {showArchivedMenu && (
              <ArchivedSectionsMenu
                sections={archivedSections}
                taskCountBySection={archivedTaskCounts}
                onClose={() => setShowArchivedMenu(false)}
              />
            )}
          </div>
        )}
        {/* Files belong to projects and tasks; the Inbox is only a place for new tasks. */}
        {!project.isInboxProject && <ProjectFilesButton project={project} />}
        <SortMenu
          value={display}
          onChange={(next) => {
            setDisplay(next);
            setStoredDisplayOptions(project.id, next);
          }}
        />
        <span className="project-header-menu">
          {/* The Inbox can't be edited or shared, but can use templates. */}
          <ProjectMenu project={project} templatesOnly={project.isInboxProject} />
        </span>
      </div>
      {!project.isInboxProject && <ProjectDescription key={project.id} project={project} />}
      {/* On its own line, so the buttons stay top right next to the name. */}
      {project.trip && (
        <div className="project-trip-line">
          <button className="project-trip-chip" onClick={() => setTripOpen(true)} title={tr("Trip dates", "Datumi potovanja")}>
            {tripIcon(project.trip)} {awayRange(project.trip)}
            {tripWhen(project.trip, todayISO()) && <b>{tripWhen(project.trip, todayISO())}</b>}
          </button>
        </div>
      )}
    </div>
  );

  const archivedSectionIds = new Set(archivedSections.map((s) => s.id));
  let tasks = data.tasks.filter(
    (t) => t.projectId === projectId && !(t.sectionId && archivedSectionIds.has(t.sectionId))
  );
  if (!display.showCompleted) tasks = tasks.filter((t) => !t.completed);
  tasks = filterTasks(tasks, display);

  if (display.layout === "board") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <div className="page-header-pad">{header}</div>
        <BoardView projectId={project.id} autoOpenTaskId={autoOpenId || undefined} display={display} />
      </div>
    );
  }

  if (display.layout === "shopping") {
    return <ShoppingView projectId={project.id} header={header} />;
  }

  if (display.layout === "calendar") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <div className="page-header-pad">{header}</div>
        <CalendarView
          tasks={tasks}
          projectId={project.id}
          eventsByDate={groupEventsByDate(data?.calendarEvents, data?.calendarFeeds)}
        />
      </div>
    );
  }

  let sorted = sortTasks(tasks, display);

  // With no explicit grouping chosen, fall back to the project's own sections so
  // they don't disappear when switching from Board to List.
  const sections = data.sections
    .filter((s) => s.projectId === projectId && !s.archived)
    .sort((a, b) => a.order - b.order);
  const groupBySection = display.grouping === "none" && sections.length > 0;

  if (groupBySection) {
    const sectionRank = new Map(sections.map((s, i) => [s.id, i + 1]));
    sorted = [...sorted].sort(
      (a, b) => (a.sectionId ? sectionRank.get(a.sectionId) ?? 99 : 0) - (b.sectionId ? sectionRank.get(b.sectionId) ?? 99 : 0)
    );
  }

  const sectionNameById = new Map(sections.map((s) => [s.id, s.name]));
  const groupLabel = groupBySection
    ? (t: (typeof sorted)[number]) => (t.sectionId ? sectionNameById.get(t.sectionId) ?? tr("Other", "Drugo") : tr("No section", "Brez razdelka"))
    : display.grouping !== "none"
      ? (t: (typeof sorted)[number]) => groupKeyFor(t, display.grouping)
      : undefined;

  return (
    <TaskListView
      title={project.name}
      tasks={sorted}
      quickAddProjectId={project.id}
      header={header}
      reorderable={display.sorting === "manual" && display.grouping === "none" && !groupBySection}
      preserveOrder={display.sorting !== "manual" || groupBySection}
      groupLabel={groupLabel}
      autoOpenTaskId={autoOpenId || undefined}
    />
  );
}
