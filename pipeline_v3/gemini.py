"""Gemini client for pipeline v3 — Vertex AI express mode.

The GEMINI_API_KEY in the environment is a Vertex express key: it authenticates
against aiplatform.googleapis.com with ?key= (the generativelanguage.googleapis
endpoint is blocked for this key — do not switch back).

Cost discipline:
- default model gemini-2.5-flash-lite ($0.10/M in, $0.40/M out — the cheapest
  capable model we have access to; a triage verdict costs ~$0.00005)
- gemini-2.5-flash reserved for extraction jobs that need more accuracy
- soft daily call cap (GEMINI_DAILY_CAP, default 3000) tracked in a counter
  file so a bug can never run away with the key
- every helper returns None on ANY failure — callers keep their existing
  OpenRouter fallback, so Gemini being down never breaks the pipeline.
"""
from __future__ import annotations

import datetime as _dt
import json
import os
import re
from pathlib import Path

import httpx

FLASH_LITE = "gemini-2.5-flash-lite"
FLASH = "gemini-2.5-flash"

_BASE = "https://aiplatform.googleapis.com/v1/publishers/google/models"
_COUNTER = Path(__file__).resolve().parent / ".gemini_daily.json"
DAILY_CAP = int(os.getenv("GEMINI_DAILY_CAP", "3000"))

# $/1M tokens (input, output) — for the usage log only
_PRICES = {FLASH_LITE: (0.10, 0.40), FLASH: (0.30, 2.50)}


def _key() -> str:
    v = os.getenv("GEMINI_API_KEY", "")
    if v:
        return v
    envf = Path(__file__).resolve().parent.parent / ".env"
    if envf.exists():
        for line in envf.read_text().splitlines():
            if line.startswith("GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip()
    return ""


def _under_cap() -> bool:
    today = _dt.date.today().isoformat()
    try:
        d = json.loads(_COUNTER.read_text())
    except Exception:
        d = {}
    return d.get("date") != today or d.get("calls", 0) < DAILY_CAP


def _count(usage: dict, model: str) -> None:
    today = _dt.date.today().isoformat()
    try:
        d = json.loads(_COUNTER.read_text())
    except Exception:
        d = {}
    if d.get("date") != today:
        d = {"date": today, "calls": 0, "in_tokens": 0, "out_tokens": 0, "est_cost": 0.0}
    pin, pout = _PRICES.get(model, _PRICES[FLASH])
    tin = usage.get("promptTokenCount", 0)
    tout = usage.get("candidatesTokenCount", 0) + usage.get("thoughtsTokenCount", 0)
    d["calls"] += 1
    d["in_tokens"] += tin
    d["out_tokens"] += tout
    d["est_cost"] = round(d.get("est_cost", 0.0) + tin / 1e6 * pin + tout / 1e6 * pout, 6)
    _COUNTER.write_text(json.dumps(d))


def generate(prompt: str, *, model: str = FLASH_LITE, max_tokens: int = 500,
             json_mode: bool = False, timeout: float = 45.0) -> str | None:
    """One-shot generation. Returns text, or None on any failure/cap."""
    key = _key()
    if not key or not _under_cap():
        return None
    cfg: dict = {"maxOutputTokens": max_tokens, "temperature": 0}
    if json_mode:
        cfg["responseMimeType"] = "application/json"
    try:
        r = httpx.post(
            f"{_BASE}/{model}:generateContent", params={"key": key},
            json={"contents": [{"role": "user", "parts": [{"text": prompt}]}],
                  "generationConfig": cfg},
            timeout=timeout,
        )
        if r.status_code != 200:
            return None
        d = r.json()
        _count(d.get("usageMetadata", {}), model)
        parts = d["candidates"][0]["content"]["parts"]
        return "".join(p.get("text", "") for p in parts).strip() or None
    except Exception:
        return None


def generate_json(prompt: str, **kw) -> dict | None:
    """generate() + robust JSON parse. None on any failure."""
    text = generate(prompt, json_mode=True, **kw)
    if not text:
        return None
    try:
        return json.loads(re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip())
    except Exception:
        return None


def usage_today() -> dict:
    try:
        d = json.loads(_COUNTER.read_text())
        if d.get("date") == _dt.date.today().isoformat():
            return d
    except Exception:
        pass
    return {"date": _dt.date.today().isoformat(), "calls": 0, "est_cost": 0.0}


if __name__ == "__main__":
    print("smoke:", generate("Reply with exactly: ok", max_tokens=10))
    print("usage:", usage_today())
