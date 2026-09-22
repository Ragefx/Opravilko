import { useState } from "react";
import {
  useBootstrap,
  useCreateFilter,
  useCreateLabel,
  useCreateProject,
  useUpdateFilter,
  useUpdateLabel,
  useUpdateProject,
} from "../api/hooks";
import { COLOR_NAMES, colorHex } from "../utils/colors";

export type EntityKind = "project" | "label" | "filter";

export interface EditableEntity {
  id: string;
  name: string;
  color: string;
  query?: string;
  parentId?: string | null;
}

const TITLES: Record<EntityKind, { create: string; edit: string; placeholder: string }> = {
  project: { create: "Add project", edit: "Edit project", placeholder: "Project name" },
  label: { create: "Add label", edit: "Edit label", placeholder: "Label name" },
  filter: { create: "Add filter", edit: "Edit filter", placeholder: "Filter name" },
};

/** Create/edit dialog shared by projects, labels, and filters. */
export default function EntityModal({
  kind,
  existing,
  defaultParentId,
  onClose,
}: {
  kind: EntityKind;
  existing?: EditableEntity;
  /** Pre-selects a parent when adding a sub-project. */
  defaultParentId?: string;
  onClose: () => void;
}) {
  const { data } = useBootstrap();
  const [name, setName] = useState(existing?.name ?? "");
  const [query, setQuery] = useState(existing?.query ?? "");
  const [color, setColor] = useState(existing?.color ?? "charcoal");
  const [parentId, setParentId] = useState<string | null>(existing?.parentId ?? defaultParentId ?? null);

  // A project can't be nested under itself or anything already beneath it.
  const excluded = new Set<string>();
  if (existing) {
    excluded.add(existing.id);
    let grew = true;
    while (grew) {
      grew = false;
      for (const p of data?.projects || []) {
        if (p.parentId && excluded.has(p.parentId) && !excluded.has(p.id)) {
          excluded.add(p.id);
          grew = true;
        }
      }
    }
  }
  const parentOptions = (data?.projects || [])
    .filter((p) => !p.isInboxProject && !excluded.has(p.id))
    .sort((a, b) => a.order - b.order);

  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const createLabel = useCreateLabel();
  const updateLabel = useUpdateLabel();
  const createFilter = useCreateFilter();
  const updateFilter = useUpdateFilter();

  const needsQuery = kind === "filter";
  const canSubmit = Boolean(name.trim()) && (!needsQuery || Boolean(query.trim()));

  function submit() {
    if (!canSubmit) return;
    const trimmed = name.trim();
    const done = { onSuccess: onClose };

    if (kind === "project") {
      if (existing) updateProject.mutate({ id: existing.id, name: trimmed, color, parentId }, done);
      else createProject.mutate({ name: trimmed, color, parentId }, done);
    } else if (kind === "label") {
      if (existing) updateLabel.mutate({ id: existing.id, name: trimmed, color }, done);
      else createLabel.mutate({ name: trimmed, color }, done);
    } else {
      const q = query.trim();
      if (existing) updateFilter.mutate({ id: existing.id, name: trimmed, query: q, color }, done);
      else createFilter.mutate({ name: trimmed, query: q, color }, done);
    }
  }

  const title = existing ? TITLES[kind].edit : defaultParentId ? "Add sub-project" : TITLES[kind].create;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <input
          type="text"
          placeholder={TITLES[kind].placeholder}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !needsQuery) submit();
            if (e.key === "Escape") onClose();
          }}
        />
        {needsQuery && (
          <input
            type="text"
            placeholder="Query, e.g. p1 today or @work overdue"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onClose();
            }}
          />
        )}
        {kind === "project" && parentOptions.length > 0 && (
          <label className="entity-parent-field">
            <span>Parent project</span>
            <select value={parentId ?? ""} onChange={(e) => setParentId(e.target.value || null)}>
              <option value="">No parent</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="color-swatch-grid">
          {COLOR_NAMES.map((c) => (
            <button
              key={c}
              type="button"
              className={`color-swatch ${color === c ? "selected" : ""}`}
              style={{ background: colorHex(c) }}
              onClick={() => setColor(c)}
              aria-label={c}
            />
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn btn-text" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!canSubmit}>
            {existing ? "Save" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
