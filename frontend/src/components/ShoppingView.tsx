import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AppData, Task } from "../api/types";
import { useBootstrap, useCreateTask, useDeleteTask, useRestoreTasks, useUpdateProject, useUpdateTask } from "../api/hooks";
import {
  BUILTIN_MEALS,
  customMeals,
  formatAmount,
  itemTitle,
  mealFromText,
  mealToText,
  parseItem,
  sameItem,
  scaled,
  splitItems,
  parseLine,
  splitSpokenItems,
  SHOPPING_ADD_EVENT,
  takeShoppingAdd,
  CATEGORIES,
  categoryById,
  storesOf,
  guessCategory,
  rememberCategory,
  type Category,
  type Item,
  type Meal,
} from "../utils/shopping";
import { useToast } from "./ToastProvider";
import MicButton from "./MicButton";
import { CheckIcon, ChevronIcon, MapPinIcon, TrashIcon, XIcon } from "./icons";
import { useSwipeActions } from "./useSwipeActions";
import PickSheet from "./PickSheet";
import Select from "./Select";
import ShopPlacesSheet from "./ShopPlacesSheet";
import { appUi } from "../utils/appUi";
import { completedByName } from "../utils/completedBy";

/**
 * An item's extras live in its description, one per line: "za: Palačinke,
 * Omleta" (the meals it's for), "kat: dairy" (a category picked by hand) and
 * "trg: SPAR" (the shop to buy it in). Any other lines are your own note.
 */
const EXTRA_LINE = /^(za|kat|trg): /;
/** The shop filter's value for items not marked for any shop. */
const ANY_SHOP = "\u0000any";
const SHOP_FILTER_KEY = "opravilko.shopFilter";
function noteOf(description: string): string {
  return description
    .split("\n")
    .filter((l) => !EXTRA_LINE.test(l))
    .join("\n")
    .trim();
}
function withNote(description: string, note: string): string {
  const extras = description.split("\n").filter((l) => EXTRA_LINE.test(l));
  return [note.trim(), ...extras].filter(Boolean).join("\n");
}
function storeOf(t: Task): string | undefined {
  return lineOf(t.description, "trg");
}
function withStore(description: string, store: string | undefined): string {
  if (!store) return description.split("\n").filter((l) => !l.startsWith("trg: ")).join("\n");
  return withLine(description, "trg", store);
}
function lineOf(description: string, key: string): string | undefined {
  return description.match(new RegExp(`^${key}: (.+)$`, "m"))?.[1];
}
function withLine(description: string, key: string, value: string): string {
  const others = description.split("\n").filter((l) => l.trim() && !l.startsWith(`${key}: `));
  return [...others, `${key}: ${value}`].join("\n");
}
function mealsOf(t: Task): string[] {
  return (lineOf(t.description, "za") ?? "").split(", ").filter(Boolean);
}
function withMeal(description: string, meal: string | undefined): string {
  if (!meal) return description;
  const current = (lineOf(description, "za") ?? "").split(", ").filter(Boolean);
  if (current.includes(meal)) return description;
  return withLine(description, "za", [...current, meal].join(", "));
}
function categoryOf(t: Task, name: string): Category {
  return categoryById(lineOf(t.description, "kat") ?? guessCategory(name));
}

/** Same name, and one of them has no amount or counts pieces ("Mleko" and "2x mleko"). */
function countsWith(have: Item, add: Item): boolean {
  if (have.name.toLocaleLowerCase("sl") !== add.name.toLocaleLowerCase("sl")) return false;
  const pieces = (i: Item) => i.amount === undefined || i.unit === "kos";
  return pieces(have) && pieces(add);
}

/**
 * What the list shows after adding `add` to what's already there. Typed by
 * hand, a thing without an amount counts as one: "Mleko" + "mleko" is
 * "Mleko 2×", "Jajca 2×" + "jajca" is "Jajca 3×". ("Mleko 1 l" + "mleko"
 * gets its own line, which then counts up.) From a meal, salt-and-pepper
 * things without amounts don't pile up.
 */
