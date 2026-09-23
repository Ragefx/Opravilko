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
  mealToText,
  parseItem,
  sameItem,
  saveCustomMeals,
  scaled,
  splitItems,
  type Item,
  type Meal,
} from "../utils/shopping";
import { useToast } from "./ToastProvider";
import { CheckIcon, XIcon } from "./icons";

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
  // Your own meals, and built-in ones you've edited (same id as the original).
  const [mine, setMine] = useState<Meal[]>(customMeals);
  const [picked, setPicked] = useState<Meal | null>(null);
  const [servings, setServings] = useState(2);
  const [form, setForm] = useState<{ id?: string; emoji?: string; name: string; servings: number; text: string } | null>(null);
  const builtinIds = new Set(BUILTIN_MEALS.map((m) => m.id));
  const mineIds = new Set(mine.map((m) => m.id));
  const meals = [...mine.filter((m) => !builtinIds.has(m.id)), ...BUILTIN_MEALS.map((b) => mine.find((m) => m.id === b.id) ?? b)];

  function store(next: Meal[]) {
    setMine(next);
    saveCustomMeals(next);
  }

  function saveForm() {
    if (!form || !form.text.trim()) return;
    const keep = form.id ? { id: form.id, emoji: form.emoji ?? "🍽️" } : undefined;
    const meal = mealFromText(form.name, form.text, form.servings, keep);
    if (!meal.ingredients.length) return;
    store(mineIds.has(meal.id) ? mine.map((m) => (m.id === meal.id ? meal : m)) : [meal, ...mine]);
    setForm(null);
    setPicked(meal);
    setServings(form.servings);
  }

  /** Deletes your own meal, or puts an edited built-in one back as it was. */
  function removeMine(id: string) {
    store(mine.filter((m) => m.id !== id));
    const original = BUILTIN_MEALS.find((m) => m.id === id);
    setPicked(original ?? null);
  }

  const title = form
    ? form.id
      ? "Edit meal"
      : "New meal"
    : picked
      ? `${picked.emoji} ${picked.name}`
      : "Add a meal";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal meal-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add a meal">
        <div className="settings-head">
          <h3>{title}</h3>
          <button className="sidebar-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon width={18} height={18} />
          </button>
        </div>

        {form ? (
          <div className="meal-new">
            <input
              placeholder="Name, e.g. Mamina juha"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
            <label className="meal-servings-label">
              The recipe is for
              <input
                type="number"
                min={1}
                value={form.servings}
                onChange={(e) => setForm({ ...form, servings: Math.max(1, +e.target.value || 1) })}
              />
              people
            </label>
            <textarea
              rows={8}
              placeholder={"One ingredient per line:\n250 g moke\n0,5 l mleka\n3 jajca\nsol"}
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
            />
            <div className="modal-actions">
              <button className="btn btn-text" onClick={() => setForm(null)}>
                Back
              </button>
              <button className="btn btn-primary" onClick={saveForm} disabled={!form.text.trim()}>
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
              <button
                className="btn btn-text"
                onClick={() =>
                  setForm({
                    id: picked.id,
                    emoji: picked.emoji,
                    name: picked.name,
                    servings,
                    text: mealToText(picked, servings),
                  })
                }
              >
                Edit
              </button>
              {mineIds.has(picked.id) && (
                <button className="btn btn-text meal-danger" onClick={() => removeMine(picked.id)}>
                  {builtinIds.has(picked.id) ? "Reset" : "Delete"}
                </button>
              )}
              <button className="btn btn-primary" onClick={() => onAdd(picked, servings)}>
                Add to list
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="meal-grid">
              {meals.map((m) => (
                <button key={m.id} className="meal-card" onClick={() => setPicked(m)}>
                  <span className="meal-emoji">{m.emoji}</span>
                  <span>{m.name}</span>
                </button>
              ))}
            </div>
            <button
              className="btn btn-secondary meal-new-btn"
              onClick={() => setForm({ name: "", servings: 2, text: "" })}
            >
              + My own meal
            </button>
          </>
        )}
      </div>
    </div>
  );
}
