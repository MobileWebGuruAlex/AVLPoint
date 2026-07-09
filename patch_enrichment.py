import re

with open('enrichment.py', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Remove DICT_MERGES and update simple lists
code = re.sub(
    r'# Dict fields — deep merge.*?return vendor, changed',
    'return vendor, changed',
    code, flags=re.DOTALL
)

# 2. Add ai_synopsis to SCALAR_FILLS
code = code.replace(
    '\"ai_summary\",',
    '\"ai_summary\", \"ai_synopsis\",'
)

# 3. Add representative_images to LIST_MERGES
code = code.replace(
    '\"license_numbers\", \"registration_numbers\",',
    '\"license_numbers\", \"registration_numbers\", \"representative_images\",'
)

# 4. Update _needs_llm
code = code.replace(
    'return not (v.contact_email and v.key_personnel and v.facility_size_sqft and v.company_description and v.services)',
    'return not (v.ai_synopsis and v.representative_images)'
)

# 5. Update _get_missing_fields
code = code.replace(
    'if not v.services: missing.append("services")',
    'if not v.services: missing.append("services")\n    if not v.ai_synopsis: missing.append("ai_synopsis")\n    if not v.representative_images: missing.append("representative_images")'
)

# 6. Update HTML parser to extract images
img_extraction = '''                    # 1.5 Extract Logo
                    logo_url = None
                    meta_img = soup.find("meta", property="og:image")
                    if meta_img and meta_img.get("content"):
                        logo_url = meta_img["content"]
                    if not logo_url:
                        link_icon = soup.find("link", rel=lambda r: r and "icon" in r.lower())
                        if link_icon and link_icon.get("href"):
                            logo_url = link_icon["href"]
                    if not logo_url:
                        img_logo = soup.find("img", attrs={"src": re.compile(r'logo', re.I)})
                        if img_logo and img_logo.get("src"):
                            logo_url = img_logo["src"]
                    if logo_url:
                        from urllib.parse import urljoin
                        parsed["logo_url"] = urljoin(url, logo_url)
                        
                    # 1.6 Extract Representative Images
                    from urllib.parse import urljoin
                    rep_images = []
                    for img in soup.find_all("img"):
                        src = img.get("src")
                        if not src: continue
                        if any(x in src.lower() for x in ["icon", "logo", "tracker", "pixel", "badge"]): continue
                        
                        w = img.get("width")
                        h = img.get("height")
                        try:
                            if w and int(w) < 150: continue
                            if h and int(h) < 150: continue
                        except ValueError:
                            pass
                        
                        abs_url = urljoin(url, src)
                        if abs_url not in rep_images and abs_url != parsed.get("logo_url"):
                            rep_images.append(abs_url)
                        if len(rep_images) >= 3:
                            break
                    if rep_images:
                        parsed["representative_images"] = rep_images'''
                        
code = re.sub(
    r'                    # 1\.5 Extract Logo.*?parsed\["logo_url"\] = urljoin\(url, logo_url\)',
    img_extraction,
    code, flags=re.DOTALL
)

# 7. Update LLM Prompt
llm_prompt = '''                system_prompt = """You are an expert data extractor. We need to build a clean, beautiful company profile card.
CRITICAL REQUIREMENT: We prioritize enterprise-ready suppliers capable of serving Fortune 500 manufacturers.

Extract the following data. DO NOT GUESS. If not found, omit the field.
{
  "ai_synopsis": "A single, professional 50-70 word paragraph explaining exactly what the company does and their primary value proposition.",
  "core_capabilities": ["keyword1", "keyword2"],
  "certifications": ["keyword1", "keyword2"],
  "industries_served": ["keyword1", "keyword2"],
  "materials_handled": ["keyword1", "keyword2"],
  "equipment_list": ["keyword1", "keyword2"]
}
Respond ONLY with valid JSON matching this schema."""'''

code = re.sub(
    r'                system_prompt = """You are an expert data extractor.*?  "ai_metadata_data": \{.*?\n  \}\n\}"""',
    llm_prompt,
    code, flags=re.DOTALL
)

with open('enrichment.py', 'w', encoding='utf-8') as f:
    f.write(code)
