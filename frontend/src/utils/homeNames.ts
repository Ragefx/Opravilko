import { useSyncExternalStore } from "react";
import { tr } from "../i18n";

/**
 * What the home page's three panes are called: Now / Next / Later (the
 * default), or Today / This week / This month. With the calendar names the
 * third pane is about the coming month; anything further out is listed
 * under "Further ahead". Kept per device, like the other look settings.
 */
export type HomeNames = "horizon" | "calendar";

const STORAGE_KEY = "opravilko.homeNames";
const listeners = new Set<() => void>();

export function getHomeNames(): HomeNames {
  try {
    return localStorage.getItem(STORAGE_KEY) === "calendar" ? "calendar" : "horizon";
  } catch {
    return "horizon";
  }
}

export function setHomeNames(names: HomeNames) {
  try {
    localStorage.setItem(STORAGE_KEY, names);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHomeNames(): HomeNames {
  return useSyncExternalStore(subscribe, getHomeNames, getHomeNames);
}

/** The three pane names in the chosen style. */
export function homeLabels(names: HomeNames) {
  return names === "calendar"
    ? { now: tr("Today", "Danes"), next: tr("This week", "Ta teden"), later: tr("This month", "Ta mesec") }
    : { now: tr("Now", "Zdaj"), next: tr("Next", "Naslednje"), later: tr("Later", "Pozneje") };
}

/** The home page's own name (menus, the bottom bar). */
export function useHomeName(): string {
  return homeLabels(useHomeNames()).now;
}
