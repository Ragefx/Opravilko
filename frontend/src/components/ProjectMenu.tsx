import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { Project } from "../api/types";
import { useDeleteProject, useRestoreProject } from "../api/hooks";
import { activeSession, usingFirebase } from "../data/store";
import EntityModal from "./EntityModal";
import ShareModal from "./ShareModal";
import RowMenu from "./RowMenu";
import { useToast } from "./ToastProvider";
import { EditIcon, PlusIcon, ShareIcon, TrashIcon } from "./icons";

/**
 * A project's "⋯" menu: edit, add a sub-project, share, delete (or leave, for
 * someone else's shared project). Used in the sidebar and in the project's
 * own header.
 */
export default function ProjectMenu({ project: p }: { project: Project }) {
  const navigate = useNavigate();
  const showToast = useToast();
  const deleteProject = useDeleteProject();
  const restoreProject = useRestoreProject();
  const [modal, setModal] = useState<"edit" | "sub" | null>(null);
  const [sharing, setSharing] = useState(false);

  function handleDelete() {
    deleteProject.mutate(p.id, {
      onSuccess: (removed) => {
        if (!removed) return;
        navigate("/app");
        showToast({
          message: `Project “${p.name}” deleted`,
          actionLabel: "Undo",
          onAction: () => restoreProject.mutate(removed),
        });
      },
    });
  }

  return (
    <>
      <RowMenu
        label={p.name}
        items={[
          { label: "Edit project", icon: <EditIcon width={14} height={14} />, onClick: () => setModal("edit") },
          { label: "Add sub-project", icon: <PlusIcon width={14} height={14} />, onClick: () => setModal("sub") },
          ...(usingFirebase()
            ? [{ label: "Share…", icon: <ShareIcon width={14} height={14} />, onClick: () => setSharing(true) }]
            : []),
          // Only the owner can delete a shared project; others can leave it.
          p.ownerId && p.ownerId !== activeSession()?.userId
            ? {
                label: "Leave project",
                icon: <TrashIcon width={14} height={14} />,
                danger: true,
                onClick: () => {
                  void activeSession()?.leaveProject(p.id);
                  navigate("/app");
                  showToast({ message: `Left “${p.name}”` });
                },
              }
            : {
                label: "Delete project",
                icon: <TrashIcon width={14} height={14} />,
                danger: true,
                onClick: handleDelete,
              },
        ]}
      />
      {(modal || sharing) &&
        // Outside the sidebar's project link, and clicks in here don't reach it.
        createPortal(
          <div onClick={(e) => e.stopPropagation()}>
            {modal === "edit" && (
              <EntityModal
                kind="project"
                existing={{ id: p.id, name: p.name, color: p.color, parentId: p.parentId }}
                onClose={() => setModal(null)}
              />
            )}
            {modal === "sub" && <EntityModal kind="project" defaultParentId={p.id} onClose={() => setModal(null)} />}
            {sharing && <ShareModal project={p} onClose={() => setSharing(false)} />}
          </div>,
          document.body
        )}
    </>
  );
}
