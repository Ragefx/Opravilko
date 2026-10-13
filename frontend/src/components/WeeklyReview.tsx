import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { addDays, differenceInCalendarDays, formatDistanceToNowStrict, nextMonday, parseISO } from "date-fns";
import { tr, format, trn, dateLocale } from "../i18n";
import { useBootstrap, useCompleteTask, useDeleteTask, useRestoreTasks, useUpdateTask } from "../api/hooks";
import type { AppData, Due, Task } from "../api/types";
import { isOverdue } from "../utils/date";
import { weekendOffsetDays } from "../utils/quickDates";
import { useToast } from "./ToastProvider";
import TaskDetail from "./TaskDetail";
import { XIcon } from "./icons";

/** Fired on window to open the weekly review from anywhere. */
export const OPEN_WEEKLY_REVIEW = "opravilko:weekly-review";
const DONE_KEY = "opravilko.reviewDone";

/** "2026-W39": the week a review belongs to. */
function weekKey(d = new Date()): string {
  return format(d, "RRRR-'W'II");
}

export function reviewDoneThisWeek(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === weekKey();
  } catch {
    return false;
  }
}

function markReviewDone(): void {
  try {
    localStorage.setItem(DONE_KEY, weekKey());
  } catch {
    /* ignore */
  }
}

/**
 * What a weekly review goes through: overdue tasks first, then tasks with no
 * date at all (top-level ones; shopping lists left out).
 */
