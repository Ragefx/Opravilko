import { useSyncExternalStore } from "react";

/**
 * The app's overall design: "classic" (sidebar + lists) or "soca" (the new
 * look -- no fixed sidebar, a Now / Next / Later home screen, its own palette
 * and type). Kept per device, like the light/dark choice.
 */
export type Look = "classic" | "soca";

const STORAGE_KEY = "opravilko.look";
const listeners = new Set<() => void>();

export function getLook(): Look {
  try {
    return localStorage.getItem(STORAGE_KEY) === "soca" ? "soca" : "classic";
  } catch {
    return "classic";
  }
}

function applyLook(look: Look) {
  document.documentElement.setAttribute("data-look", look);
}

/** Call once at startup, before first paint. */
export function initLook() {
  applyLook(getLook());
}

export function setLook(look: Look) {
  try {
    localStorage.setItem(STORAGE_KEY, look);
  } catch {
    /* ignore */
  }
  applyLook(look);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLook(): Look {
  return useSyncExternalStore(subscribe, getLook, getLook);
}
