import re

with open(r"c:\Projects\AVLpoint\pipeline_v2.py", "r", encoding="utf-8") as f:
    content = f.read()

new_logic = """        nimble_key = os.getenv("NIMBLE_API_KEY")
        firecrawl_key = os.getenv("FIRECRAWL_API_KEY")
        
        async def html_scrape(url, wait_ms=0, scroll=False):
            \"\"\"Fetch via basic HTTP, then Firecrawl, then Nimbleway.\"\"\"
            try:
                import aiohttp
                import bs4
                import markdownify
                
                md = ""
                
                # 1. Try free basic HTTP first
                fallback = await http.get(url, timeout=15.0)
                html = fallback.text if fallback else ""
                
                needs_js = False
                if html:
                    soup = bs4.BeautifulSoup(html, "html.parser")
                    for e in soup(["script", "style", "nav", "footer", "header", "aside"]):
                        e.decompose()
                    md = markdownify.markdownify(str(soup), heading_style="ATX")
                    if len(md.strip()) < 200:
                        needs_js = True
                        md = ""
                else:
                    needs_js = True
                    
                # 2. Try Firecrawl (Primary Paid)
                if needs_js and firecrawl_key:
                    headers = {"Authorization": f"Bearer {firecrawl_key}", "Content-Type": "application/json"}
                    payload = {"url": url, "formats": ["markdown"]}
                    async with aiohttp.ClientSession() as session:
                        async with session.post("https://api.firecrawl.dev/v2/scrape", json=payload, headers=headers, timeout=45) as resp:
                            if resp.status == 200:
                                data = await resp.json()
                                if data.get("success") and "data" in data:
                                    md = data["data"].get("markdown", "")
                                    if len(md) > 100:
                                        needs_js = False
                                        log.info("Firecrawl discovery scrape success: %s", url)

                # 3. Try Nimbleway Extract (Fallback)
                if needs_js and nimble_key:
                    headers = {"Authorization": f"Bearer {nimble_key}", "Content-Type": "application/json"}
                    payload = {"url": url, "render": True}
                    async with aiohttp.ClientSession() as session:
                        async with session.post("https://sdk.nimbleway.com/v1/extract", json=payload, headers=headers, timeout=45.0) as resp:
                            if resp.status == 200:
                                data = await resp.json()
                                html = data.get("content", "") or data.get("html", "")
                                if not html and isinstance(data.get("data"), dict):
                                    html = data["data"].get("html", "")
                                if html:
                                    soup = bs4.BeautifulSoup(html, "html.parser")
                                    for e in soup(["script", "style", "nav", "footer", "header", "aside"]):
                                        e.decompose()
                                    md = markdownify.markdownify(str(soup), heading_style="ATX")
                                    log.info("Nimbleway discovery scrape success: %s", url)
                                    
                return md
            except Exception as e:
                log.warning("html_scrape failed for %s: %s", url, e)
                return \"\"\""""

# Match from nimble_key assignment to the end of html_scrape function
pattern = re.compile(
    r'        nimble_key = os\.getenv\("NIMBLE_API_KEY"\)\s+async def html_scrape\(url, wait_ms=0, scroll=False\):.*?return ""',
    re.DOTALL
)

new_content = pattern.sub(new_logic, content)

with open(r"c:\Projects\AVLpoint\pipeline_v2.py", "w", encoding="utf-8") as f:
    f.write(new_content)
    
print("Successfully patched pipeline_v2.py logic!")
