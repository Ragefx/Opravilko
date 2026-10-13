import { tr } from "../i18n";
import { useEffect, useRef, useState } from "react";
import type { Project } from "../api/types";
import { useUpdateProject } from "../api/hooks";
import RichTextEditor from "./RichTextEditor";
import { PlusIcon } from "./icons";

/**
 * A project's description, under its name: notes about the whole project,
 * written like a task's (links, lists, bold). Empty, it's just a small
 * "Add a description" until clicked.
 */
export default function ProjectDescription({ project }: { project: Project }) {
  const updateProject = useUpdateProject();
  const saved = project.description ?? "";
  const [html, setHtml] = useState(saved);
  const [editing, setEditing] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Another project, or a change from the other phone.
  useEffect(() => {
    setHtml(saved);
  }, [project.id, saved]);

  // "Add a description" clicked: straight into writing it.
  useEffect(() => {
    if (editing && !saved) box.current?.querySelector<HTMLElement>(".rich-text-body")?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  function save() {
    const next = html === "<br>" ? "" : html;
    if (next !== saved) updateProject.mutate({ id: project.id, description: next || undefined });
    setEditing(false);
  }

  if (!saved && !editing) {
    return (
      <div className="project-description">
        <button className="project-description-add" onClick={() => setEditing(true)}>
          <PlusIcon width={13} height={13} /> {tr("Add a description", "Dodaj opis")}
        </button>
      </div>
    );
  }
  return (
    <div ref={box} className={`project-description ${editing ? "is-editing" : ""}`} onFocus={() => setEditing(true)}>
      <RichTextEditor html={html} onChange={setHtml} onBlur={save} placeholder={tr("What this project is about…", "O čem je ta projekt …")} />
    </div>
  );
}