function combined(have: Item, add: Item, byHand: boolean): Item {
  if (have.amount !== undefined && add.amount !== undefined && have.unit === add.unit) {
    return { ...have, amount: have.amount + add.amount };
  }
  if (!byHand) return have;
  const count = (i: Item) => (i.amount === undefined ? 1 : i.amount);
  if ((have.amount === undefined || have.unit === "kos") && (add.amount === undefined || add.unit === "kos")) {
    return { name: have.name, amount: count(have) + count(add), unit: "kos" };
  }
  return have;
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
export default function ShoppingView({
  projectId,
  header,
  start,
}: {
  projectId: string;
  header: ReactNode;
  /** From the widget: focus the add box, or start voice input (a new `n` each time). */
  start?: { n: number; mode: "add" | "voice" | "open" | "shop"; id?: string } | null;
}) {
  const addInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (start?.mode === "add") window.setTimeout(() => addInput.current?.focus(), 150);
  }, [start]);
  const { data } = useBootstrap();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const restoreTasks = useRestoreTasks();
  /** Takes an item off the list, with Undo. */
  function removeItem(t: Task) {
    deleteTask.mutate(t.id, {
      onSuccess: (removed) =>
        showToast({
          message: `Removed ${parseItem(t.content).name}`,
          actionLabel: "Undo",
          onAction: () => restoreTasks.mutate(removed),
        }),
    });
  }
  const updateProject = useUpdateProject();
  const showToast = useToast();
  const qc = useQueryClient();
  const project = data?.projects.find((p) => p.id === projectId);

  // Meals live on the list (shared with everyone on it). Meals saved on this
  // device before that move over once.
  const listMeals = project?.meals;
  useEffect(() => {
    if (!project || project.meals !== undefined) return;
    const local = customMeals();
    if (local.length) saveMeals(local);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.meals === undefined]);

  function saveMeals(meals: Meal[]) {
    // The database refuses empty (undefined) values, e.g. salt's missing amount.
    updateProject.mutate({ id: projectId, meals: JSON.parse(JSON.stringify(meals)) });
  }
  const [text, setText] = useState("");
  const [mealsOpen, setMealsOpen] = useState(false);
  // The shop what you add now is for ("" for any).
  const [addStore, setAddStore] = useState("");
  const [pickingShop, setPickingShop] = useState(false);
  /** Adds a shop to the list's shops (unless it's there already); returns its name as listed. */
  function addStoreName(typed: string): string | undefined {
    const name = typed.trim();
    if (!name) return undefined;
    if (!stores.some((s) => s.toLocaleLowerCase("sl") === name.toLocaleLowerCase("sl"))) {
      updateProject.mutate({ id: projectId, stores: [...stores, name] });
    }
    return stores.find((s) => s.toLocaleLowerCase("sl") === name.toLocaleLowerCase("sl")) ?? name;
  }
  const [editing, setEditing] = useState<Task | null>(null);
  // From the widget: open the item that was tapped.
  useEffect(() => {
    if (start?.mode !== "open") return;
    const t = data?.tasks.find((x) => x.id === start.id);
    if (t) setEditing(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);
  useWakeLock();

  const archivedSections = useMemo(
    () => new Set((data?.sections || []).filter((s) => s.archived).map((s) => s.id)),
    [data?.sections]
  );
  const items = (data?.tasks || []).filter(
    (t) => t.projectId === projectId && !t.parentId && !(t.sectionId && archivedSections.has(t.sectionId))
  );
  // By shop (in the list's order of shops, then any other, then none); within
  // one, by category in the order you'd walk a shop (fruit and veg first);
  // within that, in the order they were added.
  const stores = storesOf(project);
  const storeRank = (t: Task) => {
    const store = storeOf(t);
    if (!store) return stores.length + 1;
    const i = stores.indexOf(store);
    return i < 0 ? stores.length : i;
  };
  const categoryRank = (t: Task) => CATEGORIES.findIndex((c) => c.id === categoryOf(t, parseItem(t.content).name).id);
  const open = items
    .filter((t) => !t.completed)
    .sort((a, b) => storeRank(a) - storeRank(b) || categoryRank(a) - categoryRank(b) || a.order - b.order);
  // A column for the shop, once anything on the list has one.
  const storeColumn = items.some((t) => storeOf(t));

  // Which shop you're in: "" all, a shop's name, or ANY_SHOP for items without one.
  // Remembered on this device.
  const [shopFilter, setShopFilterState] = useState(() => {
    try {
      return localStorage.getItem(SHOP_FILTER_KEY) ?? "";
    } catch {
      return "";
    }
  });
  function setShopFilter(value: string) {
    setShopFilterState(value);
    try {
      localStorage.setItem(SHOP_FILTER_KEY, value);
    } catch {
      /* ignore */
    }
  }
  // Arriving at a shop (its notification): show that shop's items.
  useEffect(() => {
    if (start?.mode === "shop" && start.id) setShopFilter(start.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);
  const [placesOpen, setPlacesOpen] = useState(false);
  const openCount = (shop: string) => open.filter((t) => (storeOf(t) ?? ANY_SHOP) === shop).length;
  // The shops with something to buy (and the one picked, even when it's done).
  const filterShops = [
    ...stores,
    ...[...new Set(open.map((t) => storeOf(t)).filter((s): s is string => !!s))].filter((s) => !stores.includes(s)),
  ].filter((s) => openCount(s) > 0 || s === shopFilter);
  const filtering = storeColumn && shopFilter !== "";
  const shown = !filtering ? open : open.filter((t) => (storeOf(t) ?? ANY_SHOP) === shopFilter);
  // In a shop, things that can be bought anywhere follow under their own heading.
  const anywhere = filtering && shopFilter !== ANY_SHOP ? open.filter((t) => !storeOf(t)) : [];
  // What you usually buy that isn't on the list yet: one tap puts it back.
  const onList = new Set(open.map((t) => parseItem(t.content).name.toLocaleLowerCase("sl")));
  const usual = Object.entries(project?.bought ?? {})
    .filter(([key]) => !onList.has(key))
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 10)
    .map(([, v]) => v.name);
  const ticked = items
    .filter((t) => t.completed)
    .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));

  /**
   * Adds items, adding amounts onto the same thing already on the list
   * ("Jajca 2×" + "Jajca 3×" = "Jajca 5×"). Returns how to undo it.
   */
  async function addItems(list: Item[], meal?: string, store = addStore): Promise<() => void> {
    const created: string[] = [];
    const changed: { id: string; content: string; description: string }[] = [];
    for (const item of list) {
      // A meal's ingredient can have its own shop.
      const shop = item.store ?? store;
      // The latest list (earlier lines of this same add included).
      const latest = qc.getQueryData<AppData>(["bootstrap"])?.tasks ?? [];
      const onList = latest.filter((t) => t.projectId === projectId && !t.completed && !t.parentId);
      const existing =
        onList.find((t) => sameItem(parseItem(t.content), item)) ??
        // Typed without an amount, or as pieces: it's one more of the same thing.
        (!meal ? onList.find((t) => countsWith(parseItem(t.content), item)) : undefined);
      if (existing) {
        const have = parseItem(existing.content);
        const next: Item = combined(have, item, !meal);
        changed.push({ id: existing.id, content: existing.content, description: existing.description });
        await updateTask.mutateAsync({
          id: existing.id,
          content: itemTitle(next),
          // Marked for a shop now, unless it already was.
          description: withMeal(storeOf(existing) ? existing.description : withStore(existing.description, shop), meal),
        });
      } else {
        const t = await createTask.mutateAsync({
          content: itemTitle({ name: item.name, amount: item.amount, unit: item.unit }),
          projectId,
          description: withStore(meal ? `za: ${meal}` : "", shop),
        });
        created.push(t.id);
      }
    }
    return () => {
      created.forEach((id) => deleteTask.mutate(id));
      changed.forEach((c) => updateTask.mutate({ id: c.id, content: c.content, description: c.description }));
    };
  }

  // Text shared from another app ("Share to Opravilko" -> this list).
  useEffect(() => {
    function take() {
      const shared = takeShoppingAdd(projectId);
      const parts = shared ? splitItems(shared) : [];
      if (!parts.length) return;
      void addItems(parts.map((l) => parseLine(l, stores))).then((undo) =>
        showToast({ message: `Added ${parts.length} to the list`, actionLabel: "Undo", onAction: undo })
      );
    }
    take();
    window.addEventListener(SHOPPING_ADD_EVENT, take);
    return () => window.removeEventListener(SHOPPING_ADD_EVENT, take);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function submit() {
    const parts = splitItems(text);
    if (!parts.length) return;
    setText("");
    // "hrenovke 2 @spar": that item for that shop.
    await addItems(parts.map((l) => parseLine(l, stores)));
  }

  function toggle(t: Task) {
    updateTask.mutate({
      id: t.id,
      completed: !t.completed,
      completedAt: t.completed ? null : new Date().toISOString(),
    });
    if (!t.completed) countBought(parseItem(t.content).name);
  }

  /** Remembers what gets bought, for the "usual items" row. */
  function countBought(name: string) {
    const key = name.toLocaleLowerCase("sl");
    const bought = { ...(project?.bought ?? {}) };
    bought[key] = { name, n: (bought[key]?.n ?? 0) + 1 };
    updateProject.mutate({ id: projectId, bought });
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
            ref={addInput}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            placeholder="Add: mleko 1 l, 2x jajca, kruh"
            aria-label="Add items"
            enterKeyHint="done"
          />
          <MicButton
            key={start?.mode === "voice" ? `voice-${start.n}` : "mic"}
            autoStart={start?.mode === "voice"}
            prompt="Kaj dodam na seznam?"
            onText={(said) => void addItems(splitSpokenItems(said).map(parseItem))}
          />
          <button className="btn btn-primary" onClick={() => void submit()} disabled={!text.trim()}>
            Add
          </button>
          <button className="btn btn-secondary shopping-meal-btn" onClick={() => setMealsOpen(true)}>
            🍳 Meal
          </button>
          <button
            className={`btn btn-secondary shopping-store-btn ${addStore ? "is-on" : ""}`}
            onClick={() => setPickingShop(true)}
            aria-label={`Shop for what you add: ${addStore || "any shop"}`}
          >
            🏪 {addStore || "Shop"}
          </button>
        </div>

        {usual.length > 0 && (
          <div className="shopping-usual" aria-label="Usual items">
            {usual.map((name) => (
              <button key={name} className="shopping-usual-chip" onClick={() => void addItems([{ name }])}>
                + {name}
              </button>
            ))}
          </div>
        )}

        {open.length === 0 && ticked.length === 0 && (
          <p className="shopping-empty">The list is empty. Add things above, or a whole meal with 🍳.</p>
        )}

        {storeColumn && (
          <div className="shopping-shops" role="group" aria-label="Show a shop's items">
            <button className={`shopping-shop-chip ${shopFilter === "" ? "is-current" : ""}`} onClick={() => setShopFilter("")}>
              All <b>{open.length}</b>
            </button>
            {filterShops.map((s) => (
              <button
                key={s}
                className={`shopping-shop-chip ${shopFilter === s ? "is-current" : ""}`}
                onClick={() => setShopFilter(s)}
              >
                {s} <b>{openCount(s)}</b>
              </button>
            ))}
            <button
              className={`shopping-shop-chip ${shopFilter === ANY_SHOP ? "is-current" : ""}`}
              onClick={() => setShopFilter(ANY_SHOP)}
            >
              Any shop <b>{openCount(ANY_SHOP)}</b>
            </button>
          </div>
        )}

        {filtering && shown.length === 0 && anywhere.length === 0 && open.length > 0 && (
          <p className="shopping-empty">Nothing left for {shopFilter === ANY_SHOP ? "any shop" : shopFilter}.</p>
        )}

        <ul className="shopping-list">
          {shown.map((t) => (
            <ShoppingRow
                key={t.id}
                task={t}
                onToggle={() => toggle(t)}
                onDelete={() => removeItem(t)}
                onEdit={() => setEditing(t)}
                storeColumn={storeColumn}
              />
          ))}
        </ul>

        {anywhere.length > 0 && (
          <>
            <div className="shopping-basket-head">
              <span>Any shop · {anywhere.length}</span>
            </div>
            <ul className="shopping-list">
              {anywhere.map((t) => (
                <ShoppingRow
                  key={t.id}
                  task={t}
                  onToggle={() => toggle(t)}
                  onDelete={() => removeItem(t)}
                  onEdit={() => setEditing(t)}
                  storeColumn={storeColumn}
                />
              ))}
            </ul>
          </>
        )}

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
                <ShoppingRow
                key={t.id}
                task={t}
                onToggle={() => toggle(t)}
                onDelete={() => removeItem(t)}
                onEdit={() => setEditing(t)}
                storeColumn={storeColumn}
              />
              ))}
            </ul>
          </>
        )}

        {appUi && stores.length > 0 && (
          <button type="button" className="shopping-places-link" onClick={() => setPlacesOpen(true)}>
            <MapPinIcon width={16} height={16} />
            Remind me at the shop
          </button>
        )}
      </div>

      {placesOpen && <ShopPlacesSheet stores={stores} onClose={() => setPlacesOpen(false)} />}

      {editing && (
        <ItemEditor
          task={editing}
          stores={stores}
          onNewStore={addStoreName}
          onClose={() => setEditing(null)}
          onSave={(content, categoryId, note, store) => {
            const name = parseItem(content).name;
            const guessed = guessCategory(name);
            let description = editing.description;
            if (categoryId !== categoryOf(editing, parseItem(editing.content).name).id || categoryId !== guessed) {
              description = withLine(description, "kat", categoryId);
              rememberCategory(name, categoryId);
            }
            description = withStore(withNote(description, note), store);
            updateTask.mutate({ id: editing.id, content, description });
            setEditing(null);
          }}
          onDelete={() => {
            deleteTask.mutate(editing.id);
            setEditing(null);
          }}
        />
      )}

      {pickingShop && (
        <ShopPicker
          stores={stores}
          current={addStore}
          countOf={(shop) => open.filter((t) => (storeOf(t) ?? "") === shop).length}
          onPick={(shop) => {
            setAddStore(shop);
            setPickingShop(false);
          }}
          onNew={(name) => {
            const added = addStoreName(name);
            if (added) setAddStore(added);
            setPickingShop(false);
          }}
          onClose={() => setPickingShop(false)}
        />
      )}

      {mealsOpen && (
        <MealPicker
          stores={stores}
          saved={listMeals ?? customMeals()}
          onSave={saveMeals}
          onClose={() => setMealsOpen(false)}
          onAdd={async (meal, servings, have) => {
            setMealsOpen(false);
            const list = meal.ingredients.filter((_, n) => !have.has(n)).map((ing) => scaled(ing, servings));
            const undo = await addItems(list, meal.name);
            showToast({
              message: `Added ${list.length} ingredients for ${meal.name} (${servings})${have.size ? `, ${have.size} at home` : ""}`,
              actionLabel: "Undo",
              onAction: undo,
            });
          }}
        />
      )}
    </div>
  );
}

