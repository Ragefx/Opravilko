import { useParams } from "react-router-dom";
import { useBootstrap, useUpdateProject } from "../api/hooks";
import TaskListView from "../components/TaskListView";
import BoardView from "../components/BoardView";
import { BoardViewIcon, ListViewIcon } from "../components/icons";

export default function ProjectView() {
  const { id } = useParams<{ id: string }>();
  const projectId = id || "inbox";
  const { data, isLoading } = useBootstrap();
  const updateProject = useUpdateProject();
  if (isLoading || !data) return null;

  const project = data.projects.find((p) => p.id === projectId);
  if (!project) return <div className="empty-state">Project not found.</div>;

  const viewStyle = project.viewStyle || "list";

  const header = (
    <div className="topbar" style={{ padding: "0 0 16px", border: "none" }}>
      <h1>{project.name}</h1>
      <div className="view-toggle">
        <button
          className={viewStyle === "list" ? "active" : ""}
          onClick={() => updateProject.mutate({ id: project.id, viewStyle: "list" })}
        >
          <ListViewIcon width={15} height={15} /> List
        </button>
        <button
          className={viewStyle === "board" ? "active" : ""}
          onClick={() => updateProject.mutate({ id: project.id, viewStyle: "board" })}
        >
          <BoardViewIcon width={15} height={15} /> Board
        </button>
      </div>
    </div>
  );

  if (viewStyle === "board") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <div style={{ padding: "16px 24px 0" }}>{header}</div>
        <BoardView projectId={project.id} />
      </div>
    );
  }

  const tasks = data.tasks.filter((t) => t.projectId === projectId);
  return (
    <TaskListView
      title={project.name}
      tasks={tasks}
      quickAddProjectId={project.id}
      header={header}
      reorderable
    />
  );
}
