import { currentUser } from "../firebase/auth";

/**
 * Opravilko's helper on Cloudflare (worker/ in the repo): wakes your
 * partner's phone when something shared changes, and reads recipes from web
 * pages. On the owner's Cloudflare account (cloudsan-29b, as the calendar
 * relay), deployed by .github/workflows/worker.yml.
 */
export const HELPER_URL: string = "https://opravilko.cloudsan-29b.workers.dev";

export const helperReady = () => HELPER_URL !== "" && currentUser() !== null;

export async function callHelper(path: string, init: RequestInit = {}): Promise<Response> {
  const user = currentUser();
  if (!HELPER_URL || !user) throw new Error("Not available");
  const token = await user.getIdToken();
  return fetch(`${HELPER_URL}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
}

// Changes come in bursts (ticking off several items): one ping a moment later covers them.
let pending: { to: Set<string>; project?: string; full: boolean; self: boolean; timer: number } | null = null;

/**
 * Tells these people's phones to fetch the latest (they show what changed
 * themselves). `full`: something was deleted, which only a full fetch notices.
 */
export function pingLater(to: string[], project?: string, full = false, self = false) {
  const me = currentUser()?.uid;
  if (!HELPER_URL || (to.length === 0 && !self) || (self && !me)) return;
  if (!pending) pending = { to: new Set(), full: false, self: false, timer: window.setTimeout(flush, 1500) };
  to.forEach((u) => pending!.to.add(u));
  if (self && me) pending.to.add(me);
  if (project) pending.project = project;
  pending.full ||= full;
  pending.self ||= self;
}

function flush() {
  const p = pending;
  pending = null;
  if (!p) return;
  const what = `Sent a nudge (${p.self ? "website" : "app"} change${p.full ? ", deleted" : ""})`;
  void callHelper("/ping", {
    method: "POST",
    body: JSON.stringify({ to: [...p.to], project: p.project, full: p.full, self: p.self }),
  })
    .then(async (res) => logNudge(`${what}: ${res.status} ${(await res.text()).slice(0, 200)}`))
    .catch((e: unknown) => logNudge(`Couldn't send a nudge: ${e instanceof Error ? e.message : String(e)}`));
}

// ---------- the nudge log (Settings > About > Instant updates) ----------

const LOG_KEY = "opravilko.nudgeLog";

function logNudge(line: string) {
  try {
    const d = new Date();
    const stamp = `${d.getDate()}.${d.getMonth() + 1}. ${d.toTimeString().slice(0, 8)}`;
    const was = JSON.parse(localStorage.getItem(LOG_KEY) || "[]") as string[];
    localStorage.setItem(LOG_KEY, JSON.stringify([`${stamp}  ${line}`, ...was].slice(0, 30)));
  } catch {
    /* storage blocked */
  }
}

/** The nudges this device sent from the app (the phone's own widget log is added by the caller). */
export function nudgeLog(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}
