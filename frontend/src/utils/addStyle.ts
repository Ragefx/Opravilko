import { useSyncExternalStore } from "react";

/**
 * Where the phone's add button sits: "top" (the old + in the header),
 * "corner" (a button bottom right), "tabs" (a bottom bar with a raised +),
 * "bar" (an "Add a task…" bar at the bottom) or "dot" (the logo's dot as the
 * button). Kept per device; only phone-sized screens use it.
 */
export type AddStyle = "top" | "corner" | "tabs" | "bar" | "dot";

const STORAGE_KEY = "opravilko.addStyle";
const STYLES: AddStyle[] = ["top", "corner", "tabs", "bar", "dot"];
const listeners = new Set<() => void>();

export function getAddStyle(): AddStyle {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as AddStyle | null;
    return stored && STYLES.includes(stored) ? stored : "corner";
  } catch {
    return "corner";
  }
}

function apply(style: AddStyle) {
  document.documentElement.setAttribute("data-add", style);
}

/** Call once at startup, before first paint. */
export function initAddStyle() {
  apply(getAddStyle());
}

export function setAddStyle(style: AddStyle) {
  try {
    localStorage.setItem(STORAGE_KEY, style);
  } catch {
    /* ignore */
  }
  apply(style);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAddStyle(): AddStyle {
  return useSyncExternalStore(subscribe, getAddStyle, getAddStyle);
}
