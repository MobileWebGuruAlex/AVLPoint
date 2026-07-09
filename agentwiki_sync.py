import sqlite3
import json
import subprocess
import os
import time

def run_cli_command(command, input_data=None):
    try:
        env = os.environ.copy()
        if input_data:
            result = subprocess.run(command, input=input_data.encode('utf-8'), shell=True, env=env, capture_output=True)
        else:
            result = subprocess.run(command, shell=True, env=env, capture_output=True)
            
        if result.returncode != 0:
            print(f"Error running command: {command}")
            print(f"Stderr: {result.stderr.decode('utf-8', errors='ignore')}")
            return None
        return result.stdout.decode('utf-8', errors='ignore')
    except Exception as e:
        print(f"Exception: {e}")
        return None

def parse_json_field(raw):
    if not raw: return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list): return parsed
        if isinstance(parsed, dict): return parsed
        return [raw]
    except:
        return [raw]

def build_markdown(vendor):
    # Map the vendor tuple to fields
    name = vendor[0]
    url = vendor[1] or "No website provided"
    email = vendor[2] or "N/A"
    phone = vendor[3] or "N/A"
    desc = vendor[4] or vendor[5] or "No description available."
    
    services = parse_json_field(vendor[6])
    products = parse_json_field(vendor[7])
    industries = parse_json_field(vendor[8])
    capabilities = parse_json_field(vendor[9])
    tech = parse_json_field(vendor[10])
    leadership = parse_json_field(vendor[11])
    socials = parse_json_field(vendor[12])
    locations = parse_json_field(vendor[13])
    
    md = f"""# {name}

**Website:** {url}
**Email:** {email}
**Phone:** {phone}

## About
{desc}
"""
    
    if locations:
        md += f"\n**Service Areas / Locations:** {', '.join([str(l) for l in locations])}\n"
        
    if leadership and isinstance(leadership, list):
        md += "\n## Key Personnel\n"
        for l in leadership:
            md += f"- {l}\n"

    if industries and isinstance(industries, list):
        md += "\n## Industries Served\n"
        for i in industries:
            md += f"- {i}\n"

    if capabilities and isinstance(capabilities, list):
        md += "\n## Core Capabilities\n"
        for c in capabilities:
            md += f"- {c}\n"

    if services and isinstance(services, list):
        md += "\n## Services\n"
        for s in services:
            md += f"- {s}\n"
            
    if products and isinstance(products, list):
        md += "\n## Products\n"
        for p in products:
            md += f"- {p}\n"

    if tech and isinstance(tech, list):
        md += "\n## Equipment & Technologies\n"
        for t in tech:
            md += f"- {t}\n"

    if socials and isinstance(socials, dict):
        md += "\n## Social Profiles\n"
        for platform, link in socials.items():
            if link:
                md += f"- **{platform.title()}:** {link}\n"
            
    return md

def sync_to_agentwiki(limit=25):
    print("Connecting to vendors.db for AgentWiki Sync...")
    conn = sqlite3.connect('vendors.db')
    cur = conn.cursor()
    
    query = """
    SELECT company_name, website_url, contact_email, contact_phone, company_description, ai_summary, 
           services, products, industries_served, capabilities, equipment_list, key_personnel, 
           social_profiles, geographic_service_areas
    FROM vendors 
    WHERE length(company_name) > 3 
      AND company_name NOT LIKE '%http%' 
      AND company_name NOT LIKE '%[%' 
      AND company_name NOT LIKE '%, CA %'
      AND (company_description IS NOT NULL AND company_description != '')
      AND (agentwiki_published = 0 OR agentwiki_published IS NULL)
    LIMIT ?
    """
    
    cur.execute(query, (limit,))
    vendors = cur.fetchall()
    
    if not vendors:
        print("No new enriched vendors to publish to AgentWiki at this time.")
        return
        
    print(f"Found {len(vendors)} new vendors to publish.")
    
    success_count = 0
    for v in vendors:
        name = v[0]
        desc = v[4] or v[5] or "Industrial vendor"
        short_desc = desc[:80].replace('"', '').replace('\n', ' ') + "..."
        safe_name = name.encode('ascii', errors='replace').decode('ascii')
        print(f"Publishing: {safe_name}...")

        
        md_content = build_markdown(v)
        
        temp_file = "temp_agentwiki_doc.md"
        with open(temp_file, "w", encoding="utf-8") as f:
            f.write(md_content)
            
        safe_title = name.replace('"', '\\"')
        cmd = f"npx @aiagentwiki/cli doc create --title \"{safe_title}\" --description \"{short_desc}\" --file {temp_file}"
        
        result = run_cli_command(cmd)
        if result and ("Created document" in result or "id" in result.lower()):
            print(f"  -> Successfully created document for {safe_name}")
            
            # Mark as published
            update_query = "UPDATE vendors SET agentwiki_published = 1 WHERE company_name = ?"
            cur.execute(update_query, (name,))
            conn.commit()
            
            success_count += 1
            time.sleep(1) # Prevent rate limiting
        else:
            print(f"  -> Failed to create document for {safe_name}. Check output above.")
            
        if os.path.exists(temp_file):
            os.remove(temp_file)
            
    print(f"\nAgentWiki Sync complete. Successfully published {success_count}/{len(vendors)} documents.")

if __name__ == "__main__":
    sync_to_agentwiki()
