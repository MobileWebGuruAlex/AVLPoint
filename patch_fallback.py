import re

with open(r"c:\Projects\AVLpoint\enrichment.py", "r", encoding="utf-8") as f:
    content = f.read()

# We need to replace the fallback logic in `scrape_url`
# Currently it is:
# 1. aiohttp
# 2. Nimbleway
# 3. Firecrawl

new_logic = """        try:
            # 1. Fallback to basic aiohttp scraper FIRST to save credits
            async with session.get(url, timeout=10) as resp:
                if resp.status == 200:
                    html = await resp.text()
                    parsed, md_text, text_len = _parse_html(html, url)
                    if text_len < 300:
                        needs_js = True # Likely JS-heavy, React, or extremely empty
                elif resp.status in (401, 403, 503, 429):
                    aiohttp_failed = True # Likely WAF / Cloudflare block
                else:
                    aiohttp_failed = True
        except Exception as e:
            log.debug("aiohttp failed for %s: %s", url, e)
            aiohttp_failed = True

        # 2. Try Firecrawl API as PRIMARY PAID tool
        if aiohttp_failed or needs_js:
            firecrawl_key = os.getenv("FIRECRAWL_API_KEY")
            if firecrawl_key:
                can_use_fc = False
                async with fc_lock:
                    if fc_session_spend[0] < FC_SESSION_LIMIT:
                        fc_session_spend[0] += 1
                        can_use_fc = True

                if can_use_fc:
                    try:
                        headers = {"Authorization": f"Bearer {firecrawl_key}", "Content-Type": "application/json"}
                        payload = {"url": url, "formats": ["markdown"]}
                        async with session.post("https://api.firecrawl.dev/v2/scrape", json=payload, headers=headers, timeout=45) as fc_resp:
                            if fc_resp.status == 200:
                                data = await fc_resp.json()
                                if data.get("success") and "data" in data:
                                    result = data["data"]
                                    md_text = result.get("markdown", "")
                                    metadata = result.get("metadata", {})
                                    
                                    if metadata.get("ogImage"):
                                        parsed["logo_url"] = metadata["ogImage"]
                                    if metadata.get("description"):
                                        parsed["company_description"] = metadata["description"]
                                    
                                    phone = find_phone(md_text)
                                    email = find_email(md_text)
                                    if phone: parsed["contact_phone"] = phone
                                    if email: parsed["contact_email"] = email
                                    
                                    aiohttp_failed = False
                                    needs_js = False
                                    log.debug("Firecrawl Extract succeeded for %s", url)
                    except Exception as e:
                        log.debug("Firecrawl scrape fallback failed for %s: %s", url, e)

        # 3. Try Nimbleway Extract ONLY if Firecrawl failed (conserve Nimbleway credits)
        if aiohttp_failed or needs_js:
            nimble_key = os.getenv("NIMBLE_API_KEY")
            if nimble_key:
                try:
                    headers = {"Authorization": f"Bearer {nimble_key}", "Content-Type": "application/json"}
                    payload = {"url": url, "render": True}
                    async with session.post("https://sdk.nimbleway.com/v1/extract", json=payload, headers=headers, timeout=30) as n_resp:
                        if n_resp.status == 200:
                            data = await n_resp.json()
                            html = data.get("content", "") or data.get("html", "")
                            if not html and isinstance(data.get("data"), dict):
                                html = data["data"].get("html", "")
                            if html:
                                parsed, md_text, text_len = _parse_html(html, url)
                                if text_len > 300:
                                    aiohttp_failed = False
                                    needs_js = False
                                    log.debug("Nimbleway Extract succeeded for %s", url)
                except Exception as e:
                    log.debug("Nimbleway scrape fallback failed for %s: %s", url, e)"""

# Regex to find the block from the first try up to the end of the Firecrawl block
pattern = re.compile(
    r'        try:\n            # 1\. Fallback to basic aiohttp.*?log\.debug\("Firecrawl scrape fallback failed for %s: %s", url, e\)',
    re.DOTALL
)

new_content = pattern.sub(new_logic, content)

with open(r"c:\Projects\AVLpoint\enrichment.py", "w", encoding="utf-8") as f:
    f.write(new_content)
    
print("Successfully patched enrichment.py logic!")
