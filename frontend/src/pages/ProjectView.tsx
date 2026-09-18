import { useParams } from "react-router-dom";
import { useBootstrap } from "../api/hooks";
import TaskListView from "../components/TaskListView";

export default function ProjectView() {
  const { id } = useParams<{ id: string }>();
  const projectId = id || "inbox";
  const { data, isLoading } = useBootstrap();
  if (isLoading || !data) return null;

  const project = data.projects.find((p) => p.id === projectId);
  if (!project) return <div className="empty-state">Project not found.</div>;

  const tasks = data.tasks.filter((t) => t.projectId === projectId);

  return <TaskListView title={project.name} tasks={tasks} quickAddProjectId={project.id} />;
}
