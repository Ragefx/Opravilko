import { tr, trn } from "../i18n";
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
    const t: TaskTemplate = { id: editing.id || nanoid(), name: editing.name.trim() || tr("Template", "Predloga"), text: editing.text };
    const exists = templates.some((x) => x.id === t.id);
    saveTemplates.mutate(exists ? templates.map((x) => (x.id === t.id ? t : x)) : [...templates, t]);
    setEditing(null);
    if (startWith && !exists) showToast({ message: tr(`Saved “${t.name}” as a template`, `»${t.name}« shranjeno kot predloga`) });
  }

  function remove(t: TaskTemplate) {
    saveTemplates.mutate(templates.filter((x) => x.id !== t.id));
    showToast({
      message: tr(`Deleted “${t.name}”`, `Izbrisano: »${t.name}«`),
      actionLabel: tr("Undo", "Razveljavi"),
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
    showToast({
      message: tr(
        `Added ${count} task${count === 1 ? "" : "s"} from “${t.name}” to ${project.name}`,
        `Iz »${t.name}« dodano v ${project.name}: ${trn(count, ["# task", "# tasks"], ["# naloga", "# nalogi", "# naloge", "# nalog"])}`
      ),
    });
  }

  return createPortal(
    <div
      className="modal-backdrop"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="modal templates-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={tr("Templates", "Predloge")}>
        <div className="settings-head">
          <h3>{editing ? (editing.id ? tr("Edit template", "Uredi predlogo") : tr("New template", "Nova predloga")) : tr("Templates", "Predloge")}</h3>
          <button className="sidebar-icon-btn" onClick={onClose} aria-label={tr("Close", "Zapri")}>
            <XIcon width={18} height={18} />
          </button>
        </div>

        {editing ? (
          <div className="meal-new">
            <input
              placeholder={tr("Name, e.g. Packing for a trip", "Ime, npr. Pakiranje za potovanje")}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              autoFocus
            />
            <textarea
              rows={10}
              placeholder={tr(
                "One task per line:\nPassport\nCharger\n- for the phone\n- for the watch\nBook parking tomorrow",
                "Ena naloga na vrstico:\nPotni list\nPolnilec\n- za telefon\n- za uro\nRezerviraj parkirišče jutri"
              )}
              value={editing.text}
              onChange={(e) => setEditing({ ...editing, text: e.target.value })}
            />
            <p className="settings-note">
              {tr(
                "A line starting with “-” is a sub-task of the line above. Dates and priorities work as in Add task (“tomorrow”, “on Friday”, “p1”) and are worked out when the template is used.",
                "Vrstica, ki se začne z »-«, je podnaloga vrstice nad njo. Datumi in prednosti delujejo kot pri dodajanju naloge (»jutri«, »v petek«, »p1«) in se izračunajo, ko predlogo uporabiš."
              )}
            </p>
            <div className="modal-actions">
              <button className="btn btn-text" onClick={() => (startWith && !editing.id ? onClose() : setEditing(null))}>
                {startWith && !editing.id ? tr("Cancel", "Prekliči") : tr("Back", "Nazaj")}
              </button>
              <button className="btn btn-primary" onClick={save} disabled={!editing.text.trim()}>
                {tr("Save template", "Shrani predlogo")}
              </button>
            </div>
          </div>
        ) : (
          <>
            {templates.length === 0 ? (
              <p className="settings-note top">
                {tr(
                  "No templates yet. Make one here, or use “Save as template” in a project's ⋯ menu to turn its tasks into one.",
                  "Še ni predlog. Naredi jo tukaj ali uporabi »Shrani kot predlogo« v meniju ⋯ projekta, da iz njegovih nalog narediš predlogo."
                )}
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
                          {trn(n, ["# task", "# tasks"], ["# naloga", "# nalogi", "# naloge", "# nalog"])}
                        </span>
                      </div>
                      <button className="btn btn-text" onClick={() => setEditing(t)}>
                        {tr("Edit", "Uredi")}
                      </button>
                      <button className="btn btn-text meal-danger" onClick={() => remove(t)}>
                        {tr("Delete", "Izbriši")}
                      </button>
                      <button className="btn btn-primary" disabled={busy} onClick={() => void use(t)}>
                        {tr(`Add to ${project.name}`, `Dodaj v ${project.name}`)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <button className="btn btn-secondary meal-new-btn" onClick={() => setEditing({ id: "", name: "", text: "" })}>
              + {tr("New template", "Nova predloga")}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
