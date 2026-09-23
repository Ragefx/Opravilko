import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useImportProject } from "../api/hooks";
import { parseTodoistCsv, type ImportPreview } from "../utils/todoistImport";
import { COLOR_NAMES, colorHex } from "../utils/colors";
import { useToast } from "./ToastProvider";

/** Imports a Todoist project CSV export as a new project. */
export default function ImportModal({ onClose, embedded = false }: { onClose: () => void; embedded?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const importProject = useImportProject();
  const navigate = useNavigate();
  const showToast = useToast();

  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [projectName, setProjectName] = useState("");
  const [color, setColor] = useState("grape");
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    try {
      const text = await file.text();
      const parsed = parseTodoistCsv(text);
      if (parsed.tasks.length === 0 && parsed.sections.length === 0) {
        setError("No tasks or sections found in that file.");
        setPreview(null);
        return;
      }
      setPreview(parsed);
      // Todoist names the export after the project, e.g. "Work.csv".
      setProjectName(file.name.replace(/\.csv$/i, ""));
    } catch (err: any) {
      setError(err?.message || "Couldn't read that file.");
      setPreview(null);
    }
  }

  function runImport() {
    if (!preview || !projectName.trim()) return;
    importProject.mutate(
      {
        projectName: projectName.trim(),
        color,
        sections: preview.sections,
        tasks: preview.tasks,
      },
      {
        onSuccess: (project) => {
          showToast({
            message: `Imported ${preview.tasks.length} ${preview.tasks.length === 1 ? "task" : "tasks"} into “${project.name}”`,
          });
          navigate(`/app/project/${project.id}`);
          onClose();
        },
      }
    );
  }

  return (
    // Embedded: shown inside Settings, without its own dialog frame, title or close button.
    <Frame embedded={embedded} onClose={onClose}>
        {!embedded && <h3>Import from Todoist</h3>}

        {!preview && (
          <>
            <p className="import-help">
              In Todoist, open a project → ⋯ → <strong>Manage data</strong> → <strong>Export as CSV</strong>, then pick
              that file here. Tasks, sub-tasks, sections, priorities and due dates come across.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => fileRef.current?.click()}>
              Choose CSV file
            </button>
          </>
        )}

        {error && <div className="login-error" style={{ marginTop: 10 }}>{error}</div>}

        {preview && (
          <>
            <div className="import-summary">
              <div>
                <strong>{preview.tasks.length}</strong> tasks
              </div>
              <div>
                <strong>{preview.sections.length}</strong> sections
              </div>
              <div>
                <strong>{preview.tasks.filter((t) => t.indent > 1).length}</strong> sub-tasks
              </div>
              <div>
                <strong>{preview.tasks.filter((t) => t.due).length}</strong> with dates
              </div>
            </div>
            {preview.skipped > 0 && (
              <p className="import-help">
                {preview.skipped} row{preview.skipped === 1 ? "" : "s"} skipped (comments and attachments aren't
                imported).
              </p>
            )}

            <label className="import-field">
              Project name
              <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            </label>

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

            <div className="import-preview-list">
              {preview.tasks.slice(0, 6).map((t, i) => (
                <div key={i} className="import-preview-row" style={{ paddingLeft: (t.indent - 1) * 16 }}>
                  {t.content}
                </div>
              ))}
              {preview.tasks.length > 6 && (
                <div className="import-preview-row muted">+{preview.tasks.length - 6} more…</div>
              )}
            </div>
          </>
        )}

        <div className="modal-actions">
          {!embedded && (
            <button className="btn btn-text" onClick={onClose}>
              Cancel
            </button>
          )}
          {preview && (
            <button className="btn btn-primary" onClick={runImport} disabled={!projectName.trim()}>
              Import
            </button>
          )}
        </div>
    </Frame>
  );
}

function Frame({ embedded, onClose, children }: { embedded: boolean; onClose: () => void; children: React.ReactNode }) {
  if (embedded) return <div className="settings-embedded">{children}</div>;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
