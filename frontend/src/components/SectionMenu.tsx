import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Project, Section } from "../api/types";
import {
  useDeleteSection,
  useDuplicateSection,
  useMoveSection,
  useRestoreSection,
  useUpdateSection,
} from "../api/hooks";
import { useToast } from "./ToastProvider";
import { ArchiveIcon, ChevronIcon, CopyIcon, EditIcon, MoreIcon, MoveIcon, TrashIcon } from "./icons";

/**
 * The section "⋯" menu (Edit / Move to.../ Duplicate / Archive / Delete),
 * matching Todoist's board column menu. Portalled to <body> with fixed
 * positioning for the same reason RowMenu is: the board column body scrolls,
 * so an absolutely positioned child would get clipped.
 */
export default function SectionMenu({
  section,
  projects,
  onRename,
}: {
  section: Section;
  /** Every other project a section could be moved into. */
  projects: Project[];
  onRename: () => void;
}) {
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const [showMoveTo, setShowMoveTo] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const duplicateSection = useDuplicateSection();
  const deleteSection = useDeleteSection();
  const restoreSection = useRestoreSection();
  const moveSection = useMoveSection();
  const updateSection = useUpdateSection();
  const showToast = useToast();

  function close() {
    setAnchor(null);
    setShowMoveTo(false);
  }

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (anchor) {
      close();
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setAnchor({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }

  function handleDelete() {
    deleteSection.mutate(section.id, {
      onSuccess: (removed) => {
        if (!removed) return;
        showToast({
          message: `"${section.name}" deleted`,
          actionLabel: "Undo",
          onAction: () => restoreSection.mutate(removed),
        });
      },
    });
    close();
  }

  function handleArchive() {
    updateSection.mutate({ id: section.id, archived: true });
    showToast({
      message: `"${section.name}" archived`,
      actionLabel: "Undo",
      onAction: () => updateSection.mutate({ id: section.id, archived: false }),
    });
    close();
  }

  function handleMoveTo(projectId: string) {
    moveSection.mutate({ id: section.id, projectId });
    close();
  }

  return (
    <span className="row-menu">
      <button ref={triggerRef} className="row-menu-trigger" aria-label="Section options" onClick={toggle}>
        <MoreIcon width={18} height={18} />
      </button>
      {anchor &&
        createPortal(
          <>
            <div className="dropdown-backdrop" onClick={(e) => (e.preventDefault(), e.stopPropagation(), close())} />
            <div
              className="dropdown-panel row-menu-panel"
              style={{ top: anchor.top, right: anchor.right }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {showMoveTo ? (
                <>
                  <button
                    className="row-menu-item"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowMoveTo(false);
                    }}
                  >
                    <ChevronIcon width={14} height={14} style={{ transform: "rotate(90deg)" }} />
                    Back
                  </button>
                  {projects.length === 0 ? (
                    <div className="row-menu-item" style={{ opacity: 0.6, cursor: "default" }}>
                      No other projects
                    </div>
                  ) : (
                    projects.map((p) => (
                      <button
                        key={p.id}
                        className="row-menu-item"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleMoveTo(p.id);
                        }}
                      >
                        {p.name}
                      </button>
                    ))
                  )}
                </>
              ) : (
                <>
                  <button
                    className="row-menu-item"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      close();
                      onRename();
                    }}
                  >
                    <EditIcon width={14} height={14} />
                    Edit
                  </button>
                  <button
                    className="row-menu-item"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowMoveTo(true);
                    }}
                  >
                    <MoveIcon width={14} height={14} />
                    Move to…
                  </button>
                  <button
                    className="row-menu-item"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      close();
                      duplicateSection.mutate(section.id);
                    }}
                  >
                    <CopyIcon width={14} height={14} />
                    Duplicate
                  </button>
                  <button
                    className="row-menu-item"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleArchive();
                    }}
                  >
                    <ArchiveIcon width={14} height={14} />
                    Archive
                  </button>
                  <button
                    className="row-menu-item danger"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDelete();
                    }}
                  >
                    <TrashIcon width={14} height={14} />
                    Delete
                  </button>
                </>
              )}
            </div>
          </>,
          document.body
        )}
    </span>
  );
}
