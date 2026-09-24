import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useBootstrap, useCreateProject } from "../api/hooks";
import ShoppingView from "../components/ShoppingView";
import { shoppingListOf } from "../utils/shopping";

/**
 * The shopping list, from its own "Shopping" entry: always shown as a list of
 * things to buy (no other views). Made the first time it's opened, and
 * shared with your partner by itself (see useSharedShoppingList).
 */
export default function ShoppingPage() {
  const { data } = useBootstrap();
  const createProject = useCreateProject();
  const list = data ? shoppingListOf(data.projects) : undefined;
  const creating = useRef(false);
  // From the widget: ?add=1 focuses the add box, ?voice=1 starts listening.
  const [params, setParams] = useSearchParams();
  const [start, setStart] = useState<{ n: number; mode: "add" | "voice" } | null>(null);
  useEffect(() => {
    const mode = params.get("voice") === "1" ? "voice" : params.get("add") === "1" ? "add" : null;
    if (!mode) return;
    setStart((s) => ({ n: (s?.n ?? 0) + 1, mode }));
    setParams({}, { replace: true });
  }, [params, setParams]);

  useEffect(() => {
    if (!data || list || creating.current) return;
    creating.current = true;
    createProject.mutate({ name: "Shopping list", color: "green", viewStyle: "shopping" });
  }, [data, list, createProject]);

  if (!list) return null;

  const header = (
    <div className="topbar" style={{ padding: "0 0 16px", border: "none" }}>
      <h1>Shopping</h1>
    </div>
  );
  return <ShoppingView key={list.id} projectId={list.id} header={header} start={start} />;
}
