/**
 * Browsers block cross-origin fetches unless the server opts in (CORS), and
 * most .ics feeds (Google Calendar, TV listing sites, ...) don't. So the
 * website fetches them through our own relay -- a small Cloudflare Worker
 * (cloudflare/calendar-relay.js) that only answers this site and only passes
 * on real calendars. The free public relays stay as a fallback in case ours
 * is ever unreachable; they're shared by everyone, so they're often busy.
 */
import { CapacitorHttp } from "@capacitor/core";
import type { CalendarEvent, CalendarFeed } from "../api/types";
import { isNativeApp } from "../dropbox/auth";

/** Our own relay (see cloudflare/calendar-relay.js). */
const OWN_RELAY = "https://opravilko-calendar.cloudsan-29b.workers.dev/";

export const CORS_PROXY_NAME = "Opravilko's own relay on Cloudflare";

/**
 * Relays tried in order, each named so a failure says which one refused.
 * Ours first; then the public ones.
 * corsproxy.io rejects anonymous requests outright (HTTP 401, it now wants
 * a registered origin/API key), and allorigins.win has started failing the
 * same way for some targets (Google's servers in particular). codetabs is
 * primary since it's held up for both; the other two stay as fallbacks in
 * case it's ever down instead.
 */
const PROXIES: { name: string; url: (feedUrl: string) => string }[] = [
  { name: "own relay", url: (feedUrl) => `${OWN_RELAY}?url=${encodeURIComponent(feedUrl)}` },
  { name: "codetabs.com", url: (feedUrl) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(feedUrl)}` },
  { name: "allorigins.win", url: (feedUrl) => `https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl)}` },
  { name: "corsproxy.io", url: (feedUrl) => `https://corsproxy.io/?url=${encodeURIComponent(feedUrl)}` },
];

export function proxiedUrl(feedUrl: string): string {
  return PROXIES[0].url(feedUrl);
}

/**
 * Thrown when no relay could be reached at all (no answer, not even an
 * error) -- the device is offline or just waking from sleep, so the feed
 * itself isn't at fault.
 */
export class NoConnectionError extends Error {}

export async function fetchIcsText(feedUrl: string): Promise<string> {
  // The Android app isn't bound by browser CORS rules, so it fetches feeds
  // directly -- no third-party relay sees the URL.
  if (isNativeApp) {
    const res = await CapacitorHttp.get({ url: feedUrl, responseType: "text" });
    if (res.status < 200 || res.status >= 300) throw new Error(`Feed request failed (HTTP ${res.status})`);
    const text = typeof res.data === "string" ? res.data : String(res.data ?? "");
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("That URL doesn't look like an iCal (.ics) feed");
    return text;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new NoConnectionError("You're offline -- the calendar will refresh once you're back online.");
  }
  const failures: string[] = [];
  let answered = false;
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy.url(feedUrl));
      answered = true;
      if (!res.ok) {
        const reason = (await res.text().catch(() => "")).slice(0, 120);
        throw new Error(`HTTP ${res.status}${reason && proxy === PROXIES[0] ? ` (${reason})` : ""}`);
      }
      const text = await res.text();
      if (!text.includes("BEGIN:VCALENDAR")) throw new Error("not an iCal feed");
      return text;
    } catch (e) {
      failures.push(`${proxy.name}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }
  if (!answered) {
    throw new NoConnectionError(
      "Couldn't connect to any relay -- check the internet connection (or an ad blocker blocking workers.dev)."
    );
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
