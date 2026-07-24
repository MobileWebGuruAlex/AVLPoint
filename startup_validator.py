"""
startup_validator.py -- Pre-flight checks for AVLpoint pipeline.

Validates all critical configuration before the pipeline processes any data.
Fails fast with a clear, actionable error if anything is misconfigured.

Checks performed:
  1. OPENROUTER_API_KEY is set and non-empty
  2. OPENROUTER_MODEL is set and non-empty
  3. API key is valid (live auth check against /api/v1/models)
  4. Configured model exists and is available on OpenRouter
  5. Model can accept a real inference request (end-to-end smoke test)
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys

import aiohttp
from dotenv import load_dotenv

load_dotenv(override=True)

log = logging.getLogger("startup")

OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"
OPENROUTER_CHAT_URL   = "https://openrouter.ai/api/v1/chat/completions"

# Known migration table: if an old model is configured, auto-upgrade to its successor.
MODEL_MIGRATIONS: dict[str, str] = {
    "anthropic/claude-3.5-sonnet":       "anthropic/claude-sonnet-4",
    "anthropic/claude-3.5-sonnet-20241022": "anthropic/claude-sonnet-4",
    "anthropic/claude-3-haiku":          "anthropic/claude-haiku-4.5",
    "anthropic/claude-3-haiku-20240307": "anthropic/claude-haiku-4.5",
    "anthropic/claude-3-opus":           "anthropic/claude-opus-4",
    "anthropic/claude-3-sonnet":         "anthropic/claude-sonnet-4",
}


async def validate_openrouter() -> dict:
    """
    Run all pre-flight checks. Returns a dict with:
      - ok (bool): True if all checks passed
      - model (str): The validated (possibly migrated) model ID
      - errors (list[str]): Any fatal errors
      - warnings (list[str]): Non-fatal issues
      - migrated (bool): True if the model was auto-migrated
    """
    result = {
        "ok": False,
        "model": "",
        "errors": [],
        "warnings": [],
        "migrated": False,
    }

    # --- Check 1: API key presence ---
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        result["errors"].append(
            "OPENROUTER_API_KEY is not set. Add it to your .env file."
        )
        return result

    if not api_key.startswith("sk-or-v1-"):
        result["warnings"].append(
            f"OPENROUTER_API_KEY has unexpected format (expected 'sk-or-v1-...'). "
            f"Got: {api_key[:12]}..."
        )

    # --- Check 2: Model ID presence ---
    configured_model = os.getenv("OPENROUTER_MODEL", "").strip()
    if not configured_model:
        result["warnings"].append(
            "OPENROUTER_MODEL not set -- will use hardcoded default 'anthropic/claude-sonnet-4'."
        )
        configured_model = "anthropic/claude-sonnet-4"

    model_to_use = configured_model

    # --- Check 3: Live model list from OpenRouter ---
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with aiohttp.ClientSession() as session:
            # Fetch available models
            async with session.get(OPENROUTER_MODELS_URL, headers=headers, timeout=aiohttp.ClientTimeout(total=15)) as r:
                if r.status == 401:
                    result["errors"].append(
                        f"OPENROUTER_API_KEY is invalid or expired (HTTP 401). "
                        f"Update OPENROUTER_API_KEY in your .env file."
                    )
                    return result
                if r.status == 429:
                    result["warnings"].append("OpenRouter rate-limited during model list check -- skipping availability check.")
                    model_to_use = configured_model
                elif r.status != 200:
                    result["errors"].append(
                        f"Failed to fetch OpenRouter model list (HTTP {r.status}). "
                        f"Check network connectivity and API status at https://status.openrouter.ai"
                    )
                    return result
                else:
                    data = await r.json(content_type=None)
                    available_models = {m["id"] for m in data.get("data", [])}

                    # --- Check 4: Model availability ---
                    if configured_model in available_models:
                        log.info("Startup: Model '%s' confirmed available on OpenRouter.", configured_model)
                        model_to_use = configured_model
                    else:
                        # Check migration table
                        migrated_to = MODEL_MIGRATIONS.get(configured_model)
                        if migrated_to and migrated_to in available_models:
                            log.warning(
                                "Startup: Configured model '%s' is NOT available on OpenRouter. "
                                "Auto-migrating to '%s'.",
                                configured_model, migrated_to
                            )
                            result["warnings"].append(
                                f"Model '{configured_model}' is deprecated/unavailable. "
                                f"Auto-migrated to '{migrated_to}'. "
                                f"Update OPENROUTER_MODEL in .env to silence this warning."
                            )
                            model_to_use = migrated_to
                            result["migrated"] = True
                            # Write the new model back to the env so the process uses it
                            os.environ["OPENROUTER_MODEL"] = migrated_to
                        else:
                            # Try to find the closest available Claude Sonnet
                            sonnet_models = sorted(
                                [m for m in available_models if "claude-sonnet" in m],
                                reverse=True  # latest version first
                            )
                            if sonnet_models:
                                fallback = sonnet_models[0]
                                result["warnings"].append(
                                    f"Model '{configured_model}' unavailable and not in migration table. "
                                    f"Falling back to '{fallback}' (latest available Sonnet). "
                                    f"Update OPENROUTER_MODEL in .env."
                                )
                                model_to_use = fallback
                                result["migrated"] = True
                                os.environ["OPENROUTER_MODEL"] = fallback
                                log.warning(
                                    "Startup: Model '%s' unavailable -- using '%s' as fallback.",
                                    configured_model, fallback
                                )
                            else:
                                result["errors"].append(
                                    f"Model '{configured_model}' is NOT available on OpenRouter and "
                                    f"no automatic migration is configured. "
                                    f"Available Claude models: {[m for m in available_models if 'claude' in m][:5]}"
                                )
                                return result

            # --- Check 5: End-to-end inference smoke test ---
            smoke_payload = {
                "model": model_to_use,
                "max_tokens": 5,
                "messages": [{"role": "user", "content": "ping"}],
            }
            async with session.post(
                OPENROUTER_CHAT_URL, json=smoke_payload, headers=headers,
                timeout=aiohttp.ClientTimeout(total=20)
            ) as r:
                if r.status == 402:
                    result["errors"].append(
                        "OpenRouter account has insufficient credits (HTTP 402). "
                        "Add credits at https://openrouter.ai/credits"
                    )
                    return result
                if r.status == 404:
                    body = await r.text()
                    result["errors"].append(
                        f"OpenRouter returned 404 for model '{model_to_use}': {body[:200]}. "
                        f"The model may have just been removed. Update OPENROUTER_MODEL in .env."
                    )
                    return result
                if r.status not in (200, 201):
                    body = await r.text()
                    result["errors"].append(
                        f"OpenRouter inference smoke test failed (HTTP {r.status}): {body[:200]}"
                    )
                    return result
                resp_data = await r.json(content_type=None)
                if "choices" not in resp_data:
                    result["errors"].append(
                        f"OpenRouter returned unexpected response (no 'choices'): {str(resp_data)[:200]}"
                    )
                    return result
                log.info(
                    "Startup: Smoke test passed -- model '%s' accepted an inference request.",
                    model_to_use
                )

    except aiohttp.ClientConnectorError as e:
        result["errors"].append(
            f"Cannot reach OpenRouter API (network error): {e}. "
            f"Check your internet connection."
        )
        return result
    except asyncio.TimeoutError:
        result["errors"].append(
            "OpenRouter API timed out during startup validation. "
            "Check your network and https://status.openrouter.ai"
        )
        return result

    result["ok"] = True
    result["model"] = model_to_use
    return result


async def validate_anthropic() -> dict:
    """Validate the direct Anthropic API key + model with a tiny smoke test."""
    result = {"ok": False, "model": "", "migrated": False, "warnings": [], "errors": []}
    key = os.getenv("AVL_ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_API_KEY")
    model = os.getenv("AVL_AI_MODEL", "claude-sonnet-4-6")
    base = os.getenv("AVL_AI_BASE_URL", "https://api.anthropic.com").rstrip("/")
    result["model"] = model
    if not key:
        result["errors"].append("AVL_ANTHROPIC_API_KEY is not set.")
        return result
    headers = {"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
    payload = {"model": model, "max_tokens": 8, "messages": [{"role": "user", "content": "OK"}]}
    try:
        timeout = aiohttp.ClientTimeout(total=20)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(f"{base}/v1/messages", json=payload, headers=headers) as r:
                body = await r.text()
                if r.status == 401:
                    result["errors"].append("Anthropic API key is invalid (HTTP 401).")
                elif r.status == 402 or r.status == 429:
                    result["errors"].append(f"Anthropic API not usable (HTTP {r.status}): {body[:160]}")
                elif r.status == 404:
                    result["errors"].append(f"Anthropic model '{model}' not found (HTTP 404). Check AVL_AI_MODEL.")
                elif r.status != 200:
                    result["errors"].append(f"Anthropic smoke test failed (HTTP {r.status}): {body[:160]}")
                else:
                    result["ok"] = True
    except Exception as e:
        result["errors"].append(f"Cannot reach Anthropic API: {e}")
    return result


async def run_startup_validation(fail_fast: bool = True) -> str:
    """
    Called from pipeline_v2.py at startup. Prints a clear summary and either
    raises SystemExit (fail_fast=True) or returns the validated model ID.

    Validates whichever provider enrichment will actually use: the direct
    Anthropic API when AVL_ENRICH_PROVIDER=anthropic (or =auto with a key
    present), otherwise OpenRouter.
    """
    _provider = os.getenv("AVL_ENRICH_PROVIDER", "auto").lower()
    _anthropic_key = os.getenv("AVL_ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_API_KEY")
    _use_anthropic = _provider == "anthropic" or (_provider == "auto" and bool(_anthropic_key))

    if _use_anthropic:
        log.info("=== STARTUP VALIDATION: Anthropic (direct) Configuration ===")
        r = await validate_anthropic()
    else:
        log.info("=== STARTUP VALIDATION: OpenRouter Configuration ===")
        r = await validate_openrouter()

    for w in r["warnings"]:
        log.warning("Startup WARNING: %s", w)
    for e in r["errors"]:
        log.error("Startup ERROR: %s", e)

    if r["migrated"]:
        log.info(
            "Model auto-migrated. OPENROUTER_MODEL env var updated to '%s' for this session.",
            r["model"]
        )

    if not r["ok"]:
        msg = (
            "\n"
            "----------------------------------------------------------------\n"
            "-  PIPELINE STARTUP FAILED -- AI PROVIDER MISCONFIGURED        -\n"
            "----------------------------------------------------------------\n"
            + "\n".join(f"  - {e}" for e in r["errors"])
            + "\n\nFix the above issues in .env and restart the pipeline.\n"
        )
        log.error(msg)
        if fail_fast:
            sys.exit(1)
        raise RuntimeError(msg)

    log.info(
        "=== STARTUP VALIDATION PASSED -- Using model: %s ===",
        r["model"]
    )
    return r["model"]


if __name__ == "__main__":
    # Allow running standalone: python startup_validator.py
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s - %(message)s")
    model = asyncio.run(run_startup_validation(fail_fast=False))
    print(f"\nOK Configuration valid. Model: {model}")
