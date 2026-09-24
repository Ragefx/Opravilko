import { useMemo, useState } from "react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { useBootstrap, useCompleteTask } from "../api/hooks";
import type { Task } from "../api/types";
import TaskCheckbox from "../components/TaskCheckbox";
import TaskDetail from "../components/TaskDetail";
import { PRIORITY_META } from "../utils/priority";
import { useToast } from "../components/ToastProvider";
import { CheckCircleIcon, SearchIcon } from "../components/icons";
import { activeSession, usingFirebase } from "../data/store";
import Select from "../components/Select";

function groupLabel(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE d MMMM");
}

export default function CompletedView() {
  const { data, isLoading } = useBootstrap();
  const completeTask = useCompleteTask();
  const showToast = useToast();
  const [query, setQuery] = useState("");
  const [projectId, setProjectId] = useState("all");
  const [openTask, setOpenTask] = useState<Task | null>(null);
  // With Firebase, tasks finished more than a few days ago load on request.
  const [olderState, setOlderState] = useState<"idle" | "loading" | "done">("idle");

  const completed = useMemo(() => {
    if (!data) return [];
    return data.tasks
      .filter((t) => t.completed && t.completedAt)
      .filter((t) => projectId === "all" || t.projectId === projectId)
      .filter((t) => !query.trim() || t.content.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
  }, [data, projectId, query]);

  if (isLoading || !data) return null;

  const projectNameById = Object.fromEntries(data.projects.map((p) => [p.id, p.name]));

  const groups = new Map<string, Task[]>();
  for (const t of completed) {
    const key = groupLabel(t.completedAt!);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  function restore(t: Task) {
    completeTask.mutate(
      { id: t.id, completed: false },
      { onSuccess: () => showToast({ message: `"${t.content}" restored to ${projectNameById[t.projectId] || "its project"}` }) }
    );
  }

  return (
    <div className="content-scroll">
      <div className="page-header">
        <div>
          <h1>Completed</h1>
          <div className="page-subtitle" style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <CheckCircleIcon width={14} height={14} />
            {completed.length} {completed.length === 1 ? "task" : "tasks"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <label className="field-pill" style={{ flex: 1, gap: 6 }}>
          <SearchIcon width={14} height={14} />
          <input
            className="detail-date-input"
            style={{ width: "100%", fontSize: 13 }}
            placeholder="Search completed tasks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <Select sheetTitle="Project"
          className="detail-sidebar-select"
          style={{ width: 180 }}
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="all">All projects</option>
          {data.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>

      {usingFirebase() && olderState !== "done" && (
        <button
          className="btn btn-text"
          style={{ marginBottom: 12 }}
          disabled={olderState === "loading"}
          onClick={async () => {
            setOlderState("loading");
            await activeSession()?.loadArchived();
            setOlderState("done");
          }}
        >
          {olderState === "loading" ? "Loading…" : "Show older completed tasks"}
        </button>
      )}

      {completed.length === 0 && (
        <div className="empty-state">
          <CheckCircleIcon width={40} height={40} />
          <p>Nothing here yet</p>
          <span>Tasks you complete will show up here, and you can bring any of them back.</span>
        </div>
      )}

      {[...groups.entries()].map(([label, items]) => (
        <div key={label}>
          <div className="task-section-title">{label}</div>
          {items.map((t) => (
            <div key={t.id} className="task-row">
              <TaskCheckbox
                completed
                priorityColor={PRIORITY_META[t.priority].color}
                onToggle={() => restore(t)}
                ariaLabel="Restore task"
              />
              <div className="task-main">
                <div className="task-content completed" onClick={() => setOpenTask(t)}>
                  {t.content}
                </div>
                <div className="task-meta">
                  <span>{format(parseISO(t.completedAt!), "HH:mm")}</span>
                  {projectNameById[t.projectId] && <span className="chip">{projectNameById[t.projectId]}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}

      {openTask && <TaskDetail task={openTask} onClose={() => setOpenTask(null)} onOpenTask={setOpenTask} />}
    </div>
  );
}