function ShoppingRow({
  task,
  onToggle,
  onDelete,
  onEdit,
  storeColumn,
}: {
  task: Task;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
  storeColumn: boolean;
}) {
  const item = parseItem(task.content);
  const amount = formatAmount(item.amount, item.unit);
  const meals = mealsOf(task);
  const { data } = useBootstrap();
  const doneBy = completedByName(task, data);
  const category = categoryOf(task, item.name);
  const store = storeOf(task);
  const note = noteOf(task.description);
  // Swipe right ticks it off (or puts it back), left removes it, as with tasks.
  const swipe = useSwipeActions({ onRight: onToggle, onLeft: onDelete });
  return (
    <li className={`shopping-row ${task.completed ? "is-done" : ""}`} data-swipe={swipe.dir}>
      {swipe.dir && (
        <div className={`task-swipe-bg ${swipe.armed ? "armed" : ""}`}>
          {swipe.dir === "right" ? (
            <>
              <CheckIcon width={18} height={18} /> {task.completed ? "Put back" : "Bought"}
            </>
          ) : (
            <>
              Delete <TrashIcon width={18} height={18} />
            </>
          )}
        </div>
      )}
      <div
        ref={swipe.rowRef}
        className="shopping-row-inner"
        style={swipe.dx ? { transform: `translateX(${swipe.dx}px)`, background: "var(--color-surface)" } : undefined}
        {...swipe.handlers}
      >
        {/* The circle side ticks it off; the rest of the row opens it for editing. */}
        <button
          className="shopping-tick"
          onClick={onToggle}
          aria-pressed={task.completed}
          aria-label={task.completed ? `Put ${item.name} back` : `Tick off ${item.name}`}
        >
          <span className="shopping-check" aria-hidden="true">
            {task.completed && <CheckIcon width={14} height={14} />}
          </span>
        </button>
        <button className="shopping-row-main" onClick={onEdit} aria-label={`Edit ${item.name}`}>
          <span className="shopping-name">
            {item.name}
            {meals.length > 0 && <small>{meals.join(" · ")}</small>}
            {note && <small className="shopping-note">{note}</small>}
            {doneBy && <small className="shopping-done-by">✓ {doneBy}</small>}
          </span>
          {amount && <span className="shopping-amount">{amount}</span>}
          {storeColumn && (
            <span className="shopping-store" title={store}>
              {store}
            </span>
          )}
          <span className="shopping-category" title={category.name}>
            {category.emoji}
          </span>
        </button>
        <button className="shopping-delete" onClick={onDelete} aria-label={`Remove ${item.name}`}>
          <XIcon width={14} height={14} />
        </button>
      </div>
    </li>
  );
}

