/**
 * Opravilko's helper, on Cloudflare Workers.
 *
 *   POST /ping    {to: [uid], project?: id}   wake these people's phones
 *   GET  /recipe?url=…                         a recipe page's name and ingredients
 *   GET  /addon/projects                       (Gmail add-on) your lists
 *   POST /addon/task    {content, …}           (Gmail add-on) add a task
 *
 * The Gmail add-on signs in with a personal key made in Opravilko (Settings >
 * Import, backup & Gmail): only its SHA-256 is stored, as addonKeys/{hash} -> {uid}.
 *
 * Every other request carries the caller's Firebase sign-in (Authorization: Bearer
 * <ID token>), checked against Google's keys. A ping only reaches someone who
 * named the caller as their partner, or shares the given project with them.
 * The message itself says nothing but "sync": the phone fetches the changes
 * itself, under the usual security rules.
 *
 * Secret: FIREBASE_SERVICE_ACCOUNT, the Firebase service account's JSON key
 * (to send messages and look up the recipient's devices).
 */

export const PROJECT = "opravilko-bdd45";
const ORIGINS = [
  "https://ragefx.github.io",
  "https://localhost", // the Android app
  "capacitor://localhost",
  "http://localhost:5173",
  "http://localhost:5174",
];
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Opravilko-Key",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/") return json({ ok: true, service: "opravilko" }, 200, cors);
      if (url.pathname.startsWith("/addon/")) {
        const uid = await addonUser(env, request.headers.get("X-Opravilko-Key"));
        if (url.pathname === "/addon/projects") return json(await addonProjects(env, uid), 200, cors);
        if (url.pathname === "/addon/task" && request.method === "POST") {
          const body = await request.json().catch(() => ({}));
          return json(await addonTask(env, uid, body), 200, cors);
        }
        return json({ error: "Not found" }, 404, cors);
      }
      const caller = await verifyIdToken(request.headers.get("Authorization"));
      if (url.pathname === "/ping" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        return json(await ping(env, caller, body), 200, cors);
      }
      if (url.pathname === "/recipe" && request.method === "GET") {
        return json(await readRecipe(url.searchParams.get("url") || ""), 200, cors);
      }
      return json({ error: "Not found" }, 404, cors);
    } catch (e) {
      return json({ error: e.message || String(e) }, e.status || 500, cors);
    }
  },
};

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// ---------- base64url and keys ----------

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesToB64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const textB64url = (text) => bytesToB64url(new TextEncoder().encode(text));

// ---------- the caller's Firebase sign-in ----------

const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let jwks = { keys: [], until: 0 };

async function signingKeys(fetchImpl = fetch) {
  if (Date.now() < jwks.until) return jwks.keys;
  const res = await fetchImpl(JWKS_URL);
  if (!res.ok) throw fail(503, "Couldn't fetch Google's keys");
  const maxAge = Number((res.headers.get("Cache-Control") || "").match(/max-age=(\d+)/)?.[1] || 3600);
  jwks = { keys: (await res.json()).keys || [], until: Date.now() + maxAge * 1000 };
  return jwks.keys;
}

/** The signed-in user's id, from a Firebase ID token; throws 401 if it isn't valid. */
export async function verifyIdToken(header, { fetchImpl = fetch, now = Date.now() } = {}) {
  const token = (header || "").replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) throw fail(401, "Not signed in");
  let head, claims;
  try {
    head = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
  } catch {
    throw fail(401, "Bad sign-in token");
  }
  if (head.alg !== "RS256") throw fail(401, "Bad sign-in token");
  const jwk = (await signingKeys(fetchImpl)).find((k) => k.kid === head.kid);
  if (!jwk) throw fail(401, "Unknown sign-in key");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  const seconds = Math.floor(now / 1000);
  if (
    !ok ||
    claims.aud !== PROJECT ||
    claims.iss !== `https://securetoken.google.com/${PROJECT}` ||
    !(claims.exp > seconds) ||
    !(claims.iat <= seconds + 300) ||
    typeof claims.sub !== "string" ||
    !claims.sub
  ) {
    throw fail(401, "Sign-in not valid");
  }
  return claims.sub;
}

// ---------- Google access for the worker itself (service account) ----------

let access = { token: "", until: 0 };

