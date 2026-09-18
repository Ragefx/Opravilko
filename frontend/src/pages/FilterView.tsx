import { useParams } from "react-router-dom";
import { useBootstrap } from "../api/hooks";
import TaskListView from "../components/TaskListView";
import { matchesQuery } from "../utils/filterQuery";

export default function FilterView() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useBootstrap();
  if (isLoading || !data) return null;

  const filter = data.filters.find((f) => f.id === id);
  if (!filter) return <div className="empty-state">Filter not found.</div>;

  const tasks = data.tasks.filter((t) => matchesQuery(t, filter.query, data));
  const projectNameById = Object.fromEntries(data.projects.map((p) => [p.id, p.name]));

  return (
    <TaskListView
      title={filter.name}
      tasks={tasks}
      showProjectChip
      projectNameById={projectNameById}
    />
  );
}