/**
 * Which shop what you add is for, in the app's own look: a sheet from the
 * bottom on a phone, a small window on a wide screen. Each shop with how many
 * things are on the list for it; a new shop is typed in right here.
 */
function ShopPicker({
  stores,
  current,
  countOf,
  onPick,
  onNew,
  onClose,
}: {
  stores: string[];
  current: string;
  countOf: (shop: string) => number;
  onPick: (shop: string) => void;
  onNew: (name: string) => void;
  onClose: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  return (
    <PickSheet
      title="Buy at"
      subtitle="What you add now goes on the list for this shop."
      options={[
        { value: "", label: "Any shop", icon: "🛒", count: countOf("") },
        ...stores.map((s) => ({ value: s, label: s, icon: "🏪", count: countOf(s) })),
      ]}
      current={current}
      onPick={onPick}
      onClose={onClose}
      footer={
        adding ? (
          <form
            className="shop-picker-new"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) onNew(name);
            }}
          >
            <input
              autoFocus
              placeholder="Shop name, e.g. Mercator"
              value={name}
              enterKeyHint="done"
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
              Add
            </button>
          </form>
        ) : (
          <button className="shop-picker-row is-add" onClick={() => setAdding(true)}>
            <span className="shop-picker-icon" aria-hidden="true">
              +
            </span>
            <span className="shop-picker-name">New shop</span>
          </button>
        )
      }
    />
  );
}