export function reviewTasks(data: AppData): Task[] {
  const shopping = new Set(data.projects.filter((p) => p.viewStyle === "shopping").map((p) => p.id));
  const open = data.tasks.filter((t) => !t.completed && !shopping.has(t.projectId) && t.kind !== "event");
  const overdue = open.filter((t) => isOverdue(t.due)).sort((a, b) => a.due!.date.localeCompare(b.due!.date));
  const undated = open.filter((t) => !t.due && !t.parentId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return [...overdue, ...undated];
}

/** The task on another day: a set time and a repeat rule stay. */
function dueOn(task: Task, day: Date, label: string): Due {
  const date = format(day, "yyyy-MM-dd");
  const due = task.due;
  if (!due) return { date, string: label, isRecurring: false };
  const datetime = due.datetime
    ? addDays(new Date(due.datetime), differenceInCalendarDays(day, parseISO(due.date))).toISOString()
    : undefined;
  return { ...due, date, datetime, string: due.isRecurring ? due.string : label };
}

/**
 * The weekly review: one task at a time -- overdue ones, then ones with no
 * date -- each sorted with one tap: today, tomorrow, the weekend, next week,
 * keep it undated, done, or delete.
 */
export default function WeeklyReview({ onClose }: { onClose: () => void }) {
  const { data } = useBootstrap();
  const updateTask = useUpdateTask();
  const completeTask = useCompleteTask();
  const deleteTask = useDeleteTask();
  const restoreTasks = useRestoreTasks();
  const showToast = useToast();
  // The list is fixed when the review starts, so sorting one doesn't reshuffle the rest.
  const [queue] = useState<string[]>(() => (data ? reviewTasks(data).map((t) => t.id) : []));
  const [index, setIndex] = useState(0);
  const [sorted, setSorted] = useState(0);
  const [opened, setOpened] = useState<Task | null>(null);

  const tasks = useMemo(() => new Map((data?.tasks ?? []).map((t) => [t.id, t])), [data]);
  // Skip ones that were finished or deleted meanwhile.
  let i = index;
  while (i < queue.length && (!tasks.get(queue[i]) || tasks.get(queue[i])!.completed)) i++;
  const task = i < queue.length ? tasks.get(queue[i])! : null;
  const finished = !task;
  useEffect(() => {
    if (finished && queue.length) markReviewDone();
  }, [finished, queue.length]);

  function next() {
    setSorted((n) => n + 1);
    setIndex(i + 1);
  }

  function moveTo(day: Date, label: string) {
    if (!task) return;
    updateTask.mutate({ id: task.id, due: dueOn(task, day, label) });
    next();
  }

  const today = new Date();
  const weekend = addDays(today, weekendOffsetDays());
  const monday = nextMonday(today);
  const project = task ? data?.projects.find((p) => p.id === task.projectId) : undefined;
  const overdue = task ? isOverdue(task.due) : false;

  return createPortal(
    <>
      <div className={`modal-backdrop over-modal ${opened ? "review-under-task" : ""}`} onClick={onClose}>
        <div className="modal review-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={tr("Weekly review", "Tedenski pregled")}>
          <div className="settings-head">
            <h3>{tr("Weekly review", "Tedenski pregled")}</h3>
            <button className="sidebar-icon-btn" onClick={onClose} aria-label={tr("Close", "Zapri")}>
              <XIcon width={18} height={18} />
            </button>
          </div>

          {queue.length === 0 ? (
            <div className="review-done">
              <span aria-hidden="true">🎉</span>
              <b>{tr("Nothing to sort", "Ni česa urejati")}</b>
              <p>{tr("No overdue tasks and none without a date.", "Ni zamujenih nalog in nobene brez datuma.")}</p>
              <button className="btn btn-primary" onClick={onClose}>
                {tr("Close", "Zapri")}
              </button>
            </div>
          ) : finished ? (
            <div className="review-done">
              <span aria-hidden="true">✨</span>
              <b>{tr("All sorted", "Vse urejeno")}</b>
              <p>
                {trn(sorted, ["# task gone through.", "# tasks gone through."], ["Pregledana # naloga.", "Pregledani # nalogi.", "Pregledane # naloge.", "Pregledanih # nalog."])}{" "}
                {tr("See you next week.", "Se vidiva naslednji teden.")}
              </p>
              <button className="btn btn-primary" onClick={onClose}>
                {tr("Done", "Končano")}
              </button>
            </div>
          ) : (
            <>
              <div className="review-progress" aria-label={`${i + 1} of ${queue.length}`}>
                <span style={{ width: `${(i / queue.length) * 100}%` }} />
              </div>
              <div className="review-count">
                {tr(`${i + 1} of ${queue.length}`, `${i + 1} od ${queue.length}`)} · {overdue ? tr("overdue", "zamujeno") : tr("no date", "brez datuma")}
              </div>
              <button className="review-card" onClick={() => setOpened(task)}>
                <b>{task.content}</b>
                <span>
                  {project?.isInboxProject || task.projectId === "inbox" ? tr("Inbox", "Prejeto") : `# ${project?.name ?? tr("Project", "Projekt")}`}
                  {overdue && task.due
                    ? tr(` · was due ${format(parseISO(task.due.date), "d MMM")}`, ` · rok je bil ${format(parseISO(task.due.date), "d. MMM")}`)
                    : tr(" · added ", " · dodano ") + formatDistanceToNowStrict(new Date(task.createdAt), { addSuffix: true, locale: dateLocale })}
                </span>
              </button>
              <div className="review-grid">
                <button onClick={() => moveTo(today, "today")}>
                  <b>{tr("Today", "Danes")}</b>
                  <span>{format(today, "EEE")}</span>
                </button>
                <button onClick={() => moveTo(addDays(today, 1), "tomorrow")}>
                  <b>{tr("Tomorrow", "Jutri")}</b>
                  <span>{format(addDays(today, 1), "EEE")}</span>
                </button>
                <button onClick={() => moveTo(weekend, "this weekend")}>
                  <b>{tr("Weekend", "Vikend")}</b>
                  <span>{format(weekend, tr("EEE d", "EEE d."))}</span>
                </button>
                <button onClick={() => moveTo(monday, "next week")}>
                  <b>{tr("Next week", "Naslednji teden")}</b>
                  <span>{format(monday, tr("EEE d", "EEE d."))}</span>
                </button>
              </div>
              <div className="review-actions">
                <button
                  className="btn btn-text meal-danger"
                  onClick={() =>
                    deleteTask.mutate(task.id, {
                      onSuccess: (removed) => {
                        showToast({ message: tr(`Deleted “${task.content}”`, `Izbrisano: »${task.content}«`), actionLabel: tr("Undo", "Razveljavi"), onAction: () => restoreTasks.mutate(removed) });
                        next();
                      },
                    })
                  }
                >
                  {tr("Delete", "Izbriši")}
                </button>
                <button
                  className="btn btn-text"
                  onClick={() => {
                    completeTask.mutate({ id: task.id, completed: true });
                    next();
                  }}
                >
                  ✓ {tr("Done", "Opravljeno")}
                </button>
                <span style={{ flex: 1 }} />
                <button className="btn btn-secondary" onClick={next}>
                  {overdue ? tr("Leave it", "Pusti") : tr("Keep, no date", "Obdrži brez datuma")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {/* Outside the review window, so the task's date and other pickers open above it */}
      {opened && <TaskDetail task={opened} onClose={() => setOpened(null)} onOpenTask={setOpened} />}
    </>,
    document.body
  );
}

/** For the Now page: whether to offer the review (the weekend, not done yet this week). */
export function reviewDueToday(data: AppData | undefined): number {
  if (!data) return 0;
  const day = new Date().getDay();
  if ((day !== 0 && day !== 6) || reviewDoneThisWeek()) return 0;
  return reviewTasks(data).length;
}
