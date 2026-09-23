import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { getWidgetAuth, isNativeApp } from "../dropbox/auth";
import { DATA_PATH } from "../dropbox/store";
import type { AppData } from "../api/types";
import { usingFirebase } from "../data/store";
import { firebaseConfig } from "../firebase/config";
import { currentUser } from "../firebase/auth";

/** The native side lives in android/.../widget/WidgetBridgePlugin.java. */
interface OpravilkoWidgetPlugin {
  update(options: {
    data: string;
    appKey: string;
    refreshToken: string | null;
    dataPath: string;
    /** With Google sign-in: lets the widget save its ticks to Firestore itself. */
    firebase?: { apiKey: string; projectId: string; refreshToken: string; uid: string } | null;
  }): Promise<void>;
  clear(): Promise<void>;
  addListener(event: "dataChanged", listener: () => void): Promise<PluginListenerHandle>;
}

const OpravilkoWidget = registerPlugin<OpravilkoWidgetPlugin>("OpravilkoWidget");

/** Fired on window when a widget tap asks for quick add (see takeQuickAddRequest). */
export const WIDGET_QUICK_ADD = "opravilko:widget-quick-add";
export interface QuickAddRequest {
  projectId: string;
  today: boolean;
  /** Due on this "yyyy-MM-dd" day unless another date is typed (a calendar day). */
  date?: string;
}

// Held until the app shell picks it up -- on a cold start it may not be mounted yet.
let pendingQuickAdd: QuickAddRequest | null = null;

export function requestQuickAdd(request: QuickAddRequest): void {
  pendingQuickAdd = request;
  window.dispatchEvent(new Event(WIDGET_QUICK_ADD));
}

export function takeQuickAddRequest(): QuickAddRequest | null {
  const request = pendingQuickAdd;
  pendingQuickAdd = null;
  return request;
}

/** With Google sign-in, what the widget needs to save a tick itself (app closed too). */
function firebaseWidgetAuth() {
  const user = currentUser();
  if (!usingFirebase() || !user || !firebaseConfig?.apiKey || !firebaseConfig.projectId) return null;
  return { apiKey: firebaseConfig.apiKey, projectId: firebaseConfig.projectId, refreshToken: user.refreshToken, uid: user.uid };
}

/** Hands the current tasks (and sign-in) to the home-screen widget. */
export function pushWidgetData(data: AppData): void {
  if (!isNativeApp) return;
  // The widget only lists tasks; calendar events and history are dead weight.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { calendarEvents: _e, calendarFeeds: _f, completionLog: _l, ...rest } = data;
  const { appKey, refreshToken } = getWidgetAuth();
  const firebase = firebaseWidgetAuth();
  void OpravilkoWidget.update({
    data: JSON.stringify(rest),
    appKey,
    refreshToken: firebase ? null : refreshToken,
    dataPath: DATA_PATH,
    firebase,
  }).catch(() => {});
}

/** Signed out: the widget forgets the data and credentials. */
export function clearWidget(): void {
  if (!isNativeApp) return;
  void OpravilkoWidget.clear().catch(() => {});
}

/** Calls `onChange` when the widget wrote to Dropbox (e.g. a task completed from it). */
export function onWidgetDataChanged(onChange: () => void): () => void {
  if (!isNativeApp) return () => {};
  const listener = OpravilkoWidget.addListener("dataChanged", onChange);
  return () => {
    void listener.then((l) => l.remove());
  };
}

/**
 * Turns a widget link into an in-app route, or a quick-add request:
 *   opravilko://open?task=<id>&project=<id>   -> that task, opened
 *   opravilko://open?view=today|upcoming|inbox|project:<id>
 *   opravilko://add?project=<id>[&today=1]
 */
export function parseWidgetLink(url: string): { route: string } | { quickAdd: QuickAddRequest } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "opravilko:") return null;
  // Custom schemes put the "host" in host or, in some engines, the pathname.
  const kind = parsed.host || parsed.pathname.replace(/^\/+/, "");
  const q = parsed.searchParams;
  if (kind === "add") {
    return { quickAdd: { projectId: q.get("project") || "inbox", today: q.get("today") === "1" } };
  }
  if (kind !== "open") return null;
  const task = q.get("task");
  if (task) {
    const project = q.get("project") || "inbox";
    const base = project === "inbox" ? "/app/inbox" : `/app/project/${encodeURIComponent(project)}`;
    return { route: `${base}?open=${encodeURIComponent(task)}` };
  }
  const view = q.get("view") || "today";
  if (view === "today" || view === "upcoming" || view === "inbox") return { route: `/app/${view}` };
  if (view.startsWith("project:")) {
    const id = view.slice("project:".length);
    return { route: id === "inbox" ? "/app/inbox" : `/app/project/${encodeURIComponent(id)}` };
  }
  return { route: "/app/today" };
}
