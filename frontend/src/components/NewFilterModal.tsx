import { useState } from "react";
import { useCreateFilter } from "../api/hooks";
import { COLOR_NAMES, colorHex } from "../utils/colors";

export default function NewFilterModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [color, setColor] = useState("charcoal");
  const createFilter = useCreateFilter();

  function submit() {
    if (!name.trim() || !query.trim()) return;
    createFilter.mutate({ name: name.trim(), query: query.trim(), color }, { onSuccess: onClose });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add filter</h3>
        <input
          type="text"
          placeholder="Filter name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="text"
          placeholder="Query, e.g. p1 today or @work overdue"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
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
          <button className="btn btn-primary" onClick={submit} disabled={!name.trim() || !query.trim()}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
