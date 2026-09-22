import { DEFAULT_DISPLAY_OPTIONS, type DisplayOptions } from "./displayOptions";

/**
 * Remembers each project's Display menu choices (grouping/sorting/filters,
 * not just layout, which already lives on the project's own `viewStyle`)
 * across visits, keyed per project like `viewLayout` does for pages that
 * have nowhere else to store a preference.
 */
function storageKey(projectId: string): string {
  return `opravilko.displayOptions.${projectId}`;
}

export function getStoredDisplayOptions(projectId: string): Partial<DisplayOptions> | null {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

export function setStoredDisplayOptions(projectId: string, options: DisplayOptions): void {
  try {
    // Layout itself stays on the project's viewStyle field (it's synced
    // across devices via Dropbox); only the rest needs local storage.
    const { layout: _layout, ...rest } = options;
    localStorage.setItem(storageKey(projectId), JSON.stringify(rest));
  } catch {
    /* ignore -- private browsing, storage disabled, etc. */
  }
}

export function withStoredDisplayOptions(projectId: string, layout: DisplayOptions["layout"]): DisplayOptions {
  return { ...DEFAULT_DISPLAY_OPTIONS, ...getStoredDisplayOptions(projectId), layout };
}
