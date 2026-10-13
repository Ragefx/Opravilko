import { tr } from "../i18n";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useBootstrap } from "../api/hooks";
import QuickAdd from "../components/QuickAdd";
import { appUi } from "../utils/appUi";
import type { Partner, Task } from "../api/types";
import TaskRow from "../components/TaskRow";
import TaskDetail from "../components/TaskDetail";
import PartnerConnect from "../components/PartnerConnect";
import { isDueToday, isDueTomorrow, isOverdue } from "../utils/date";
import { ShareIcon } from "../components/icons";

function groupOf(t: Task): string {
  if (!t.due) return tr("No date", "Brez datuma");
  if (isOverdue(t.due)) return tr("Overdue", "Zamujeno");
  if (isDueToday(t.due)) return tr("Today", "Danes");
  if (isDueTomorrow(t.due)) return tr("Tomorrow", "Jutri");
  return tr("Later", "Pozneje");
}
const ORDER = [tr("Overdue", "Zamujeno"), tr("Today", "Danes"), tr("Tomorrow", "Jutri"), tr("Later", "Pozneje"), tr("No date", "Brez datuma")];

/**
 * Midva ("the two of us"): every task shared between you and your partner
 * on its own -- the ones you shared and the ones shared with you -- in one
 * list, by date. New tasks added here are shared automatically.
 */
export default function MidvaView() {
  const { data, isLoading } = useBootstrap();
  const [openTask, setOpenTask] = useState<Task | null>(null);
  // ?open=<task id>: a shared task opened from elsewhere (the Android widget).
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get("open");
  useEffect(() => {
    if (!openId || !data) return;
    const t = data.tasks.find((x) => x.id === openId);
    if (t) setOpenTask(t);
    setSearchParams({}, { replace: true });
  }, [openId, data, setSearchParams]);

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
          <h1>{tr("Midva", "Midva")}</h1>
          <div className="page-subtitle" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ShareIcon width={14} height={14} />
            {partner
              ? tr(`Shared between you and ${partner.name.split(" ")[0]}`, `Deljeno med tabo in ${partner.name.split(" ")[0]}`)
              : tr("Tasks you share with your partner", "Naloge, ki jih deliš s partnerjem")}
            {tasks.length > 0 && ` · ${tasks.length}`}
          </div>
        </div>
      </div>

      {!partner && <PartnerConnect suggestion={sharer} />}

      {/* The website only: the app adds with the + at the bottom (shared on this page). */}
      {partner && !appUi && <QuickAdd projectId="inbox" defaultShared />}

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
          <p>{tr("Nothing shared yet", "Še nič deljenega")}</p>
          <span>
            {tr("Add a task here, or switch on", "Dodaj nalogo tukaj ali vklopi")} <b>{tr("Share", "Deli")}</b>{" "}
            {tr("when adding one anywhere (or type", "pri dodajanju kjer koli (ali napiši")} <code>+midva</code>
            {tr(`). It shows up for ${partner.name.split(" ")[0]} right away.`, `). Takoj se pokaže tudi ${partner.name.split(" ")[0]}.`)}
          </span>
        </div>
      )}

      {openTask && <TaskDetail task={openTask} onClose={() => setOpenTask(null)} onOpenTask={setOpenTask} />}
    </div>
  );
}
