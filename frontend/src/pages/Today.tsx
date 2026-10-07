import { useState } from "react";
import { tr, format, trn, cap } from "../i18n";
import { useBootstrap } from "../api/hooks";
import TaskListView from "../components/TaskListView";
import DateBoardView from "../components/DateBoardView";
import type { DateBoardColumn } from "../components/DateBoardView";
import RescheduleButton from "../components/RescheduleButton";
import { isDueToday, isOverdue, todayISO } from "../utils/date";
import { groupEventsByDate } from "../utils/calendarSync";
import { CheckCircleIcon, ListViewIcon, BoardViewIcon } from "../components/icons";
import { getStoredLayout, setStoredLayout, type ViewLayout } from "../utils/viewLayout";

export default function Today() {
  const { data, isLoading } = useBootstrap();
  const [layout, setLayoutState] = useState<ViewLayout>(() => getStoredLayout("today") || "list");
  if (isLoading || !data) return null;

  function setLayout(next: ViewLayout) {
    setLayoutState(next);
    setStoredLayout("today", next);
  }

  const tasks = data.tasks
    .filter((t) => !t.completed && (isDueToday(t.due) || isOverdue(t.due)))
    .sort((a, b) => (a.due?.date || "").localeCompare(b.due?.date || ""));
  const projectNameById = Object.fromEntries(data.projects.map((p) => [p.id, p.name]));
  const eventsByDate = groupEventsByDate(data.calendarEvents, data.calendarFeeds);

  const header = (
    <div className="topbar" style={{ padding: "0 0 16px", border: "none" }}>
      <div>
        <h1>{tr("Today", "Danes")}</h1>
        <div className="page-subtitle" style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {layout === "board" ? (
            <>
              <CheckCircleIcon width={14} height={14} />
              {trn(tasks.length, ["# task", "# tasks"], ["# naloga", "# nalogi", "# naloge", "# nalog"])}
            </>
          ) : (
            `${cap(format(new Date(), tr("EEEE d MMMM", "EEEE, d. MMMM")))} · ${trn(tasks.length, ["# task", "# tasks"], ["# naloga", "# nalogi", "# naloge", "# nalog"])}`
          )}
        </div>
      </div>
      <div className="view-toggle">
        <button className={layout === "list" ? "active" : ""} onClick={() => setLayout("list")}>
          <ListViewIcon width={14} height={14} /> {tr("List", "Seznam")}
        </button>
        <button className={layout === "board" ? "active" : ""} onClick={() => setLayout("board")}>
          <BoardViewIcon width={14} height={14} /> {tr("Board", "Tabla")}
        </button>
      </div>
    </div>
  );

  if (layout === "board") {
    const overdueTasks = tasks.filter((t) => isOverdue(t.due));
    const todayTasks = tasks.filter((t) => isDueToday(t.due));
    const columns: DateBoardColumn[] = [];
    if (overdueTasks.length > 0) {
      columns.push({
        key: "overdue",
        label: tr("Overdue", "Zamujeno"),
        tasks: overdueTasks,
        extra: <RescheduleButton tasks={overdueTasks} />,
      });
    }
    columns.push({
      key: "today",
      label: `${format(new Date(), tr("d MMM", "d. MMM"))} · ${tr("Today", "Danes")}`,
      tasks: todayTasks,
      quickAdd: { projectId: "inbox", due: { date: todayISO(), string: "today" } },
    });

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <div className="page-header-pad">{header}</div>
        <DateBoardView columns={columns} projectNameById={projectNameById} />
      </div>
    );
  }

  return (
    <TaskListView
      header={header}
      title={tr("Today", "Danes")}
      tasks={tasks}
      quickAddProjectId="inbox"
      quickAddDue={{ date: todayISO(), string: "today" }}
      groupLabel={(t) => (isOverdue(t.due) ? tr("Overdue", "Zamujeno") : tr("Today", "Danes"))}
      showProjectChip
      projectNameById={projectNameById}
      groupExtra={(label, items) => (label === tr("Overdue", "Zamujeno") && items.length > 0 ? <RescheduleButton tasks={items} /> : undefined)}
      eventsByDate={eventsByDate}
      dateGroups={[
        { label: tr("Overdue", "Zamujeno"), date: null },
        { label: tr("Today", "Danes"), date: todayISO() },
      ]}
    />
  );
}
