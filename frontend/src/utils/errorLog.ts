import { collection, deleteDoc, doc, getDocs, limit, orderBy, query, setDoc } from "firebase/firestore";
import { nanoid } from "nanoid";
import { currentUser } from "../firebase/auth";
import { firestore } from "../firebase/app";
import { isNativeApp } from "../dropbox/auth";

/**
 * Errors the app hit, so a crash on the phone can be looked at later:
 * kept on this device and, when signed in with Google, in your account
 * (users/{uid}/errors), so the website shows the phone's too. Settings >
 * About lists them.
 */
export interface ErrorEntry {
  id: string;
  at: string;
  message: string;
  stack: string;
  /** "crash" (the page stopped) or "error" (something failed, the page carried on). */
  kind: "crash" | "error";
  page: string;
  device: "android" | "web";
  version: string;
}

const LOCAL_KEY = "opravilko.errors";
const KEEP = 20;
let lastMessage = "";
let lastAt = 0;

function readLocal(): ErrorEntry[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]") as ErrorEntry[];
  } catch {
    return [];
  }
}

export function logError(error: unknown, kind: ErrorEntry["kind"] = "error") {
  const err = error instanceof Error ? error : new Error(String(error));
  const message = err.message || String(error);
  // The same error over and over (e.g. in a loop) is kept once.
  if (message === lastMessage && Date.now() - lastAt < 60_000) return;
  lastMessage = message;
  lastAt = Date.now();
  const entry: ErrorEntry = {
    id: nanoid(10),
    at: new Date().toISOString(),
    message: message.slice(0, 500),
    stack: (err.stack || "").slice(0, 2000),
    kind,
    page: location.hash || location.pathname,
    device: isNativeApp ? "android" : "web",
    version: `${__COMMIT__ || "dev"}`,
  };
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify([entry, ...readLocal()].slice(0, KEEP)));
  } catch {
    /* storage full or blocked */
  }
  const user = currentUser();
  if (user) void setDoc(doc(firestore(), "users", user.uid, "errors", entry.id), entry).catch(() => {});
}

/** The latest errors: from your account when signed in with Google, else this device's. */
export async function loadErrors(): Promise<ErrorEntry[]> {
  const user = currentUser();
  const local = readLocal();
  if (!user) return local;
  try {
    const snap = await getDocs(query(collection(firestore(), "users", user.uid, "errors"), orderBy("at", "desc"), limit(KEEP)));
    const remote = snap.docs.map((d) => d.data() as ErrorEntry);
    const seen = new Set(remote.map((e) => e.id));
    return [...remote, ...local.filter((e) => !seen.has(e.id))].sort((a, b) => b.at.localeCompare(a.at)).slice(0, KEEP);
  } catch {
    return local;
  }
}

export async function clearErrors(entries: ErrorEntry[]) {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* ignore */
  }
  const user = currentUser();
  if (user) await Promise.all(entries.map((e) => deleteDoc(doc(firestore(), "users", user.uid, "errors", e.id)).catch(() => {})));
}

/** Errors outside React (a failed promise, a script error) are logged too. */
export function installErrorLog() {
  window.addEventListener("error", (e) => {
    // A resource that failed to load, or the browser's harmless ResizeObserver notice.
    if (!e.error && /ResizeObserver/.test(e.message || "")) return;
    logError(e.error ?? e.message);
  });
  window.addEventListener("unhandledrejection", (e) => logError(e.reason));
}
