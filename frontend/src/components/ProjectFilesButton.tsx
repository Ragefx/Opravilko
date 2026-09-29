import { useState } from "react";
import { createPortal } from "react-dom";
import type { Project } from "../api/types";
import { usingFirebase } from "../data/store";
import { ProjectFiles } from "./TaskAttachments";
import { PaperclipIcon, XIcon } from "./icons";

/** The Files button in a project's header, and the window with the project's own files. */
export default function ProjectFilesButton({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  if (!usingFirebase()) return null;
  const count = project.attachments?.length ?? 0;
  return (
    <>
      <button
        className="display-icon-btn project-files-btn"
        onClick={() => setOpen(true)}
        aria-label={count ? `Files (${count})` : "Files"}
        title="Files"
      >
        <PaperclipIcon width={18} height={18} />
        {count > 0 && <span className="project-files-count">{count}</span>}
      </button>
      {open &&
        createPortal(
          <div className="modal-backdrop" onClick={() => setOpen(false)}>
            <div
              className="modal project-files-modal"
              role="dialog"
              aria-label={`${project.name}: files`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="settings-head">
                <h3>{project.name}</h3>
                <button className="sidebar-icon-btn" onClick={() => setOpen(false)} aria-label="Close">
                  <XIcon width={18} height={18} />
                </button>
              </div>
              <ProjectFiles project={project} />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