function pemToDer(pem) {
  return b64urlToBytes(
    pem
      .replace(/-----[^-]+-----/g, "")
      .replace(/\s+/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
  );
}

/** A signed request for an access token (exported for the tests). */
export async function serviceAssertion(account, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const head = textB64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = textB64url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      iat,
      exp: iat + 3600,
    })
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claims}`));
  return `${head}.${claims}.${bytesToB64url(sig)}`;
}

async function accessToken(env) {
  if (access.token && Date.now() < access.until) return access.token;
  if (!env.FIREBASE_SERVICE_ACCOUNT) throw fail(503, "Not set up yet (FIREBASE_SERVICE_ACCOUNT missing)");
  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${await serviceAssertion(account)}`,
  });
  if (!res.ok) throw fail(503, `Google access refused (${res.status})`);
  const data = await res.json();
  access = { token: data.access_token, until: Date.now() + (Number(data.expires_in) - 120) * 1000 };
  return access.token;
}

async function firestoreGet(env, path) {
  const res = await fetch(`${FIRESTORE}/${path}`, { headers: { Authorization: `Bearer ${await accessToken(env)}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw fail(502, `Reading ${path} failed (${res.status})`);
  return res.json();
}

// ---------- ping ----------

async function mayPing(env, caller, to, project) {
  const profile = await firestoreGet(env, `users/${encodeURIComponent(to)}`);
  if (profile?.fields?.partner?.mapValue?.fields?.uid?.stringValue === caller) return true;
  if (!project) return false;
  const doc = await firestoreGet(env, `projects/${encodeURIComponent(project)}`);
  const members = (doc?.fields?.members?.arrayValue?.values || []).map((v) => v.stringValue);
  return members.includes(caller) && members.includes(to);
}

async function ping(env, caller, body) {
  const to = [...new Set(Array.isArray(body.to) ? body.to : [])]
    .filter((u) => typeof u === "string" && u && (u !== caller || body.self === true))
    .slice(0, 5);
  const project = typeof body.project === "string" ? body.project : "";
  let sent = 0;
  for (const uid of to) {
    if (uid !== caller && !(await mayPing(env, caller, uid, project))) continue;
    const list = await firestoreGet(env, `users/${encodeURIComponent(uid)}/devices?pageSize=20`);
    for (const device of list?.documents || []) {
      const token = device.fields?.token?.stringValue;
      if (!token) continue;
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${PROJECT}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await accessToken(env)}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            data: { kind: "sync", from: caller },
            android: { priority: "HIGH", ttl: "900s", collapse_key: "sync" },
          },
        }),
      });
      if (res.ok) sent++;
      // A phone that uninstalled the app (or a token that changed): forget it.
      else if (res.status === 404 || res.status === 400) {
        await fetch(`https://firestore.googleapis.com/v1/${device.name}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${await accessToken(env)}` },
        }).catch(() => {});
      }
    }
  }
  return { sent };
}

// ---------- recipes ----------

/** The recipe on a web page, from its schema.org data (what search engines read). */
export async function readRecipe(address, fetchImpl = fetch) {
  let url;
  try {
    url = new URL(address);
  } catch {
    throw fail(400, "That isn't a web address");
  }
  if (!/^https?:$/.test(url.protocol)) throw fail(400, "That isn't a web address");
  const res = await fetchImpl(url.toString(), {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Opravilko recipe reader)", Accept: "text/html" },
    redirect: "follow",
  });
  if (!res.ok) throw fail(502, `The page didn't open (${res.status})`);
  const html = (await res.text()).slice(0, 3_000_000);
  const recipe = findRecipe(html);
  if (!recipe) throw fail(422, "No recipe found on that page");
  return recipe;
}

export function findRecipe(html) {
  const blocks = html.match(/<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of blocks) {
    const text = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      continue;
    }
    const found = pickRecipe(data);
    if (found) {
      const ingredients = (found.recipeIngredient || found.ingredients || [])
        .map((i) => decode(String(i)).replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 60);
      if (!ingredients.length) continue;
      const yieldText = Array.isArray(found.recipeYield) ? found.recipeYield[0] : found.recipeYield;
      return {
        name: decode(String(found.name || "Recipe")).trim().slice(0, 120),
        ingredients,
        servings: yieldText ? String(yieldText).slice(0, 40) : "",
      };
    }
  }
  return null;
}

function pickRecipe(node) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = pickRecipe(n);
      if (r) return r;
    }
    return null;
  }
  const type = node["@type"];
  if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) return node;
  return pickRecipe(node["@graph"]) || pickRecipe(node.mainEntity);
}

function decode(s) {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// ---------- the Gmail add-on ----------

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function addonUser(env, key) {
  if (!key || key.length < 20) throw fail(401, "No Opravilko key: make one in Opravilko, Settings > Import, backup & Gmail");
  const doc = await firestoreGet(env, `addonKeys/${await sha256Hex(key.trim())}`);
  const uid = doc?.fields?.uid?.stringValue;
  if (!uid) throw fail(401, "That key isn't valid any more: make a new one in Opravilko");
  return uid;
}

/** Firestore's typed values, from plain JSON. */
export function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, toValue(x)])) } };
}

