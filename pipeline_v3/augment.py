"""Pipeline v3 multi-source augmentation — the free legs of discovery.

For each scraped vendor, query the free registries/open-data sources the
product page promises (Wikidata, OpenCorporates, EPA ECHO, OpenStreetMap)
and attach a compact REGISTRY DATA block to the cache payload. The Haiku
synthesis step then grounds the profile in website text + registry facts.

Also: an OpenRouter triage pass (cheap — uses existing credit) that flags
junk records (PDF artifacts, event pages, subpages-as-companies) so they
are routed to the admin sleep queue instead of being enriched. No vendor
rows are ever deleted.

Usage:  python augment.py [limit]        # augment 'scraped' vendors in place
"""
from __future__ import annotations

import csv
import io
import json
import os
import re
import sys
import time
from pathlib import Path

import httpx

import state

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CACHE_DIR = Path(__file__).resolve().parent / "cache"
TIMEOUT = 10.0
UA = {"User-Agent": "AVLpointBot/1.0 (+https://avlpoint.com)"}


def _env(name: str) -> str:
    v = os.getenv(name, "")
    if not v:
        env_file = Path(__file__).resolve().parent.parent / ".env"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith(name + "="):
                    v = line.split("=", 1)[1].strip()
                    break
    return v


# ---------------- free sources (all optional, all fail-soft) ----------------

def wikidata(client: httpx.Client, name: str) -> dict | None:
    """Free, no key. Entity search + core claims."""
    try:
        r = client.get(
            "https://www.wikidata.org/w/api.php",
            params={"action": "wbsearchentities", "search": name, "language": "en",
                    "type": "item", "limit": 1, "format": "json"},
        )
        hits = r.json().get("search", [])
        if not hits:
            return None
        qid = hits[0]["id"]
        r = client.get(
            "https://www.wikidata.org/w/api.php",
            params={"action": "wbgetentities", "ids": qid, "props": "claims|descriptions",
                    "languages": "en", "format": "json"},
        )
        ent = r.json()["entities"][qid]
        claims = ent.get("claims", {})

        def _time(prop):
            try:
                return claims[prop][0]["mainsnak"]["datavalue"]["value"]["time"][1:5]
            except (KeyError, IndexError, TypeError):
                return None

        def _qty(prop):
            try:
                return claims[prop][0]["mainsnak"]["datavalue"]["value"]["amount"].lstrip("+")
            except (KeyError, IndexError, TypeError):
                return None

        out = {
            "qid": qid,
            "description": ent.get("descriptions", {}).get("en", {}).get("value"),
            "inception_year": _time("P571"),
            "employees": _qty("P1128"),
        }
        return {k: v for k, v in out.items() if v} or None
    except Exception:
        return None


_OC_DISABLED = False  # flipped once a 401 proves there is no usable token


def opencorporates(client: httpx.Client, name: str) -> dict | None:
    """Company registry. Requires OPENCORPORATES_API_TOKEN — the anonymous
    tier now 401s, so without a token we skip permanently (no wasted calls)."""
    global _OC_DISABLED
    if _OC_DISABLED:
        return None
    token = _env("OPENCORPORATES_API_TOKEN")
    if not token:
        _OC_DISABLED = True
        return None
    try:
        r = client.get(
            "https://api.opencorporates.com/v0.4/companies/search",
            params={"q": name, "per_page": 1, "order": "score", "api_token": token},
        )
        if r.status_code in (401, 403):
            _OC_DISABLED = True
            return None
        if r.status_code != 200:
            return None
        results = r.json().get("results", {}).get("companies", [])
        if not results:
            return None
        c = results[0]["company"]
        out = {
            "legal_name": c.get("name"),
            "jurisdiction": c.get("jurisdiction_code"),
            "company_number": c.get("company_number"),
            "incorporation_date": c.get("incorporation_date"),
            "status": c.get("current_status"),
            "registered_address": (c.get("registered_address_in_full") or "")[:200] or None,
        }
        return {k: v for k, v in out.items() if v} or None
    except Exception:
        return None


