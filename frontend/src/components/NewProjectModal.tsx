import { useState } from "react";
import { useCreateProject } from "../api/hooks";
import { COLOR_NAMES, colorHex } from "../utils/colors";

export default function NewProjectModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("charcoal");
  const createProject = useCreateProject();

  function submit() {
    if (!name.trim()) return;
    createProject.mutate(
      { name: name.trim(), color },
      { onSuccess: onClose }
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add project</h3>
        <input
          type="text"
          placeholder="Project name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
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
          <button className="btn btn-primary" onClick={submit} disabled={!name.trim()}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
