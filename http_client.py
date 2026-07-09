"""Concurrent HTTP client with per-host rate limits, semaphores, and retries."""
from __future__ import annotations

class FatalAPIError(Exception):
    pass

class CreditExhaustedError(FatalAPIError):
    """Raised when OpenRouter returns HTTP 402: credits depleted."""
    pass


import asyncio
import logging
import random
from contextlib import asynccontextmanager
from typing import Optional
from urllib.parse import urlparse

import aiohttp
from aiolimiter import AsyncLimiter

log = logging.getLogger("http")

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}

# Per-domain budget: (requests_per_second, concurrency)
HOST_BUDGETS: dict[str, tuple[float, int]] = {
    "thomasnet.com": (4.0, 8),
    "www.thomasnet.com": (4.0, 8),
    "aisc.org": (6.0, 10),
    "www.aisc.org": (6.0, 10),
    "asme.org": (4.0, 8),
    "caconnect.asme.org": (4.0, 8),
    "steeltank.com": (4.0, 6),
    "tema.org": (4.0, 6),
}
DEFAULT_BUDGET = (8.0, 16)


class ConcurrentClient:
    def __init__(self, total_concurrency: int = 100, timeout_s: int = 30):
        self.timeout = aiohttp.ClientTimeout(total=timeout_s)
        self._global_sem = asyncio.Semaphore(total_concurrency)
        self._host_state: dict[str, tuple[AsyncLimiter, asyncio.Semaphore]] = {}
        self._session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self):
        connector = aiohttp.TCPConnector(limit=200, ttl_dns_cache=600, ssl=False)
        self._session = aiohttp.ClientSession(
            connector=connector, timeout=self.timeout, headers=DEFAULT_HEADERS
        )
        return self

    async def __aexit__(self, exc_type, exc, tb):
        if self._session:
            await self._session.close()

    def _budget(self, url: str):
        host = urlparse(url).hostname or "default"
        if host not in self._host_state:
            rps, conc = HOST_BUDGETS.get(host, DEFAULT_BUDGET)
            self._host_state[host] = (AsyncLimiter(rps, 1), asyncio.Semaphore(conc))
        return self._host_state[host]

    async def get(self, url: str, *, retries: int = 3, **kw) -> Optional[str]:
        limiter, host_sem = self._budget(url)
        for attempt in range(retries):
            async with self._global_sem, host_sem, limiter:
                try:
                    assert self._session is not None
                    async with self._session.get(url, **kw) as r:
                        if r.status in (429, 503):
                            wait = 2 ** attempt + random.random()
                            log.warning("HTTP %s on %s — backoff %.1fs", r.status, url, wait)
                            await asyncio.sleep(wait)
                            continue
                        
                        if r.status == 402:
                            text = await r.text()
                            log.error("FATAL HTTP 402 on %s: %s", url, text)
                            raise CreditExhaustedError(f"HTTP 402 on {url}")
                        if r.status in (401, 403):
                            text = await r.text()
                            log.error("FATAL HTTP %s on %s: %s", r.status, url, text)
                            raise FatalAPIError(f"HTTP {r.status} on {url}")
                        if r.status >= 400:

                            log.debug("HTTP %s on %s", r.status, url)
                            return None
                        return await r.text(errors="replace")
                except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                    if attempt == retries - 1:
                        log.debug("Fetch failed %s: %s", url, e)
                        return None
                    await asyncio.sleep(2 ** attempt + random.random())
        return None

    async def get_json(self, url: str, *, retries: int = 3, **kw) -> Optional[dict]:
        limiter, host_sem = self._budget(url)
        for attempt in range(retries):
            async with self._global_sem, host_sem, limiter:
                try:
                    assert self._session is not None
                    async with self._session.get(url, **kw) as r:
                        if r.status in (429, 503):
                            await asyncio.sleep(2 ** attempt + random.random())
                            continue
                        
                        if r.status == 402:
                            text = await r.text()
                            log.error("FATAL HTTP 402 on %s: %s", url, text)
                            raise CreditExhaustedError(f"HTTP 402 on {url}")
                        if r.status in (401, 403):
                            text = await r.text()
                            log.error("FATAL HTTP %s on %s: %s", r.status, url, text)
                            raise FatalAPIError(f"HTTP {r.status} on {url}")
                        if r.status >= 400:

                            text = await r.text()
                            log.warning("HTTP %s on %s: %s", r.status, url, text)
                            return None
                        return await r.json(content_type=None)
                except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as e:
                    if attempt == retries - 1:
                        log.debug("Fetch JSON failed %s: %s", url, e)
                        return None
                    await asyncio.sleep(2 ** attempt + random.random())
        return None

    async def post_json(self, url: str, payload: dict, *, retries: int = 3, **kw) -> Optional[dict]:
        limiter, host_sem = self._budget(url)
        for attempt in range(retries):
            async with self._global_sem, host_sem, limiter:
                try:
                    assert self._session is not None
                    async with self._session.post(url, json=payload, **kw) as r:
                        if r.status in (429, 503):
                            await asyncio.sleep(2 ** attempt + random.random())
                            continue
                        
                        if r.status == 402:
                            text = await r.text()
                            log.error("FATAL HTTP 402 on %s: %s", url, text)
                            raise CreditExhaustedError(f"HTTP 402 on {url}")
                        if r.status in (401, 403):
                            text = await r.text()
                            log.error("FATAL HTTP %s on %s: %s", r.status, url, text)
                            raise FatalAPIError(f"HTTP {r.status} on {url}")
                        if r.status == 404:
                            text = await r.text()
                            if "No endpoints found" in text or "model" in text.lower():
                                log.error(
                                    "FATAL: OpenRouter model not found (HTTP 404). "
                                    "Check OPENROUTER_MODEL in .env. Response: %s", text
                                )
                                raise FatalAPIError(f"OpenRouter model not found: {text[:200]}")
                            log.warning("HTTP 404 on %s: %s", url, text)
                            return None
                        if r.status >= 400:
                            text = await r.text()
                            log.warning("HTTP %s on %s: %s", r.status, url, text)
                            return None
                        return await r.json(content_type=None)
                except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as e:
                    if attempt == retries - 1:
                        log.debug("POST failed %s: %s", url, e)
                        return None
                    await asyncio.sleep(2 ** attempt + random.random())
        return None


@asynccontextmanager
async def gather_bounded(coros, limit: int = 50):
    """Run coroutines bounded by a semaphore; yield results as they complete."""
    sem = asyncio.Semaphore(limit)

    async def _runner(c):
        async with sem:
            return await c

    tasks = [asyncio.create_task(_runner(c)) for c in coros]
    try:
        yield tasks
    finally:
        for t in tasks:
            if not t.done():
                t.cancel()
