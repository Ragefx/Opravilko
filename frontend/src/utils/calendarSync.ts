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

export const CORS_PROXY_NAME = "codetabs.com";

/**
 * Relays tried in order, each named so a failure says which one refused.
 * corsproxy.io rejects anonymous requests outright (HTTP 401, it now wants
 * a registered origin/API key), and allorigins.win has started failing the
 * same way for some targets (Google's servers in particular). codetabs is
 * primary since it's held up for both; the other two stay as fallbacks in
 * case it's ever down instead.
 */
const PROXIES: { name: string; url: (feedUrl: string) => string }[] = [
  { name: "codetabs.com", url: (feedUrl) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(feedUrl)}` },
  { name: "allorigins.win", url: (feedUrl) => `https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl)}` },
  { name: "corsproxy.io", url: (feedUrl) => `https://corsproxy.io/?url=${encodeURIComponent(feedUrl)}` },
];

export function proxiedUrl(feedUrl: string): string {
  return PROXIES[0].url(feedUrl);
}

export async function fetchIcsText(feedUrl: string): Promise<string> {
  const failures: string[] = [];
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy.url(feedUrl));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.includes("BEGIN:VCALENDAR")) throw new Error("not an iCal feed");
      return text;
    } catch (e) {
      failures.push(`${proxy.name}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }
  throw new Error(`All relays failed -- ${failures.join("; ")}`);
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
