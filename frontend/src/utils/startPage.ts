import { useSyncExternalStore } from "react";

/**
 * The page the app opens on (Settings > Appearance): Now by default, or the
 * calendar, the shopping list or Midva. Android's back button also returns
 * here. Kept per device, like the other look settings.
 */
export type StartPage = "home" | "calendar" | "shopping" | "midva";

export const START_PAGES: StartPage[] = ["home", "calendar", "shopping", "midva"];

const STORAGE_KEY = "opravilko.startPage";
const listeners = new Set<() => void>();

export function getStartPage(): StartPage {
  try {
    const v = localStorage.getItem(STORAGE_KEY) as StartPage | null;
    return v && START_PAGES.includes(v) ? v : "home";
  } catch {
    return "home";
  }
}

export function setStartPage(page: StartPage) {
  try {
    if (page === "home") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, page);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStartPage(): StartPage {
  return useSyncExternalStore(subscribe, getStartPage, getStartPage);
}

/** The start page's address, e.g. "/app/calendar". */
export function startRoute(): string {
  return `/app/${getStartPage()}`;
}
