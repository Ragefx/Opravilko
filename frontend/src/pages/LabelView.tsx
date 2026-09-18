import { useParams } from "react-router-dom";
import { useBootstrap } from "../api/hooks";
import TaskListView from "../components/TaskListView";

export default function LabelView() {
  const { name } = useParams<{ name: string }>();
  const { data, isLoading } = useBootstrap();
  if (isLoading || !data || !name) return null;

  const decoded = decodeURIComponent(name);
  const tasks = data.tasks.filter((t) => t.labels.includes(decoded));
  const projectNameById = Object.fromEntries(data.projects.map((p) => [p.id, p.name]));

  return (
    <TaskListView
      title={`@${decoded}`}
      tasks={tasks}
      showProjectChip
      projectNameById={projectNameById}
    />
  );
}
