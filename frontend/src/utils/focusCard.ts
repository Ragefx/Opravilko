import { useSyncExternalStore } from "react";

/**
 * Whether Now leads with one focus task (big, with Tomorrow / Done / Start
 * focus). On by default; kept per device, like the other look settings.
 */
const STORAGE_KEY = "opravilko.focusCard";
const listeners = new Set<() => void>();

export function getFocusCard(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setFocusCard(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFocusCard(): boolean {
  return useSyncExternalStore(subscribe, getFocusCard, getFocusCard);
}
