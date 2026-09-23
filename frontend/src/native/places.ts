import { registerPlugin } from "@capacitor/core";
import type { Task } from "../api/types";
import { isNativeApp } from "../dropbox/auth";
import { currentUser } from "../firebase/auth";
import { usingFirebase } from "../data/store";

/**
 * Arrival reminders ("Remind me when I arrive" on a task's location), Android
 * app only. The native side (android/.../places/) hands the places to
 * Android's geofencing, which notifies on arrival even with the app closed.
 */
interface Access {
  /** Location while using the app. */
  location: boolean;
  /** "Allow all the time" -- needed to notice arriving with the app closed. */
  background: boolean;
}

interface Place {
  id: string;
  title: string;
  placeName: string;
  projectId: string;
  lat: number;
  lng: number;
}

interface OpravilkoPlacesPlugin {
  checkAccess(): Promise<Access>;
  requestAccess(): Promise<Access>;
  setPlaces(options: { places: Place[] }): Promise<Access & { watched: number }>;
  openSettings(): Promise<void>;
}

const OpravilkoPlaces = registerPlugin<OpravilkoPlacesPlugin>("OpravilkoPlaces");

export const arrivalRemindersAvailable = isNativeApp;

/** Who "me" is on a task's arrival list: the Firebase user, or "me" with Dropbox. */
export function myArrivalId(): string {
  return (usingFirebase() && currentUser()?.uid) || "me";
}

export function remindsMe(task: Task): boolean {
  return Boolean(task.location?.arrivalFor?.includes(myArrivalId()));
}

export async function requestArrivalAccess(): Promise<Access> {
  if (!isNativeApp) return { location: false, background: false };
  return OpravilkoPlaces.requestAccess();
}

export function openLocationSettings(): void {
  if (isNativeApp) void OpravilkoPlaces.openSettings();
}

let lastSent = "";

/** Tells Android which places to watch: open tasks with my arrival reminder on. */
export function syncArrivalPlaces(tasks: Task[]): void {
  if (!isNativeApp) return;
  const places: Place[] = tasks
    .filter((t) => !t.completed && t.location && remindsMe(t))
    .map((t) => ({
      id: t.id,
      title: t.content,
      placeName: t.location!.name,
      projectId: t.projectId,
      lat: t.location!.lat,
      lng: t.location!.lng,
    }));
  const key = JSON.stringify(places);
  if (key === lastSent) return;
  lastSent = key;
  void OpravilkoPlaces.setPlaces({ places }).catch(() => {
    lastSent = ""; // try again on the next change
  });
}
