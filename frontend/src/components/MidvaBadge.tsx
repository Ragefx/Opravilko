import type { Task } from "../api/types";
import { useBootstrap } from "../api/hooks";
import { ShareIcon } from "./icons";
import { useHidden } from "../utils/simple";

/** "Midva · from Luka" / "Midva · Ana" on a task shared outside a shared project. */
export default function MidvaBadge({ task }: { task: Task }) {
  const { data } = useBootstrap();
  // Simple (Settings): just "Midva".
  const plain = useHidden("midvaFrom");
  const fromOther = task.sharedBy && task.sharedBy.uid !== data?.me;
  const who = fromOther ? `from ${task.sharedBy!.name.split(" ")[0]}` : data?.partner?.name.split(" ")[0];
  return (
    <span className="chip midva-badge" title="Shared (Midva)">
      <ShareIcon width={12} height={12} style={{ verticalAlign: "-2px" }} /> Midva{who && !plain ? ` · ${who}` : ""}
    </span>
  );
}