def epa_echo(client: httpx.Client, name: str, st: str | None) -> dict | None:
    """Free EPA facility registry — confirms a real industrial facility and
    yields NAICS/SIC codes. TWO-STEP API: get_facilities returns a QueryID +
    row count, then get_download returns the actual rows for that QueryID."""
    base = "https://echodata.epa.gov/echo/echo_rest_services"
    try:
        params = {"output": "JSON", "p_fn": name, "responseset": "1"}
        if st:
            params["p_st"] = st
        r = client.get(f"{base}.get_facilities", params=params)
        if r.status_code != 200:
            return None
        res = r.json().get("Results", {})
        qid = res.get("QueryID")
        rows = int(res.get("QueryRows") or 0)
        if not qid or rows == 0:
            # No QueryID also means ECHO is throttling us — back off next call.
            return None

        # ECHO throttles hard between the two steps; the legacy connector
        # sleeps 8s here. 3s is enough for single-record lookups.
        time.sleep(3)

        # get_download only emits CSV or GEOJSOND — JSON is rejected outright
        d = client.get(f"{base}.get_download",
                       params={"qid": qid, "output": "CSV", "responseset": "5", "pageno": "1"})
        if d.status_code != 200 or d.text.lstrip().startswith("<"):
            return None
        parsed = list(csv.DictReader(io.StringIO(d.text)))
        if not parsed:
            return None
        f = parsed[0]

        def g(*keys):
            for k in keys:
                v = (f.get(k) or "").strip()
                if v:
                    return v
            return None

        out = {
            "facility_name": g("FacName", "CWPName"),
            "address": g("FacStreet"),
            "city_state": ", ".join(x for x in [g("FacCity"), g("FacState")] if x) or None,
            "naics": g("FacNAICSCodes", "FacDerivedNAICS"),
            "sic": g("FacSICCodes", "FacDerivedSIC"),
            "registry_id": g("RegistryID", "FacDerivedHUC"),
            "epa_facility_matches": rows,
        }
        return {k: v for k, v in out.items() if v} or None
    except Exception:
        return None


def osm_nominatim(client: httpx.Client, name: str, city: str | None,
                  street: str | None = None) -> dict | None:
    """Free OpenStreetMap geocoding — verifies the physical site exists.
    Company names are sparse in OSM, so try the street address first (which
    actually resolves), then fall back to name+city."""
    queries = []
    if street and city:
        queries.append(f"{street}, {city}")
    if city:
        queries.append(f"{name}, {city}")
    else:
        queries.append(name)
    for q in queries:
        try:
            r = client.get("https://nominatim.openstreetmap.org/search",
                           params={"q": q, "format": "json", "limit": 1}, headers=UA)
            time.sleep(1.1)  # Nominatim policy: max 1 req/s — non-negotiable
            if r.status_code != 200:
                continue
            hits = r.json()
            if not hits:
                continue
            h = hits[0]
            display = h.get("display_name", "")

            # Guard against near-miss geocoding: Nominatim happily returns a
            # *different* street number (12187 -> 12797, a post office). If the
            # query carried a house number, the match must carry the same one.
            q_num = re.match(r"\s*(\d+)", q)
            if q_num:
                d_num = re.match(r"\s*(\d+)", display)
                if not d_num or d_num.group(1) != q_num.group(1):
                    continue

            return {"display_name": display[:200], "matched_query": q,
                    "type": h.get("type"), "lat": h.get("lat"), "lon": h.get("lon")}
        except Exception:
            continue
    return None


def gather_registry(vendor) -> dict:
    data: dict = {}
    with httpx.Client(timeout=TIMEOUT, headers=UA, follow_redirects=True) as client:
        name = vendor["company_name"]
        # strip artifacts like "History - " / "| ..." from junky names for lookups
        clean = re.split(r"\s*[|–—]\s*", name)[0].strip()
        street = vendor["street_address"] if "street_address" in vendor.keys() else None
        for key, fn, args in [
            ("wikidata", wikidata, (client, clean)),
            ("opencorporates", opencorporates, (client, clean)),
            ("epa_echo", epa_echo, (client, clean, vendor["state_province"])),
            ("openstreetmap", osm_nominatim, (client, clean, vendor["city"], street)),
        ]:
            result = fn(*args)
            if result:
                data[key] = result
    return data