function ItemEditor({
  task,
  stores,
  onNewStore,
  onClose,
  onSave,
  onDelete,
}: {
  task: Task;
  stores: string[];
  onNewStore: (name: string) => string | undefined;
  onClose: () => void;
  onSave: (content: string, categoryId: string, note: string, store: string | undefined) => void;
  onDelete: () => void;
}) {
  const item = parseItem(task.content);
  const [name, setName] = useState(item.name);
  const [amount, setAmount] = useState(formatAmount(item.amount, item.unit));
  const [categoryId, setCategoryId] = useState(categoryOf(task, item.name).id);
  const [note, setNote] = useState(noteOf(task.description));
  const [store, setStore] = useState(storeOf(task));
  // Typing a new shop's name (null when not).
  const [newShop, setNewShop] = useState<string | null>(null);
  const shops = store && !stores.includes(store) ? [...stores, store] : stores;

  function save() {
    if (!name.trim()) return;
    // Read back the same way as typing it into the list ("1,5 l", "4", "500 g").
    const parsed = parseItem(`${name.trim()} ${amount.trim()}`.trim());
    const next = amount.trim() && parsed.amount !== undefined ? parsed : { name: name.trim() };
    onSave(
      itemTitle({ ...next, name: name.trim().replace(/^./, (c) => c.toLocaleUpperCase("sl")) }),
      categoryId,
      note,
      store
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal item-editor" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Edit item">
        <div className="item-editor-fields">
          <label>
            Item
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} autoFocus />
          </label>
          <label className="item-editor-amount">
            Amount
            <input
              value={amount}
              placeholder="1 l, 4, 500 g"
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
          </label>
        </div>
        <label className="item-editor-note">
          Note
          <textarea
            rows={2}
            value={note}
            placeholder="e.g. the Alpsko yoghurt, or cheese if there's none"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="item-editor-stores" role="group" aria-label="Shop">
          <button className={`store-chip ${!store ? "is-current" : ""}`} onClick={() => setStore(undefined)}>
            Any shop
          </button>
          {shops.map((s) => (
            <button key={s} className={`store-chip ${store === s ? "is-current" : ""}`} onClick={() => setStore(s)}>
              {s}
            </button>
          ))}
          {newShop === null ? (
            <button className="store-chip is-add" onClick={() => setNewShop("")}>
              + Shop
            </button>
          ) : (
            <input
              className="store-chip store-chip-input"
              autoFocus
              placeholder="Shop name"
              value={newShop}
              enterKeyHint="done"
              onChange={(e) => setNewShop(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setNewShop(null);
                if (e.key !== "Enter") return;
                const added = onNewStore(newShop);
                if (added) setStore(added);
                setNewShop(null);
              }}
              onBlur={() => {
                const added = newShop.trim() ? onNewStore(newShop) : undefined;
                if (added) setStore(added);
                setNewShop(null);
              }}
            />
          )}
        </div>
        <div className="category-grid">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`category-option ${categoryId === c.id ? "is-current" : ""}`}
              onClick={() => setCategoryId(c.id)}
            >
              <span>{c.emoji}</span>
              {c.name}
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn btn-text meal-danger" onClick={onDelete}>
            Delete
          </button>
          <button className="btn btn-text" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!name.trim()}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

