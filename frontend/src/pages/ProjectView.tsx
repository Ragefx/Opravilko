import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useBootstrap, useUpdateProject } from "../api/hooks";
import TaskListView from "../components/TaskListView";
import BoardView from "../components/BoardView";
import CalendarView from "../components/CalendarView";
import DisplayMenu from "../components/DisplayMenu";
import ArchivedSectionsMenu from "../components/ArchivedSectionsMenu";
import { ArchiveIcon } from "../components/icons";
import { DEFAULT_DISPLAY_OPTIONS, filterTasks, groupKeyFor, sortTasks, type DisplayOptions } from "../utils/displayOptions";
import { setStoredDisplayOptions, withStoredDisplayOptions } from "../utils/displayOptionsStorage";
import { groupEventsByDate } from "../utils/calendarSync";

export default function ProjectView() {
  const { id } = useParams<{ id: string }>();
  const projectId = id || "inbox";
  const { data, isLoading } = useBootstrap();
  const updateProject = useUpdateProject();
  const [searchParams, setSearchParams] = useSearchParams();
  const [autoOpenId] = useState(() => searchParams.get("open"));
  const [showDisplayMenu, setShowDisplayMenu] = useState(false);
  const [showArchivedMenu, setShowArchivedMenu] = useState(false);
  const [display, setDisplay] = useState<DisplayOptions>(DEFAULT_DISPLAY_OPTIONS);
  const [initializedFor, setInitializedFor] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("open")) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const project = data?.projects.find((p) => p.id === projectId);

  // Seed grouping/sort/filters from this project's remembered choices, and
  // layout from its saved viewStyle, once per project -- without clobbering
  // in-session tweaks on re-renders.
  useEffect(() => {
    if (project && initializedFor !== project.id) {
      setDisplay(withStoredDisplayOptions(project.id, project.viewStyle || "list"));
      setInitializedFor(project.id);
    }
  }, [project, initializedFor]);

  if (isLoading || !data) return null;
  if (!project) return <div className="empty-state">Project not found.</div>;

  function handleDisplayChange(next: DisplayOptions) {
    setDisplay(next);
    setStoredDisplayOptions(project!.id, next);
    if (next.layout !== display.layout) {
      updateProject.mutate({ id: project!.id, viewStyle: next.layout });
    }
  }

  const archivedSections = data.sections.filter((s) => s.projectId === projectId && s.archived);
  const archivedTaskCounts = Object.fromEntries(
    archivedSections.map((s) => [s.id, data.tasks.filter((t) => t.sectionId === s.id).length])
  );

  const header = (
    <div className="topbar" style={{ padding: "0 0 16px", border: "none" }}>
      <h1>{project.name}</h1>
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
        <div style={{ position: "relative" }}>
          <button className="btn btn-secondary" onClick={() => setShowDisplayMenu((v) => !v)}>
            Display
          </button>
          {showDisplayMenu && (
            <DisplayMenu
              value={display}
              onChange={handleDisplayChange}
              labels={data.labels}
              onClose={() => setShowDisplayMenu(false)}
            />
          )}
        </div>
      </div>
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
        <div style={{ padding: "16px 24px 0 32px" }}>{header}</div>
        <BoardView projectId={project.id} autoOpenTaskId={autoOpenId || undefined} display={display} />
      </div>
    );
  }

  if (display.layout === "calendar") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <div style={{ padding: "16px 24px 0 32px" }}>{header}</div>
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
    ? (t: (typeof sorted)[number]) => (t.sectionId ? sectionNameById.get(t.sectionId) ?? "Other" : "No section")
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
