import { useState } from "react";
import { createPortal } from "react-dom";
import { nanoid } from "nanoid";
import type { Project, TaskTemplate } from "../api/types";
import { useBootstrap, useCreateTask, useSaveTemplates } from "../api/hooks";
import { parseQuickAddInput } from "../utils/quickAddParse";
import { useToast } from "./ToastProvider";
import { XIcon } from "./icons";

interface Line {
  text: string;
  sub: boolean;
}

/** A template's lines: "-" (or an indent) makes a line a sub-task of the one above. */
function linesOf(text: string): Line[] {
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const sub = /^\s+\S/.test(l) || /^\s*[-•*]\s/.test(l);
      return { text: l.replace(/^\s*[-•*]?\s*/, "").trim(), sub };
    })
    .filter((l) => l.text);
}

/** A project's open tasks written as a template (sub-tasks with "- "). */
export function projectAsText(projectId: string, tasks: { id: string; content: string; parentId: string | null; projectId: string; completed: boolean; order: number }[]): string {
  const open = tasks.filter((t) => t.projectId === projectId && !t.completed).sort((a, b) => a.order - b.order);
  const top = open.filter((t) => !t.parentId);
  return top
    .flatMap((t) => [t.content, ...open.filter((s) => s.parentId === t.id).map((s) => `- ${s.content}`)])
    .join("\n");
}

/**
 * Reusable checklists: pick one to add its tasks to this project, or make,
 * edit and delete them. Lines are read like quick add, so a template can say
 * "Rezerviraj hotel jutri p1" and the date is worked out when it's used.
 */
export default function TemplatesModal({
  project,
  startWith,
  onClose,
}: {
  project: Project;
  /** Open straight to a new template with this text (from "Save as template"). */
  startWith?: { name: string; text: string };
  onClose: () => void;
}) {
  const { data } = useBootstrap();
  const saveTemplates = useSaveTemplates();
  const createTask = useCreateTask();
  const showToast = useToast();
  const templates = data?.templates ?? [];
  const [editing, setEditing] = useState<TaskTemplate | null>(
    startWith ? { id: "", name: startWith.name, text: startWith.text } : null
  );
  const [busy, setBusy] = useState(false);

  function save() {
    if (!editing || !editing.text.trim()) return;
    const t: TaskTemplate = { id: editing.id || nanoid(), name: editing.name.trim() || "Template", text: editing.text };
    const exists = templates.some((x) => x.id === t.id);
    saveTemplates.mutate(exists ? templates.map((x) => (x.id === t.id ? t : x)) : [...templates, t]);
    setEditing(null);
    if (startWith && !exists) showToast({ message: `Saved “${t.name}” as a template` });
  }

  function remove(t: TaskTemplate) {
    saveTemplates.mutate(templates.filter((x) => x.id !== t.id));
    showToast({
      message: `Deleted “${t.name}”`,
      actionLabel: "Undo",
      onAction: () => saveTemplates.mutate([...(data?.templates ?? []).filter((x) => x.id !== t.id), t]),
    });
  }

  async function use(t: TaskTemplate) {
    setBusy(true);
    let parent: string | null = null;
    let count = 0;
    for (const line of linesOf(t.text)) {
      const parsed = parseQuickAddInput(line.text);
      if (!parsed.content) continue;
      const task = await createTask.mutateAsync({
        content: parsed.content,
        projectId: project.id,
        parentId: line.sub ? parent : null,
        priority: parsed.priority,
        due: parsed.due,
        labels: parsed.labels,
      });
      if (!line.sub) parent = task.id;
      count++;
    }
    setBusy(false);
    onClose();
    showToast({ message: `Added ${count} task${count === 1 ? "" : "s"} from “${t.name}” to ${project.name}` });
  }

  return createPortal(
    <div
      className="modal-backdrop"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="modal templates-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Templates">
        <div className="settings-head">
          <h3>{editing ? (editing.id ? "Edit template" : "New template") : "Templates"}</h3>
          <button className="sidebar-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon width={18} height={18} />
          </button>
        </div>

        {editing ? (
          <div className="meal-new">
            <input
              placeholder="Name, e.g. Pakiranje za potovanje"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              autoFocus
            />
            <textarea
              rows={10}
              placeholder={"One task per line:\nPotni list\nPolnilec\n- za telefon\n- za uro\nRezerviraj parkirišče jutri"}
              value={editing.text}
              onChange={(e) => setEditing({ ...editing, text: e.target.value })}
            />
            <p className="settings-note">
              A line starting with “-” is a sub-task of the line above. Dates and priorities work as in Add task
              (“jutri”, “v petek”, “p1”) and are worked out when the template is used.
            </p>
            <div className="modal-actions">
              <button className="btn btn-text" onClick={() => (startWith && !editing.id ? onClose() : setEditing(null))}>
                {startWith && !editing.id ? "Cancel" : "Back"}
              </button>
              <button className="btn btn-primary" onClick={save} disabled={!editing.text.trim()}>
                Save template
              </button>
            </div>
          </div>
        ) : (
          <>
            {templates.length === 0 ? (
              <p className="settings-note top">
                No templates yet. Make one here, or use “Save as template” in a project's ⋯ menu to turn its tasks into
                one.
              </p>
            ) : (
              <ul className="template-list">
                {templates.map((t) => {
                  const n = linesOf(t.text).length;
                  return (
                    <li key={t.id}>
                      <div className="template-info">
                        <b>{t.name}</b>
                        <span>
                          {n} task{n === 1 ? "" : "s"}
                        </span>
                      </div>
                      <button className="btn btn-text" onClick={() => setEditing(t)}>
                        Edit
                      </button>
                      <button className="btn btn-text meal-danger" onClick={() => remove(t)}>
                        Delete
                      </button>
                      <button className="btn btn-primary" disabled={busy} onClick={() => void use(t)}>
                        Add to {project.name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <button className="btn btn-secondary meal-new-btn" onClick={() => setEditing({ id: "", name: "", text: "" })}>
              + New template
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
