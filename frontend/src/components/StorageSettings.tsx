import { useEffect, useMemo, useState } from "react";
import { useBootstrap, useRemoveAttachment } from "../api/hooks";
import { activeSession } from "../data/store";
import { ATTACHMENT_BUDGET, WARN_AT, formatSize, loadAttachment, watchStorageUsed } from "../firebase/attachments";
import type { Attachment, Task } from "../api/types";
import { FileIcon, TrashIcon } from "./icons";
import { useToast } from "./ToastProvider";

/** The free Firebase database size, shared by tasks and attachments. */
const DATABASE_SIZE = 1024 * 1024 * 1024;

/**
 * Settings → Storage: how much of the free space is used, and the
 * attachments taking the most of it (or sitting on finished tasks), so
 * space can be freed.
 */
export default function StorageSettings() {
  const { data } = useBootstrap();
  const removeAttachment = useRemoveAttachment();
  const showToast = useToast();
  const [used, setUsed] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(true);

  useEffect(() => watchStorageUsed(setUsed), []);
  // Attachments on long-finished tasks count too, so load those tasks.
  useEffect(() => {
    void activeSession()
      ?.loadArchived()
      .finally(() => setLoadingOlder(false));
  }, []);

  const attachments = useMemo(() => {
    const list: { att: Attachment; task: Task }[] = [];
    for (const task of data?.tasks || []) for (const att of task.attachments || []) list.push({ att, task });
    return list.sort((a, b) => b.att.size - a.att.size);
  }, [data]);

  // Rough size of everything else (tasks, projects, ...), as Firestore stores it.
  const otherBytes = useMemo(() => {
    if (!data) return 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { calendarEvents: _e, ...rest } = data;
    return Math.round(new Blob([JSON.stringify(rest)]).size * 1.5);
  }, [data]);

  const share = Math.min(1, used / ATTACHMENT_BUDGET);
  const level = share >= 1 ? "full" : share >= WARN_AT ? "warn" : "ok";

  return (
    <>
      <h4>Storage</h4>
      <div className="storage-meter" aria-label="Attachment storage used">
        <div className="storage-meter-row">
          <b>Attachments</b>
          <span>
            {formatSize(used)} of {formatSize(ATTACHMENT_BUDGET)} · {formatSize(Math.max(0, ATTACHMENT_BUDGET - used))} free
          </span>
        </div>
        <div className={`storage-bar ${level}`}>
          <i style={{ width: `${Math.max(share * 100, used > 0 ? 1 : 0)}%` }} />
        </div>
        <p className="settings-note top">
          {level === "full"
            ? "Attachments are full: new files can't be added until you remove some below. Tasks keep working as normal."
            : level === "warn"
              ? "Attachments are almost full. Removing big or old files below frees space."
              : "Shared by both of you. Photos are shrunk before upload, so they take little space."}{" "}
          Tasks and everything else take about {formatSize(otherBytes)} of the free {formatSize(DATABASE_SIZE)} database; the
          rest is kept free so tasks can always be saved.
        </p>
      </div>

      <h4>Attachments, biggest first</h4>
      {attachments.length === 0 && (
        <p className="settings-note top">{loadingOlder ? "Loading…" : "No attachments yet."}</p>
      )}
      <div className="storage-list">
        {attachments.map(({ att, task }) => (
          <div key={att.id} className="storage-item">
            {att.thumb ? <img src={att.thumb} alt="" /> : <FileIcon width={18} height={18} />}
            <span className="storage-item-text">
              <button
                className="attachment-name"
                onClick={async () => {
                  const url = URL.createObjectURL(await loadAttachment(att));
                  window.open(url, "_blank", "noopener");
                  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
                }}
              >
                {att.name}
              </button>
              <span>
                on “{task.content}”{task.completed ? " · completed" : ""}
              </span>
            </span>
            <span className="attachment-size">{formatSize(att.size)}</span>
            <button
              className="attachment-remove inline"
              aria-label={`Delete ${att.name}`}
              onClick={() => {
                removeAttachment.mutate({ taskId: task.id, attachmentId: att.id });
                showToast({ message: `Deleted “${att.name}”. The space is freed in a few seconds.` });
              }}
            >
              <TrashIcon width={14} height={14} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
