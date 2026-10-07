import { tr } from "../i18n";
import { tripIcon } from "../utils/away";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { Project } from "../api/types";
import { useBootstrap, useDeleteProject, useRestoreProject } from "../api/hooks";
import TemplatesModal, { projectAsText } from "./TemplatesModal";
import { activeSession, usingFirebase } from "../data/store";
import EntityModal from "./EntityModal";
import ShareModal from "./ShareModal";
import RowMenu from "./RowMenu";
import { useToast } from "./ToastProvider";
import { CalendarIcon, CopyIcon, EditIcon, ListViewIcon, PlusIcon, ShareIcon, TrashIcon } from "./icons";
import AwaySheet from "./AwaySheet";

/**
 * A project's "⋯" menu: edit, add a sub-project, share, delete (or leave, for
 * someone else's shared project). Used in the sidebar and in the project's
 * own header.
 */
export default function ProjectMenu({
  project: p,
  templatesOnly = false,
}: {
  project: Project;
  templatesOnly?: boolean;
  /** The shopping list: only sharing (or leaving someone else's). */
}) {
  const navigate = useNavigate();
  const showToast = useToast();
  const deleteProject = useDeleteProject();
  const restoreProject = useRestoreProject();
  const [modal, setModal] = useState<"edit" | "sub" | null>(null);
  const [sharing, setSharing] = useState(false);
  const [tripOpen, setTripOpen] = useState(false);
  const [templates, setTemplates] = useState<null | { startWith?: { name: string; text: string } }>(null);
  const { data } = useBootstrap();

  const templateItems = [
    {
      label: tr("Add from template…", "Dodaj iz predloge …"),
      icon: <ListViewIcon width={14} height={14} />,
      onClick: () => setTemplates({}),
    },
    {
      label: tr("Save as template…", "Shrani kot predlogo …"),
      icon: <CopyIcon width={14} height={14} />,
      onClick: () => setTemplates({ startWith: { name: p.name, text: projectAsText(p.id, data?.tasks ?? []) } }),
    },
  ];

  function handleDelete() {
    deleteProject.mutate(p.id, {
      onSuccess: (removed) => {
        if (!removed) return;
        navigate("/app");
        showToast({
          message: tr(`Project “${p.name}” deleted`, `Projekt »${p.name}« izbrisan`),
          actionLabel: tr("Undo", "Razveljavi"),
          onAction: () => restoreProject.mutate(removed),
        });
      },
    });
  }

  return (
    <>
      <RowMenu
        label={p.name}
        items={templatesOnly ? templateItems : [
          { label: tr("Edit project", "Uredi projekt"), icon: <EditIcon width={14} height={14} />, onClick: () => setModal("edit") },
          { label: tr("Add sub-project", "Dodaj podprojekt"), icon: <PlusIcon width={14} height={14} />, onClick: () => setModal("sub") },
          ...(p.viewStyle !== "shopping"
            ? [{ label: p.trip ? `${tripIcon(p.trip)} ${tr("Trip dates…", "Datumi potovanja …")}` : tr("✈️ It's a trip…", "✈️ To je potovanje …"), icon: <CalendarIcon width={14} height={14} />, onClick: () => setTripOpen(true) }]
            : []),
          ...(usingFirebase()
            ? [{ label: tr("Share…", "Deli …"), icon: <ShareIcon width={14} height={14} />, onClick: () => setSharing(true) }]
            : []),
          ...templateItems,
          // Only the owner can delete a shared project; others can leave it.
          p.ownerId && p.ownerId !== activeSession()?.userId
            ? {
                label: tr("Leave project", "Zapusti projekt"),
                icon: <TrashIcon width={14} height={14} />,
                danger: true,
                onClick: () => {
                  void activeSession()?.leaveProject(p.id);
                  navigate("/app");
                  showToast({ message: tr(`Left “${p.name}”`, `Zapustil(a) si »${p.name}«`) });
                },
              }
            : {
                label: tr("Delete project", "Izbriši projekt"),
                icon: <TrashIcon width={14} height={14} />,
                danger: true,
                onClick: handleDelete,
              },
        ]}
      />
      {tripOpen && <AwaySheet projectId={p.id} onClose={() => setTripOpen(false)} />}
      {(modal || sharing || templates) &&
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
            {templates && <TemplatesModal project={p} startWith={templates.startWith} onClose={() => setTemplates(null)} />}
          </div>,
          document.body
        )}
    </>
  );
}
