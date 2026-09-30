import { useSyncExternalStore } from "react";

/**
 * Whether a task row can be swiped on a phone: right to complete, left to
 * delete (Settings > Appearance). Off by default; kept per device.
 */
const STORAGE_KEY = "opravilko.swipeTasks";
const listeners = new Set<() => void>();

export function getSwipeTasks(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSwipeTasks(on: boolean) {
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

export function useSwipeTasks(): boolean {
  return useSyncExternalStore(subscribe, getSwipeTasks, getSwipeTasks);
}
