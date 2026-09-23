import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AppData, Task } from "../api/types";
import { useBootstrap, useCreateTask, useDeleteTask, useUpdateTask } from "../api/hooks";
import {
  BUILTIN_MEALS,
  customMeals,
  formatAmount,
  itemTitle,
  mealFromText,
  parseItem,
  sameItem,
  saveCustomMeals,
  scaled,
  splitItems,
  type Item,
  type Meal,
} from "../utils/shopping";
import { useToast } from "./ToastProvider";
import { CheckIcon, TrashIcon, XIcon } from "./icons";

/** "za: Palačinke, Omleta" in the description says which meals an item is for. */
function mealsOf(t: Task): string[] {
  const m = t.description.match(/^za: (.+)$/m);
  return m ? m[1].split(", ").filter(Boolean) : [];
}
function withMeal(description: string, meal: string | undefined): string {
  if (!meal) return description;
  const current = description.match(/^za: (.+)$/m)?.[1].split(", ") ?? [];
  if (current.includes(meal)) return description;
  return `za: ${[...current, meal].join(", ")}`;
}

/** Keeps the phone screen on while the list is open (in the shop). */
function useWakeLock() {
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };
    if (!nav.wakeLock) return;
    let lock: Sentinel | null = null;
    const request = () => {
      if (document.visibilityState === "visible") nav.wakeLock!.request("screen").then((l) => (lock = l)).catch(() => {});
    };
    request();
    document.addEventListener("visibilitychange", request);
    return () => {
      document.removeEventListener("visibilitychange", request);
      void lock?.release().catch(() => {});
    };
  }, []);
}

/**
 * A project as a shopping list (prototype): one item per line in the order
 * added, tap to tick, ticked ones drop into "In the basket". Items are the
 * project's tasks, so a shared list updates live on both phones.
 */
export default function ShoppingView({ projectId, header }: { projectId: string; header: ReactNode }) {
  const { data } = useBootstrap();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const showToast = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [mealsOpen, setMealsOpen] = useState(false);
  useWakeLock();

  const archivedSections = useMemo(
    () => new Set((data?.sections || []).filter((s) => s.archived).map((s) => s.id)),
    [data?.sections]
  );
  const items = (data?.tasks || []).filter(
    (t) => t.projectId === projectId && !t.parentId && !(t.sectionId && archivedSections.has(t.sectionId))
  );
  const open = items.filter((t) => !t.completed).sort((a, b) => a.order - b.order);
  const ticked = items
    .filter((t) => t.completed)
    .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));

  /**
   * Adds items, adding amounts onto the same thing already on the list
   * ("Jajca 2×" + "Jajca 3×" = "Jajca 5×"). Returns how to undo it.
   */
  async function addItems(list: Item[], meal?: string): Promise<() => void> {
    const created: string[] = [];
    const changed: { id: string; content: string; description: string }[] = [];
    for (const item of list) {
      // The latest list (earlier lines of this same add included).
      const latest = qc.getQueryData<AppData>(["bootstrap"])?.tasks ?? [];
      const existing = latest
        .filter((t) => t.projectId === projectId && !t.completed && !t.parentId)
        .find((t) => sameItem(parseItem(t.content), item));
      if (existing) {
        const have = parseItem(existing.content);
        const next: Item =
          have.amount !== undefined && item.amount !== undefined ? { ...have, amount: have.amount + item.amount } : have;
        changed.push({ id: existing.id, content: existing.content, description: existing.description });
        await updateTask.mutateAsync({
          id: existing.id,
          content: itemTitle(next),
          description: withMeal(existing.description, meal),
        });
      } else {
        const t = await createTask.mutateAsync({
          content: itemTitle(item),
          projectId,
          description: meal ? `za: ${meal}` : "",
        });
        created.push(t.id);
      }
    }
    return () => {
      created.forEach((id) => deleteTask.mutate(id));
      changed.forEach((c) => updateTask.mutate({ id: c.id, content: c.content, description: c.description }));
    };
  }

  async function submit() {
    const parts = splitItems(text);
    if (!parts.length) return;
    setText("");
    await addItems(parts.map(parseItem));
  }

  function toggle(t: Task) {
    updateTask.mutate({
      id: t.id,
      completed: !t.completed,
      completedAt: t.completed ? null : new Date().toISOString(),
    });
  }

  function clearTicked() {
    const gone = ticked.map((t) => ({ content: t.content, description: t.description }));
    ticked.forEach((t) => deleteTask.mutate(t.id));
    showToast({
      message: `Cleared ${gone.length} item${gone.length === 1 ? "" : "s"}`,
      actionLabel: "Undo",
      onAction: async () => {
        for (const g of gone) {
          const t = await createTask.mutateAsync({ ...g, projectId });
          await updateTask.mutateAsync({ id: t.id, completed: true, completedAt: new Date().toISOString() });
        }
      },
    });
  }

  return (
    <div className="content-scroll">
      <div className="shopping">
        {header}
        <div className="shopping-add">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            placeholder="Add: mleko 1 l, 2x jajca, kruh"
            aria-label="Add items"
            enterKeyHint="done"
          />
          <button className="btn btn-primary" onClick={() => void submit()} disabled={!text.trim()}>
            Add
          </button>
          <button className="btn btn-secondary shopping-meal-btn" onClick={() => setMealsOpen(true)}>
            🍳 Meal
          </button>
        </div>

        {open.length === 0 && ticked.length === 0 && (
          <p className="shopping-empty">The list is empty. Add things above, or a whole meal with 🍳.</p>
        )}

        <ul className="shopping-list">
          {open.map((t) => (
            <ShoppingRow key={t.id} task={t} onToggle={() => toggle(t)} onDelete={() => deleteTask.mutate(t.id)} />
          ))}
        </ul>

        {ticked.length > 0 && (
          <>
            <div className="shopping-basket-head">
              <span>In the basket · {ticked.length}</span>
              <button className="btn btn-text" onClick={clearTicked}>
                Clear
              </button>
            </div>
            <ul className="shopping-list is-ticked">
              {ticked.map((t) => (
                <ShoppingRow key={t.id} task={t} onToggle={() => toggle(t)} onDelete={() => deleteTask.mutate(t.id)} />
              ))}
            </ul>
          </>
        )}
      </div>

      {mealsOpen && (
        <MealPicker
          onClose={() => setMealsOpen(false)}
          onAdd={async (meal, servings) => {
            setMealsOpen(false);
            const list = meal.ingredients.map((ing) => scaled(ing, servings));
            const undo = await addItems(list, meal.name);
            showToast({
              message: `Added ${list.length} ingredients for ${meal.name} (${servings})`,
              actionLabel: "Undo",
              onAction: undo,
            });
          }}
        />
      )}
    </div>
  );
}

