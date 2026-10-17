import { trn } from "../i18n";
import type { Task } from "../api/types";
import { CommentIcon, PaperclipIcon } from "./icons";

/** How many files and comments a task has: a clip and a bubble with their numbers. */
export default function TaskCounts({ task }: { task: Task }) {
  const files = task.attachments?.length ?? 0;
  const comments = task.comments?.length ?? 0;
  return (
    <>
      {files > 0 && (
        <span className="chip" title={trn(files, ["# attachment", "# attachments"], ["# priponka", "# priponki", "# priponke", "# priponk"])}>
          <PaperclipIcon width={12} height={12} style={{ verticalAlign: "-2px" }} /> {files}
        </span>
      )}
      {comments > 0 && (
        <span className="chip" title={trn(comments, ["# comment", "# comments"], ["# komentar", "# komentarja", "# komentarji", "# komentarjev"])}>
          <CommentIcon width={12} height={12} style={{ verticalAlign: "-2px" }} /> {comments}
        </span>
      )}
    </>
  );
}

/** Whether a task has any files or comments to show. */
export function hasCounts(task: Task): boolean {
  return Boolean(task.attachments?.length || task.comments?.length);
}