const MEAL_HAVE_KEY = "opravilko.mealHave";

/** What you had at home last time you added this meal (ingredient names), as indices. */
function rememberedHave(meal: Meal): Set<number> {
  try {
    const names: string[] = JSON.parse(localStorage.getItem(MEAL_HAVE_KEY) || "{}")[meal.id] ?? [];
    return new Set(meal.ingredients.flatMap((ing, n) => (names.includes(ing.name) ? [n] : [])));
  } catch {
    return new Set();
  }
}

function rememberHave(meal: Meal, have: Set<number>): void {
  try {
    const all = JSON.parse(localStorage.getItem(MEAL_HAVE_KEY) || "{}");
    all[meal.id] = meal.ingredients.filter((_, n) => have.has(n)).map((ing) => ing.name);
    localStorage.setItem(MEAL_HAVE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/** Food icons to pick from for a meal. */
const MEAL_EMOJI = [
  "🍝", "🍕", "🍔", "🌭", "🌮", "🌯", "🥙", "🥪", "🥗", "🥘", "🍲", "🫕", "🍛", "🍜", "🍣", "🍱",
  "🥟", "🍤", "🍗", "🍖", "🥩", "🥓", "🐟", "🦐", "🍳", "🥚", "🥞", "🧇", "🥐", "🥖", "🍞", "🧀",
  "🥔", "🍠", "🥕", "🌽", "🥦", "🍄", "🍅", "🫑", "🍚", "🍙", "🍰", "🎂", "🧁", "🍪", "🍩", "🍫",
  "🍎", "🍓", "🍌", "🥑", "🍋", "🫐", "🍽️", "🥣",
];

function MealPicker({
  stores,
  saved,
  onSave,
  onClose,
  onAdd,
}: {
  /** The list's shops, for marking where an ingredient is bought. */
  stores: string[];
  /** Your own meals, and built-in ones you've edited or hidden (same id as the original). */
  saved: Meal[];
  onSave: (meals: Meal[]) => void;
  onClose: () => void;
  /** Adds the meal's ingredients, leaving out the ones you already have (by index). */
  onAdd: (meal: Meal, servings: number, have: Set<number>) => void;
}) {
  const [mine, setMine] = useState<Meal[]>(saved);
  // Ingredients you already have at home: left off the list (remembered per meal).
  const [have, setHave] = useState<Set<number>>(new Set());
  const [picked, setPicked] = useState<Meal | null>(null);
  const [servings, setServings] = useState(2);
  const [form, setForm] = useState<{ id?: string; emoji: string; name: string; servings: number; text: string } | null>(null);
  const [choosingIcon, setChoosingIcon] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const builtinIds = new Set(BUILTIN_MEALS.map((m) => m.id));
  const mineIds = new Set(mine.map((m) => m.id));
  const all = [...mine.filter((m) => !builtinIds.has(m.id)), ...BUILTIN_MEALS.map((b) => mine.find((m) => m.id === b.id) ?? b)];
  const meals = all.filter((m) => !m.hidden);
  const hidden = all.filter((m) => m.hidden);

  function store(next: Meal[]) {
    setMine(next);
    onSave(next);
  }

  /** Saves a meal: your own, or a built-in one as your edited copy (same id). */
  function put(meal: Meal) {
    store(mineIds.has(meal.id) ? mine.map((m) => (m.id === meal.id ? meal : m)) : [meal, ...mine]);
  }

  function open(meal: Meal | null) {
    setPicked(meal);
    setHave(meal ? rememberedHave(meal) : new Set());
    setChoosingIcon(false);
    setConfirmDelete(false);
  }

  function saveForm() {
    if (!form || !form.text.trim()) return;
    const meal = { ...mealFromText(form.name, form.text, form.servings, form.id ? { id: form.id, emoji: form.emoji } : undefined), emoji: form.emoji };
    if (!meal.ingredients.length) return;
    put(meal);
    setForm(null);
    open(meal);
    setServings(form.servings);
  }

  /** Where an ingredient is always bought ("" = any shop). */
  function setIngredientStore(n: number, store: string) {
    if (!picked) return;
    const meal: Meal = {
      ...picked,
      ingredients: picked.ingredients.map((ing, i) => {
        if (i !== n) return ing;
        const { store: _old, ...rest } = ing;
        void _old;
        return store ? { ...rest, store } : rest;
      }),
    };
    put(meal);
    setPicked(meal);
  }

  function setIcon(emoji: string) {
    if (form) {
      setForm({ ...form, emoji });
    } else if (picked) {
      const meal = { ...picked, emoji };
      put(meal);
      setPicked(meal);
    }
    setChoosingIcon(false);
  }

  /** Your own meal goes for good; a built-in one is hidden (and can be brought back). */
  function deleteMeal(meal: Meal) {
    if (builtinIds.has(meal.id)) put({ ...meal, hidden: true });
    else store(mine.filter((m) => m.id !== meal.id));
    open(null);
  }

  function unhide(meal: Meal) {
    const { hidden: _h, ...rest } = meal;
    void _h;
    put(rest);
  }

  /** Puts an edited built-in meal back as it was. */
  function reset(meal: Meal) {
    store(mine.filter((m) => m.id !== meal.id));
    open(BUILTIN_MEALS.find((m) => m.id === meal.id) ?? null);
  }

  const icons = choosingIcon && (
    <div className="meal-icons" role="listbox" aria-label="Icon">
      {MEAL_EMOJI.map((e) => (
        <button
          key={e}
          type="button"
          role="option"
          aria-selected={(form?.emoji ?? picked?.emoji) === e}
          className={(form?.emoji ?? picked?.emoji) === e ? "is-current" : ""}
          onClick={() => setIcon(e)}
        >
          {e}
        </button>
      ))}
    </div>
  );

  const title = form ? (form.id ? "Edit meal" : "New meal") : picked ? "" : "Meals";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal meal-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Meals">
        <div className="settings-head">
          {picked && !form ? (
            <button className="meal-back" onClick={() => open(null)} aria-label="All meals">
              <ChevronIcon width={18} height={18} />
              Meals
            </button>
          ) : (
            <h3>{title}</h3>
          )}
          <button className="sidebar-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon width={18} height={18} />
          </button>
        </div>

        {form ? (
          <div className="meal-new">
            <div className="meal-name-row">
              <button
                type="button"
                className="meal-icon-btn"
                onClick={() => setChoosingIcon((c) => !c)}
                aria-label="Change icon"
                title="Change icon"
              >
                {form.emoji}
              </button>
              <input
                placeholder="Name, e.g. Mamina juha"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus={!form.id}
              />
            </div>
            {icons}
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
              placeholder={"One ingredient per line (@ for a shop):\n250 g moke\n0,5 l mleka @Hofer\n3 jajca\nsol"}
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
            />
            <div className="modal-actions">
              <button className="btn btn-text" onClick={() => setForm(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveForm} disabled={!form.text.trim()}>
                Save meal
              </button>
            </div>
          </div>
        ) : picked ? (
          <>
            <div className="meal-hero">
              <button
                type="button"
                className="meal-icon-btn is-big"
                onClick={() => setChoosingIcon((c) => !c)}
                aria-label="Change icon"
                title="Change icon"
              >
                {picked.emoji}
              </button>
              <div className="meal-hero-text">
                <h3>{picked.name}</h3>
                <span>
                  {picked.ingredients.length} ingredients{builtinIds.has(picked.id) && mineIds.has(picked.id) ? " · edited" : ""}
                </span>
              </div>
            </div>
            {icons}
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
            <p className="meal-have-hint">Tap what you already have at home: it's left off the list.</p>
            <ul className="meal-ingredients is-pickable">
              {picked.ingredients.map((ing, n) => {
                const it = scaled(ing, servings);
                const home = have.has(n);
                const shops = ing.store && !stores.includes(ing.store) ? [...stores, ing.store] : stores;
                return (
                  <li key={n} className="meal-ing-row">
                    <button
                      type="button"
                      className={`meal-ing ${home ? "is-home" : ""}`}
                      aria-pressed={!home}
                      onClick={() =>
                        setHave((h) => {
                          const next = new Set(h);
                          if (next.has(n)) next.delete(n);
                          else next.add(n);
                          return next;
                        })
                      }
                    >
                      <span className="meal-ing-check" aria-hidden="true">
                        {!home && <CheckIcon width={14} height={14} />}
                      </span>
                      <span className="meal-ing-name">{it.name}</span>
                      <span className="meal-ing-amount">{home ? "at home" : formatAmount(it.amount, it.unit)}</span>
                    </button>
                    <label className={`meal-ing-store ${ing.store ? "is-set" : ""}`} title="Where it's bought">
                      <span>{ing.store ?? "Any shop"}</span>
                      <Select
                        value={ing.store ?? ""}
                        sheetTitle={`Where do you buy ${ing.name}?`}
                        aria-label={`Shop for ${ing.name}`}
                        onChange={(e) => setIngredientStore(n, e.target.value)}
                      >
                        <option value="">Any shop</option>
                        {shops.map((sh) => (
                          <option key={sh} value={sh}>
                            {sh}
                          </option>
                        ))}
                      </Select>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="meal-actions">
              <div className="meal-actions-side">
                {confirmDelete ? (
                  <button className="btn btn-text meal-danger" onClick={() => deleteMeal(picked)}>
                    Yes, delete
                  </button>
                ) : (
                  <button className="btn btn-text meal-danger" onClick={() => setConfirmDelete(true)}>
                    Delete
                  </button>
                )}
                <button
                  className="btn btn-text"
                  onClick={() =>
                    setForm({ id: picked.id, emoji: picked.emoji, name: picked.name, servings, text: mealToText(picked, servings) })
                  }
                >
                  Edit
                </button>
                {builtinIds.has(picked.id) && mineIds.has(picked.id) && (
                  <button className="btn btn-text" onClick={() => reset(picked)}>
                    Reset
                  </button>
                )}
              </div>
              <button
                className="btn btn-primary"
                disabled={have.size >= picked.ingredients.length}
                onClick={() => {
                  rememberHave(picked, have);
                  onAdd(picked, servings, have);
                }}
              >
                {have.size ? `Add ${picked.ingredients.length - have.size} of ${picked.ingredients.length}` : "Add"}
                {servings === 1 ? " for 1" : ` for ${servings}`}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="meal-grid">
              {meals.map((m) => (
                <button key={m.id} className="meal-card" onClick={() => open(m)}>
                  <span className="meal-emoji">{m.emoji}</span>
                  <span className="meal-card-text">
                    <b>{m.name}</b>
                    <small>{m.ingredients.length} ingredients</small>
                  </span>
                </button>
              ))}
              <button className="meal-card is-new" onClick={() => setForm({ name: "", emoji: "🍽️", servings: 2, text: "" })}>
                <span className="meal-emoji">＋</span>
                <span className="meal-card-text">
                  <b>My own meal</b>
                  <small>Paste a recipe</small>
                </span>
              </button>
            </div>
            {hidden.length > 0 && (
              <div className="meal-hidden">
                <button className="btn btn-text" onClick={() => setShowHidden((v) => !v)}>
                  {showHidden ? "Hide deleted" : `Deleted meals (${hidden.length})`}
                </button>
                {showHidden &&
                  hidden.map((m) => (
                    <div key={m.id} className="meal-hidden-row">
                      <span>
                        {m.emoji} {m.name}
                      </span>
                      <button className="btn btn-text" onClick={() => unhide(m)}>
                        Bring back
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
