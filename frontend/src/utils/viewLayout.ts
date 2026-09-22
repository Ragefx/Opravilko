export type ViewLayout = "list" | "board";

/**
 * Remembers a List/Board choice for a page that isn't a project (so it has
 * nowhere else to store it, unlike a project's own `viewStyle` field).
 * Keyed per page (e.g. "today") so Today and Upcoming can remember
 * independently.
 */
function storageKey(page: string): string {
  return `opravilko.viewLayout.${page}`;
}

export function getStoredLayout(page: string): ViewLayout | null {
  try {
    const v = localStorage.getItem(storageKey(page));
    return v === "list" || v === "board" ? v : null;
  } catch {
    return null;
  }
}

export function setStoredLayout(page: string, layout: ViewLayout): void {
  try {
    localStorage.setItem(storageKey(page), layout);
  } catch {
    /* ignore -- private browsing, storage disabled, etc. */
  }
}
