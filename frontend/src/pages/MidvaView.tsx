import { useMemo, useState } from "react";
import { useBootstrap } from "../api/hooks";
import type { Partner, Task } from "../api/types";
import TaskRow from "../components/TaskRow";
import TaskDetail from "../components/TaskDetail";
import QuickAdd from "../components/QuickAdd";
import PartnerConnect from "../components/PartnerConnect";
import { isDueToday, isDueTomorrow, isOverdue } from "../utils/date";
import { ShareIcon } from "../components/icons";

function groupOf(t: Task): string {
  if (!t.due) return "No date";
  if (isOverdue(t.due)) return "Overdue";
  if (isDueToday(t.due)) return "Today";
  if (isDueTomorrow(t.due)) return "Tomorrow";
  return "Later";
}
const ORDER = ["Overdue", "Today", "Tomorrow", "Later", "No date"];

/**
 * Midva ("the two of us"): every task shared between you and your partner
 * on its own -- the ones you shared and the ones shared with you -- in one
 * list, by date. New tasks added here are shared automatically.
 */
export default function MidvaView() {
  const { data, isLoading } = useBootstrap();
  const [openTask, setOpenTask] = useState<Task | null>(null);

  const tasks = useMemo(
    () =>
      (data?.tasks || [])
        .filter((t) => !t.completed && t.sharedWith?.length && !t.parentId)
        .sort((a, b) => (a.due?.date || "9999").localeCompare(b.due?.date || "9999") || b.priority - a.priority),
    [data]
  );

  if (isLoading || !data) return null;
  const partner = data.partner;
  // Someone shared with you before you connected them: offer them as your partner.
  const sharer: Partner | undefined = tasks.find((t) => t.sharedBy && t.sharedBy.uid !== data.me)?.sharedBy;
  const subtaskCount = (id: string) => {
    const subs = data.tasks.filter((t) => t.parentId === id);
    return subs.length ? { done: subs.filter((s) => s.completed).length, total: subs.length } : undefined;
  };
  const projectNameById = Object.fromEntries(data.projects.map((p) => [p.id, p.name]));

  const groups = new Map<string, Task[]>();
  for (const t of tasks) groups.set(groupOf(t), [...(groups.get(groupOf(t)) || []), t]);

  return (
    <div className="content-scroll">
      <div className="page-header">
        <div>
          <h1>Midva</h1>
          <div className="page-subtitle" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ShareIcon width={14} height={14} />
            {partner ? `Shared between you and ${partner.name.split(" ")[0]}` : "Tasks you share with your partner"}
            {tasks.length > 0 && ` · ${tasks.length}`}
          </div>
        </div>
      </div>

      {!partner && <PartnerConnect suggestion={sharer} />}

      {partner && <QuickAdd projectId="inbox" defaultShared />}

      {[...groups.entries()]
        .sort(([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b))
        .map(([label, items]) => (
          <div key={label}>
            <div className="task-section-title">{label}</div>
            {items.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onOpen={setOpenTask}
                projectLabel={projectNameById[t.projectId] && t.projectId !== "inbox" ? projectNameById[t.projectId] : undefined}
                subtaskCount={subtaskCount(t.id)}
              />
            ))}
          </div>
        ))}

      {tasks.length === 0 && partner && (
        <div className="empty-state">
          <ShareIcon width={40} height={40} />
          <p>Nothing shared yet</p>
          <span>
            Add a task here, or switch on <b>Share</b> when adding one anywhere (or type <code>+midva</code>). It shows up
            for {partner.name.split(" ")[0]} right away.
          </span>
        </div>
      )}

      {openTask && <TaskDetail task={openTask} onClose={() => setOpenTask(null)} onOpenTask={setOpenTask} />}
    </div>
  );
}
