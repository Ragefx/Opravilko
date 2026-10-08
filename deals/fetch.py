"""Reads this week's deals at Hofer, Lidl and Tuš (Spar: see below) and saves them to
Firestore (deals/current), where the app's Shopping page finds them.

Run by .github/workflows/deals.yml twice a day. Needs the repository secret
FIREBASE_SERVICE_ACCOUNT (the same one the Cloudflare helper uses). With
--dry it only prints what it found.

A shop whose page can't be read keeps its deals from the last run (until
they end), so one shop changing its website doesn't empty the list.
"""

import datetime as dt
import html
import json
import os
import re
import sys
import time
from zoneinfo import ZoneInfo

from curl_cffi import requests

TZ = ZoneInfo("Europe/Ljubljana")
DOC = "https://firestore.googleapis.com/v1/projects/opravilko-bdd45/databases/(default)/documents/deals/current"

# The shops block plain scripts; this one looks like a normal Chrome.
web = requests.Session(impersonate="chrome")


def get(url):
    for attempt in range(3):
        try:
            r = web.get(url, timeout=40, headers={"Accept-Language": "sl-SI,sl;q=0.9"})
            if r.status_code == 200:
                return r.text
            print(f"  {url}: HTTP {r.status_code}", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            print(f"  {url}: {e}", file=sys.stderr)
        time.sleep(3 * (attempt + 1))
    return None


def euros(text):
    m = re.search(r"(\d+(?:[.,]\d{1,2})?)", text or "")
    return float(m.group(1).replace(",", ".")) if m else None


def day(ts):
    return dt.datetime.fromtimestamp(ts, TZ).date().isoformat() if ts else None


def deal(shop, name, price, old=None, pct=None, size=None, start=None, end=None, url=None):
    name = re.sub(r"\s+", " ", html.unescape(name or "")).strip().lstrip("-–• ").strip()
    if not name or not price:
        return None
    if old and old <= price:
        old = None
    if not pct and old:
        pct = round((1 - price / old) * 100)
    d = {"s": shop, "n": name, "p": round(price, 2)}
    for k, v in (("o", old), ("d", pct), ("q", size), ("f", start), ("t", end), ("u", url)):
        if v:
            d[k] = round(v, 2) if isinstance(v, float) else v
    return d


# ---- Lidl: every product tile carries its data as JSON (data-grid-data) ----

def lidl():
    home = get("https://www.lidl.si/")
    if not home:
        return None
    pages = set(re.findall(r'href="(?:https://www\.lidl\.si)?(/c/[^"/]+/a\d+)"', home))
    pages |= {p for p in re.findall(r'href="(?:https://www\.lidl\.si)?(/c/[^"/]+/s\d+)"', home)
              if re.search(r"ponudba|trznica|pekarna|hrana|znizujemo", p)}
    out, seen = [], set()
    for path in sorted(pages):
        page = get("https://www.lidl.si" + path)
        for raw in re.findall(r'data-grid-data="([^"]+)"', page or ""):
            try:
                t = json.loads(html.unescape(raw))
            except ValueError:
                continue
            if (t.get("keyfacts") or {}).get("analyticsCategory") != "Food":
                continue
            pid = t.get("productId")
            if pid in seen:
                continue
            seen.add(pid)
            pr = t.get("price") or {}
            disc = pr.get("discount") or {}
            d = deal(
                "Lidl",
                t.get("fullTitle"),
                pr.get("price"),
                old=pr.get("oldPrice") or disc.get("deletedPrice"),
                pct=disc.get("percentageDiscount"),
                size=(pr.get("packaging") or {}).get("text"),
                start=day(t.get("storeStartDate")),
                end=day(t.get("storeEndDate")),
                url="https://www.lidl.si" + t["canonicalUrl"] if t.get("canonicalUrl") else None,
            )
            if d:
                out.append(d)
    return out


# ---- Tuš: a WordPress list of products with "Redna cena" (the usual price) ----

def tus():
    out, seen = [], set()
    for base in ("https://www.tus.si/aktualno/akcijska-ponudba/",
                 "https://www.tus.si/aktualno/akcijska-ponudba/aktualno-iz-kataloga/"):
        first = get(base)
        if not first:
            continue
        last = max([int(n) for n in re.findall(r"/page/(\d+)/", first)] or [1])
        for n in range(1, min(last, 40) + 1):
            page = first if n == 1 else get(f"{base}page/{n}/")
            if not page:
                continue
            m = re.search(r"velja do (\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})", page)
            end = dt.date(int(m.group(3)), int(m.group(2)), int(m.group(1))).isoformat() if m else None
            for chunk in page.split("<h3>")[1:]:
                a = re.match(r'\s*<a href="([^"]+)">([^<]+)</a>\s*</h3>', chunk)
                price = re.search(r'<span class="price">\s*([\d.,]+)\s*€', chunk)
                if not a or not price or a.group(1) in seen:
                    continue
                seen.add(a.group(1))
                old = re.search(r"Redna cena:\s*([\d.,]+)\s*€", chunk)
                d = deal("Tuš", a.group(2), euros(price.group(1)), old=euros(old.group(1)) if old else None,
                         end=end, url=a.group(1))
                if d:
                    out.append(d)
    return out


# ---- Hofer: the special offers' product tiles ----

HOFER_LIST = "https://www.hofer.si/izdelki/pregled-posebne-ponudbe/k/1588161418378530"


def hofer():
    first = get(HOFER_LIST)
    if not first:
        return None
    last = max([int(n) for n in re.findall(r"\?page=(\d+)", first)] or [1])
    out, seen = [], set()
    for n in range(1, min(last, 20) + 1):
        page = first if n == 1 else get(f"{HOFER_LIST}?page={n}")
        for tile in re.split(r'<div id="product-tile-', page or "")[1:]:
            pid = tile[:20]
            if pid in seen:
                continue
            seen.add(pid)
            name = re.search(r'class="product-tile__name"[^>]*>\s*<p[^>]*>([^<]+)', tile)
            price = re.search(r'base-price__regular[^>]*>\s*<span>([^<]+)', tile)
            if not name or not price:
                continue
            old = re.search(r'base-price__(?:strikethrough|was|old|original|crossed)[a-z_-]*[^>]*>(?:\s*<[^>]+>)*\s*([\d.,]+)\s*€', tile)
            pct = re.search(r'base-price__discount-tag[^>]*>(?:\s*<[^>]+>)*\s*-\s*(\d+)\s*%', tile)
            size = re.search(r'product-tile__unit-of-measurement[^>]*>\s*<p>([^<]+)', tile)
            start = re.search(r"na voljo od (\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})", tile, re.I)
            href = re.search(r'href="(/izdelek/[^"]+)"', tile)
            d = deal(
                "Hofer",
                name.group(1),
                euros(price.group(1)),
                old=euros(old.group(1)) if old else None,
                pct=int(pct.group(1)) if pct else None,
                size=size.group(1).strip() if size else None,
                start=dt.date(int(start.group(3)), int(start.group(2)), int(start.group(1))).isoformat() if start else None,
                url="https://www.hofer.si" + href.group(1) if href else None,
            )
            if d:
                out.append(d)
    return out


# Spar: its online shop loads products from a service that refuses outside
# visitors (INVALID_HEADERS), and www.spar.si sits behind a bot check, so
# Spar isn't read yet.

SHOPS = {"Hofer": hofer, "Lidl": lidl, "Tuš": tus}


def firestore_session():
    from google.auth.transport.requests import AuthorizedSession
    from google.oauth2 import service_account

    info = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT"])
    creds = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/datastore"])
    return AuthorizedSession(creds)


def main():
    dry = "--dry" in sys.argv
    fs = None if dry else firestore_session()
    previous = []
    if fs:
        r = fs.get(DOC)
        if r.ok:
            try:
                previous = json.loads(r.json()["fields"]["json"]["stringValue"])
            except (KeyError, ValueError):
                previous = []
    today = dt.datetime.now(TZ).date().isoformat()
    deals, report = [], {}
    for shop, read in SHOPS.items():
        try:
            found = read()
        except Exception as e:  # noqa: BLE001
            print(f"{shop}: {e!r}", file=sys.stderr)
            found = None
        if not found:
            # Keep what we had, while it lasts.
            found = [d for d in previous if d["s"] == shop and (not d.get("t") or d["t"] >= today)]
            report[shop] = f"kept {len(found)}"
        else:
            report[shop] = len(found)
        deals += [d for d in found if not d.get("t") or d["t"] >= today]
    print(json.dumps(report, ensure_ascii=False))
    if dry:
        for d in deals[:15] + [d for d in deals if d.get("o")][:15]:
            print(json.dumps(d, ensure_ascii=False))
        return
    body = {
        "fields": {
            "json": {"stringValue": json.dumps(deals, ensure_ascii=False, separators=(",", ":"))},
            "updated": {"stringValue": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")},
            "shops": {"stringValue": json.dumps(report, ensure_ascii=False)},
        }
    }
    r = fs.patch(DOC, json=body)
    print("saved" if r.ok else f"save failed: {r.status_code} {r.text[:300]}")
    if not r.ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