function ShoppingRow({ task, onToggle, onDelete }: { task: Task; onToggle: () => void; onDelete: () => void }) {
  const item = parseItem(task.content);
  const amount = formatAmount(item.amount, item.unit);
  const meals = mealsOf(task);
  return (
    <li className={`shopping-row ${task.completed ? "is-done" : ""}`}>
      <button className="shopping-row-main" onClick={onToggle} aria-pressed={task.completed}>
        <span className="shopping-check" aria-hidden="true">
          {task.completed && <CheckIcon width={14} height={14} />}
        </span>
        <span className="shopping-name">
          {item.name}
          {meals.length > 0 && <small>{meals.join(" · ")}</small>}
        </span>
        {amount && <span className="shopping-amount">{amount}</span>}
      </button>
      <button className="shopping-delete" onClick={onDelete} aria-label={`Remove ${item.name}`}>
        <XIcon width={14} height={14} />
      </button>
    </li>
  );
}

function MealPicker({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (meal: Meal, servings: number) => void;
}) {
  const [mine, setMine] = useState<Meal[]>(customMeals);
  const [picked, setPicked] = useState<Meal | null>(null);
  const [servings, setServings] = useState(2);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newServings, setNewServings] = useState(2);
  const [newText, setNewText] = useState("");
  const meals = [...mine, ...BUILTIN_MEALS];

  function saveNew() {
    const meal = mealFromText(newName, newText, newServings);
    if (!meal.ingredients.length) return;
    const next = [meal, ...mine];
    setMine(next);
    saveCustomMeals(next);
    setCreating(false);
    setNewName("");
    setNewText("");
    setPicked(meal);
    setServings(newServings);
  }

  function removeMine(id: string) {
    const next = mine.filter((m) => m.id !== id);
    setMine(next);
    saveCustomMeals(next);
    if (picked?.id === id) setPicked(null);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal meal-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add a meal">
        <div className="settings-head">
          <h3>{creating ? "New meal" : picked ? `${picked.emoji} ${picked.name}` : "Add a meal"}</h3>
          <button className="sidebar-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon width={18} height={18} />
          </button>
        </div>

        {creating ? (
          <div className="meal-new">
            <input placeholder="Name, e.g. Mamina juha" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
            <label className="meal-servings-label">
              The recipe is for
              <input
                type="number"
                min={1}
                value={newServings}
                onChange={(e) => setNewServings(Math.max(1, +e.target.value || 1))}
              />
              people
            </label>
            <textarea
              rows={7}
              placeholder={"One ingredient per line:\n250 g moke\n0,5 l mleka\n3 jajca\nsol"}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
            />
            <div className="modal-actions">
              <button className="btn btn-text" onClick={() => setCreating(false)}>
                Back
              </button>
              <button className="btn btn-primary" onClick={saveNew} disabled={!newText.trim()}>
                Save meal
              </button>
            </div>
          </div>
        ) : picked ? (
          <>
            <div className="meal-servings">
              <span>Servings</span>
              <button className="btn btn-secondary" onClick={() => setServings((s) => Math.max(1, s - 1))} aria-label="Fewer">
                −
              </button>
              <b>{servings}</b>
              <button className="btn btn-secondary" onClick={() => setServings((s) => s + 1)} aria-label="More">
                +
              </button>
            </div>
            <ul className="meal-ingredients">
              {picked.ingredients.map((ing, n) => {
                const it = scaled(ing, servings);
                return (
                  <li key={n}>
                    <span>{it.name}</span>
                    <span>{formatAmount(it.amount, it.unit)}</span>
                  </li>
                );
              })}
            </ul>
            <div className="modal-actions">
              <button className="btn btn-text" onClick={() => setPicked(null)}>
                Back
              </button>
              <button className="btn btn-primary" onClick={() => onAdd(picked, servings)}>
                Add to list
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="meal-grid">
              {meals.map((m) => (
                <div key={m.id} className="meal-card-wrap">
                  <button className="meal-card" onClick={() => setPicked(m)}>
                    <span className="meal-emoji">{m.emoji}</span>
                    <span>{m.name}</span>
                  </button>
                  {m.custom && (
                    <button className="meal-remove" onClick={() => removeMine(m.id)} aria-label={`Delete ${m.name}`}>
                      <TrashIcon width={13} height={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button className="btn btn-secondary meal-new-btn" onClick={() => setCreating(true)}>
              + My own meal
            </button>
          </>
        )}
      </div>
    </div>
  );
}
