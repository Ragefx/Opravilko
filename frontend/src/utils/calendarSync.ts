/**
 * Browsers block cross-origin fetches unless the server opts in (CORS), and
 * most .ics feeds (Google Calendar's private export links, TV listing
 * sites, ...) don't. With no backend of our own to fetch through instead,
 * the only way to load them client-side is via a public CORS relay -- the
 * feed URL (which for a private Google Calendar link includes a secret
 * token) passes through that third party's server on every sync. The user
 * has explicitly accepted that trade-off; this is named plainly so it's
 * never a surprise later, and surfaced in the "Add calendar" UI.
 */
import type { CalendarEvent, CalendarFeed } from "../api/types";

export const CORS_PROXY_NAME = "allorigins.win";

/**
 * Relays tried in order. corsproxy.io started rejecting anonymous requests
 * with HTTP 401 (it now wants a registered origin/API key), so allorigins
 * is primary and corsproxy.io stays as a fallback in case allorigins is
 * ever down instead.
 */
const PROXIES: ((feedUrl: string) => string)[] = [
  (feedUrl) => `https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl)}`,
  (feedUrl) => `https://corsproxy.io/?url=${encodeURIComponent(feedUrl)}`,
];

export function proxiedUrl(feedUrl: string): string {
  return PROXIES[0](feedUrl);
}

export async function fetchIcsText(feedUrl: string): Promise<string> {
  let lastError: unknown;
  for (const toProxyUrl of PROXIES) {
    try {
      const res = await fetch(toProxyUrl(feedUrl));
      if (!res.ok) throw new Error(`Feed request failed (HTTP ${res.status})`);
      const text = await res.text();
      if (!text.includes("BEGIN:VCALENDAR")) throw new Error("That URL doesn't look like an iCal (.ics) feed");
      return text;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Sync failed");
}

/** Buckets events from enabled feeds by their "yyyy-MM-dd" date, sorted by start time. */
export function groupEventsByDate(
  events: CalendarEvent[] | undefined,
  feeds: CalendarFeed[] | undefined
): Map<string, CalendarEvent[]> {
  const enabledFeedIds = new Set((feeds || []).filter((f) => f.enabled).map((f) => f.id));
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events || []) {
    if (!enabledFeedIds.has(e.feedId)) continue;
    if (!map.has(e.date)) map.set(e.date, []);
    map.get(e.date)!.push(e);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  }
  return map;
}