function fromValue(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromValue(x)]));
  return null;
}

async function myProjects(env, uid) {
  const res = await fetch(`${FIRESTORE}:runQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(env)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "projects" }],
        where: { fieldFilter: { field: { fieldPath: "members" }, op: "ARRAY_CONTAINS", value: { stringValue: uid } } },
      },
    }),
  });
  if (!res.ok) throw fail(502, `Reading your lists failed (${res.status})`);
  const rows = await res.json();
  return rows
    .filter((r) => r.document)
    .map((r) => ({ id: r.document.name.split("/").pop(), ...fromValue({ mapValue: { fields: r.document.fields } }) }))
    .filter((p) => !p.isInboxProject || p.id === `inbox_${uid}`);
}

/** Your lists for the add-on's picker: the Inbox first, then by the app's order. */
async function addonProjects(env, uid) {
  const projects = await myProjects(env, uid);
  const profile = await firestoreGet(env, `users/${encodeURIComponent(uid)}`);
  const partner = profile?.fields?.partner ? fromValue(profile.fields.partner) : null;
  return {
    projects: projects
      .sort((a, b) => (b.isInboxProject ? 1 : 0) - (a.isInboxProject ? 1 : 0) || (a.order ?? 0) - (b.order ?? 0))
      .map((p) => ({ id: p.id, name: p.isInboxProject ? "Inbox" : p.name || "List", shopping: p.viewStyle === "shopping" })),
    partner: partner?.uid ? { uid: partner.uid, name: String(partner.name || "").split(" ")[0] } : null,
  };
}

function newId() {
  const abc = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";
  const bytes = crypto.getRandomValues(new Uint8Array(21));
  return [...bytes].map((b) => abc[b & 63]).join("");
}

/**
 * Adds a task as the app would (same fields), to one of your lists; shared
 * with your partner if asked. Then both phones get a nudge to show it.
 */
export async function addonTask(env, uid, body, { write = firestoreCreate, nudge = ping } = {}) {
  const content = String(body.content || "").trim().slice(0, 500);
  if (!content) throw fail(400, "The task needs a name");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? body.date : null;
  const datetime = date && typeof body.datetime === "string" && !Number.isNaN(Date.parse(body.datetime)) ? body.datetime : null;
  let projectId = typeof body.projectId === "string" && body.projectId ? body.projectId : `inbox_${uid}`;
  let partner = null;
  let members = [uid];
  const projects = await myProjects(env, uid);
  const project = projects.find((p) => p.id === projectId);
  if (!project) projectId = `inbox_${uid}`;
  else members = project.members || [uid];
  if (body.shared) {
    const profile = await firestoreGet(env, `users/${encodeURIComponent(uid)}`);
    const p = profile?.fields?.partner ? fromValue(profile.fields.partner) : null;
    if (p?.uid) partner = p;
  }
  const now = new Date().toISOString();
  const id = newId();
  const task = {
    content,
    description: String(body.description || "").slice(0, 5000),
    projectId,
    sectionId: null,
    parentId: null,
    order: Math.floor(Date.now() / 1000),
    priority: 1,
    due: date ? { date, string: String(body.dueLabel || date), isRecurring: false, ...(datetime ? { datetime } : {}) } : null,
    labels: [],
    completed: false,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    archived: false,
    createdBy: uid,
    ...(/^\d{4}-\d{2}-\d{2}$/.test(body.deadline || "") ? { deadline: body.deadline } : {}),
    ...(partner
      ? {
          sharedWith: [partner.uid],
          sharedBy: await myPartnerProfile(env, uid),
        }
      : {}),
  };
  await write(env, `tasks?documentId=${id}`, task);
  // Your phones and whoever shares it: show it now.
  const to = [...new Set([uid, ...members, ...(partner ? [partner.uid] : [])])];
  await nudge(env, uid, { to, project: projectId, self: true }).catch(() => {});
  return { id, projectId, list: project?.isInboxProject || !project ? "Inbox" : project.name };
}

async function myPartnerProfile(env, uid) {
  const me = await firestoreGet(env, `users/${encodeURIComponent(uid)}`);
  const f = me?.fields ? fromValue({ mapValue: { fields: me.fields } }) : {};
  return { uid, name: f.name || "", email: f.email || "", photo: f.photo ?? null };
}

async function firestoreCreate(env, path, data) {
  const res = await fetch(`${FIRESTORE}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(env)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toValue(data).mapValue.fields }),
  });
  if (!res.ok) throw fail(502, `Saving the task failed (${res.status})`);
}
