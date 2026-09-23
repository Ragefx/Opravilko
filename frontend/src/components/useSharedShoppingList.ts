import { useEffect, useRef } from "react";
import { useBootstrap, useDeleteProject, useUpdateProject, useUpdateTask } from "../api/hooks";
import { activeSession } from "../data/store";
import { shoppingListOf } from "../utils/shopping";

/**
 * The shopping list is shared with your partner (Midva) by default: yours is
 * shared with them as soon as there's a partner. If you each made one, the
 * two end up as one as soon as one is shared -- the one both phones pick keeps going, and the owner of
 * the other moves its items and meals over and removes it.
 */
export function useSharedShoppingList(): void {
  const { data } = useBootstrap();
  const updateTask = useUpdateTask();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const done = useRef(new Set<string>());

  useEffect(() => {
    const session = activeSession();
    const me = data?.me;
    const partner = data?.partner;
    if (!data || !session || !me) return;
    const list = shoppingListOf(data.projects);
    if (!list) return;

    // Share mine with the partner.
    const shareKey = `share:${list.id}:${partner?.uid}`;
    if (partner && list.ownerId === me && !list.members?.includes(partner.uid) && !done.current.has(shareKey)) {
      done.current.add(shareKey);
      void session.shareProject(list.id, partner.email).catch((err) => {
        done.current.delete(shareKey);
        console.warn("Couldn't share the shopping list", err);
      });
      return;
    }

    // Fold my other shopping lists into the one in use, once it's shared.
    if ((list.members?.length ?? 0) < 2) return;
    for (const other of data.projects) {
      if (other.id === list.id || other.viewStyle !== "shopping" || other.isInboxProject || other.ownerId !== me) continue;
      const mergeKey = `merge:${other.id}`;
      if (done.current.has(mergeKey)) continue;
      done.current.add(mergeKey);
      const into = list;
      void (async () => {
        // One after another: the items must be over before the old list goes.
        for (const t of data.tasks) {
          if (t.projectId === other.id) await updateTask.mutateAsync({ id: t.id, projectId: into.id, sectionId: null });
        }
        const have = new Set((into.meals ?? []).map((m) => m.name.toLocaleLowerCase("sl")));
        const extra = (other.meals ?? []).filter((m) => !have.has(m.name.toLocaleLowerCase("sl")));
        if (extra.length) {
          await updateProject.mutateAsync({ id: into.id, meals: JSON.parse(JSON.stringify([...(into.meals ?? []), ...extra])) });
        }
        await deleteProject.mutateAsync(other.id);
      })().catch((err) => console.warn("Couldn't merge the shopping lists", err));
    }
  }, [data, updateTask, updateProject, deleteProject]);
}