# ---------------- triage (junk detection): Gemini first, OpenRouter fallback

import gemini

TRIAGE_MODEL = _env("OPENROUTER_MODEL") or "openai/gpt-4o-mini"

TRIAGE_PROMPT = """You are a data-quality gate for an industrial vendor directory. Given a record's \
name, URL, and a text sample from its website, answer with EXACTLY one word:
REAL  - a genuine manufacturing/fabrication/industrial-services company
JUNK  - a PDF artifact, event page, news article, directory listing, subpage scraped as a \
company, dead/parked domain, or anything that is not an actual company
Name: {name}
URL: {url}
Text sample: {sample}"""


def triage(vendor, sample: str) -> str | None:
    # 1) Gemini Flash-Lite direct (Vertex express) — cheapest capable verdict.
    verdict = gemini.generate(
        TRIAGE_PROMPT.format(name=vendor["company_name"], url=vendor["website_url"],
                             sample=sample[:1500]),
        model=gemini.FLASH_LITE, max_tokens=200,
    )
    if verdict:
        v = verdict.strip().upper()
        if "JUNK" in v:
            return "JUNK"
        if "REAL" in v:
            return "REAL"
    # 2) fallback: OpenRouter (previous behavior, unchanged)
    key = _env("OPENROUTER_API_KEY")
    if not key:
        return None  # no triage without a key — treat as REAL
    try:
        r = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={"model": TRIAGE_MODEL, "max_tokens": 4,
                  "messages": [{"role": "user", "content": TRIAGE_PROMPT.format(
                      name=vendor["company_name"], url=vendor["website_url"],
                      sample=sample[:1500])}]},
            timeout=30,
        )
        word = r.json()["choices"][0]["message"]["content"].strip().upper()
        return "JUNK" if "JUNK" in word else "REAL"
    except Exception:
        return None


def mark_suspect(con, vendor_id: int) -> None:
    """Route junk to the admin sleep overlay — NEVER delete. Reversible from
    the admin approval queue. Matches the existing curation schema."""
    con.execute(
        """INSERT OR IGNORE INTO vendor_states (vendor_id, state, reason, changed_by, changed_at)
           VALUES (?, 'sleeping',
                   'pipeline_v3 triage: flagged not-a-real-company (review before reinstating)',
                   'system:pipeline_v3', datetime('now'))""",
        [vendor_id],
    )
    con.commit()


# ---------------- main ----------------

def run(limit: int) -> None:
    con = state.connect()
    rows = con.execute(
        """SELECT v.id, v.company_name, v.website_url, v.city, v.state_province,
                  v.street_address
           FROM enrich_v3_state s JOIN vendors v ON v.id = s.vendor_id
           WHERE s.stage = 'scraped' ORDER BY s.vendor_id LIMIT ?""",
        [limit],
    ).fetchall()
    aug = junk = 0
    for v in rows:
        cf = CACHE_DIR / f"{v['id']}.json"
        if not cf.exists():
            continue
        payload = json.loads(cf.read_text(encoding="utf-8"))
        if "registry" in payload:
            continue  # already augmented

        verdict = triage(v, payload.get("text", ""))
        if verdict == "JUNK":
            mark_suspect(con, v["id"])
            state.set_stage(con, v["id"], "triaged_out",
                            error="triage: junk record -> sleep queue")
            junk += 1
            print(f"  JUNK  #{v['id']} {v['company_name'][:50]}")
            continue

        payload["registry"] = gather_registry(v)
        cf.write_text(json.dumps(payload), encoding="utf-8")
        aug += 1
        srcs = ", ".join(payload["registry"].keys()) or "none matched"
        print(f"  aug   #{v['id']} {v['company_name'][:40]} [{srcs}]")
    print(f"\naugment done: {aug} augmented, {junk} junk -> sleep queue")


if __name__ == "__main__":
    run(int(sys.argv[1]) if len(sys.argv) > 1 else 50)
