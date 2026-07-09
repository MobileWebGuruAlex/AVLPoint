import re

with open('pipeline_v2.py', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Remove Firecrawl init
code = re.sub(
    r'    fc_api_key = os\.getenv\("FIRECRAWL_API_KEY"\)\n.*?(?=    stop = asyncio\.Event\(\))',
    '',
    code,
    flags=re.DOTALL
)

# 2. Remove fc from run_enrichment_loop definition
code = re.sub(
    r'async def run_enrichment_loop\(fc, db: AsyncDB, stop: asyncio\.Event,',
    r'async def run_enrichment_loop(db: AsyncDB, stop: asyncio.Event,',
    code
)

# 3. Remove fc from enrich_batch call
code = re.sub(
    r'n = await enrich_batch\(fc, db, vendors, use_llm_fallback=True\)',
    r'n = await enrich_batch(db, vendors, use_llm_fallback=True)',
    code
)

# 4. Remove fc from run_enrichment_loop task creation
code = re.sub(
    r'run_enrichment_loop\(fc, db, stop, idle_sleep=5\.0, cap=args\.enrich_cap\)',
    r'run_enrichment_loop(db, stop, idle_sleep=5.0, cap=args.enrich_cap)',
    code
)

# 5. Rewrite html_scrape to use Nimbleway
nimbleway_scrape_code = '''
        nimble_key = os.getenv("NIMBLE_API_KEY")
        
        async def html_scrape(url, wait_ms=0, scroll=False):
            """Fetch HTML via Nimbleway Weblens Extract API to bypass blocks, convert to Markdown."""
            try:
                import aiohttp
                import bs4
                import markdownify
                
                if nimble_key:
                    headers = {
                        "Authorization": f"Bearer {nimble_key}",
                        "Content-Type": "application/json"
                    }
                    payload = {
                        "url": url,
                        "render": True
                    }
                    async with aiohttp.ClientSession() as session:
                        async with session.post("https://api.weblens.nimbleway.com/api/v1/extract", json=payload, headers=headers, timeout=45.0) as resp:
                            if resp.status == 200:
                                data = await resp.json()
                                html = data.get("content", "") or data.get("html", "")
                            else:
                                # fallback to normal fetch if weblens endpoint fails
                                fallback = await http.get(url, timeout=15.0)
                                html = fallback.text if fallback else ""
                else:
                    # fallback to normal fetch if no nimble key
                    fallback = await http.get(url, timeout=15.0)
                    html = fallback.text if fallback else ""
                    
                if not html: return ""
                soup = bs4.BeautifulSoup(html, "html.parser")
                
                for e in soup(["script", "style", "nav", "footer", "header", "aside"]):
                    e.decompose()
                md = markdownify.markdownify(str(soup), heading_style="ATX")
                return md
            except Exception as e:
                log.warning("html_scrape (Nimbleway) failed for %s: %s", url, e)
                return ""
'''
code = re.sub(
    r'        async def html_scrape\(url, wait_ms=0, scroll=False\):.*?(?=        sources = \[\])',
    nimbleway_scrape_code.strip() + '\n\n',
    code,
    flags=re.DOTALL
)

with open('pipeline_v2.py', 'w', encoding='utf-8') as f:
    f.write(code)
