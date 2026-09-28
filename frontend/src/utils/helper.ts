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
let pending: { to: Set<string>; project?: string; timer: number } | null = null;

/** Tells these people's phones to fetch the latest (they show what changed themselves). */
export function pingLater(to: string[], project?: string) {
  if (!HELPER_URL || to.length === 0) return;
  if (!pending) pending = { to: new Set(), timer: window.setTimeout(flush, 1500) };
  to.forEach((u) => pending!.to.add(u));
  if (project) pending.project = project;
}

function flush() {
  const p = pending;
  pending = null;
  if (!p) return;
  void callHelper("/ping", { method: "POST", body: JSON.stringify({ to: [...p.to], project: p.project }) }).catch(() => {
    // Offline: the other phone's regular check picks it up later.
  });
}
