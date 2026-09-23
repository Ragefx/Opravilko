// Opravilko calendar relay -- a Cloudflare Worker.
//
// Browsers won't let the website download calendar (.ics) files from other
// sites, so it asks this worker to fetch them instead. It only:
//   - answers the Opravilko website (and local development),
//   - fetches http(s) addresses,
//   - passes on files that really are calendars (BEGIN:VCALENDAR),
// so it can't be used as a general-purpose proxy by anyone else.
//
// Use: GET https://<worker address>/?url=<calendar address, URL-encoded>

const ALLOWED_ORIGINS = [
  "https://ragefx.github.io",
  "http://localhost:5173",
  "http://localhost:5174",
];
const MAX_BYTES = 5 * 1024 * 1024;
const CACHE_SECONDS = 15 * 60;

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin",
  };
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response("Not allowed", { status: 403 });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    if (request.method !== "GET") {
      return new Response("Only GET", { status: 405, headers: cors(origin) });
    }

    const target = new URL(request.url).searchParams.get("url");
    let targetUrl;
    try {
      targetUrl = new URL(target || "");
    } catch {
      return new Response("Missing or invalid ?url=", { status: 400, headers: cors(origin) });
    }
    if (targetUrl.protocol !== "https:" && targetUrl.protocol !== "http:") {
      return new Response("Only http(s) addresses", { status: 400, headers: cors(origin) });
    }

    // Same feed asked for again within 15 minutes: answer from Cloudflare's cache.
    const cache = caches.default;
    const cacheKey = new Request(targetUrl.toString(), { method: "GET" });
    let upstream = await cache.match(cacheKey);
    if (!upstream) {
      try {
        upstream = await fetch(targetUrl.toString(), {
          headers: { "User-Agent": "Opravilko calendar relay", Accept: "text/calendar, */*" },
          redirect: "follow",
        });
      } catch (err) {
        return new Response(`Couldn't reach the calendar: ${err}`, { status: 502, headers: cors(origin) });
      }
      if (!upstream.ok) {
        return new Response(`The calendar answered ${upstream.status}`, { status: 502, headers: cors(origin) });
      }
      const text = await upstream.text();
      if (text.length > MAX_BYTES) {
        return new Response("Calendar too large", { status: 413, headers: cors(origin) });
      }
      if (!text.slice(0, 2000).includes("BEGIN:VCALENDAR")) {
        return new Response("That address isn't a calendar (.ics) file", { status: 415, headers: cors(origin) });
      }
      upstream = new Response(text, {
        headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": `max-age=${CACHE_SECONDS}` },
      });
      ctx.waitUntil(cache.put(cacheKey, upstream.clone()));
    }

    const body = await upstream.text();
    return new Response(body, {
      headers: { ...cors(origin), "Content-Type": "text/calendar; charset=utf-8" },
    });
  },
};
