import { useSyncExternalStore } from "react";
import type { Look } from "./look";

/**
 * Whether the sidebar stays open beside the page (pinned) or slides in from
 * the menu button. Saved per device and per look: Classic starts pinned,
 * Soča starts hidden. Phones always use the slide-in drawer.
 */
const key = (look: Look) => `opravilko.sidebarPinned.${look}`;
const listeners = new Set<() => void>();

export function isSidebarPinned(look: Look): boolean {
  try {
    const v = localStorage.getItem(key(look));
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    /* fall through to the default */
  }
  return look === "classic";
}

export function setSidebarPinned(look: Look, pinned: boolean) {
  try {
    localStorage.setItem(key(look), pinned ? "1" : "0");
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useSidebarPinned(look: Look): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => isSidebarPinned(look)
  );
}
