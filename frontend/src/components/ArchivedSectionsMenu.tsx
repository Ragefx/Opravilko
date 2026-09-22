import type { Section } from "../api/types";
import { useUpdateSection } from "../api/hooks";
import { ArchiveIcon } from "./icons";

export default function ArchivedSectionsMenu({
  sections,
  taskCountBySection,
  onClose,
}: {
  sections: Section[];
  taskCountBySection: Record<string, number>;
  onClose: () => void;
}) {
  const updateSection = useUpdateSection();

  return (
    <>
      <div className="dropdown-backdrop" onClick={onClose} />
      <div className="dropdown-panel display-menu" style={{ minWidth: 240 }}>
        <div className="display-menu-title">Archived sections</div>
        {sections.length === 0 ? (
          <div style={{ padding: "8px 4px", fontSize: 13, color: "var(--color-text-secondary)" }}>
            Nothing archived.
          </div>
        ) : (
          sections.map((s) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "6px 4px",
                fontSize: 13,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                <ArchiveIcon width={14} height={14} style={{ flexShrink: 0, color: "var(--color-text-secondary)" }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.name}
                </span>
                <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>
                  {taskCountBySection[s.id] || 0}
                </span>
              </span>
              <button
                className="btn-text"
                style={{ fontSize: 12, flexShrink: 0 }}
                onClick={() => updateSection.mutate({ id: s.id, archived: false })}
              >
                Unarchive
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}
