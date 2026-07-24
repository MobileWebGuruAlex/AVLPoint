import os

new_queries = [
    # --- Critical Minerals & Battery Materials ---
    "lithium carbonate refining and processing",
    "lithium hydroxide battery grade manufacturing",
    "spodumene concentration and mineral processing",
    "lithium-ion battery cathode material manufacturing",
    "battery anode material graphite processing",
    "synthetic graphite manufacturing for batteries",
    "lithium battery recycling and critical mineral recovery",
    "cobalt sulfate battery grade manufacturing",
    "nickel sulfate refining for batteries",
    "high purity manganese sulfate processing",
    "lithium hexafluorophosphate electrolyte manufacturing",
    "battery separator film extrusion and manufacturing",
    "solid state battery material development",
    "lithium metal foil and anode manufacturing",
    "advanced battery precursor chemical manufacturing",
    "critical mineral hydrometallurgical processing",

    # --- Boron, Barium & Specialty Chemicals ---
    "boron specialty chemicals and compounds manufacturing",
    "borosilicate glass raw material processing",
    "barium sulfate industrial processing and milling",
    "barium chemical compound manufacturing",
    "boron nitride powder and ceramic fabrication",
    "boron carbide advanced technical ceramics",
    "industrial barium compounds distributor",

    # --- Rare Earth Elements (REE) & Magnets ---
    "rare earth element REE refining and separation",
    "rare earth oxide powder processing",
    "neodymium magnet NdFeB manufacturing",
    "dysprosium and terbium alloy processing",
    "samarium cobalt SmCo magnet manufacturing",
    "rare earth metal alloying and casting",

    # --- Advanced Technical Ceramics ---
    "advanced technical ceramics manufacturing",
    "silicon carbide SiC structural component fabrication",
    "alumina ceramic industrial components",
    "zirconia ceramic wear parts and machining",
    "aluminum nitride AlN ceramic substrates",
    "piezoelectric ceramic component manufacturing",
    "silicon nitride Si3N4 ceramic fabrication",

    # --- Specialty & Refractory Metals ---
    "gallium and germanium refining",
    "indium tin oxide ITO sputtering target manufacturing",
    "tantalum capacitor powder and wire manufacturing",
    "niobium alloy custom fabrication",
    "tungsten carbide powder and industrial tools manufacturing",
    "molybdenum rod wire and sheet fabrication",
    "hafnium and zirconium specialty metal refining",
    "beryllium alloy processing and machining",
    "rhenium alloy high temperature components",
    "specialty metal alloy powder atomization",
    
    # --- Advanced Semiconductors & Electronics Materials ---
    "high purity polysilicon manufacturing",
    "silicon wafer crystal pulling and slicing",
    "gallium nitride GaN epitaxial wafer manufacturing",
    "silicon carbide SiC power electronics materials",
    
    # --- Equipment for Critical Materials ---
    "critical mineral processing and extraction equipment OEM",
    "lithium extraction direct lithium extraction DLE technology",
    "rare earth solvent extraction equipment fabrication"
]

def append_queries(filepath):
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        return
        
    with open(filepath, "r", encoding="utf-8") as f:
        lines = f.readlines()
        
    # Find the end of the INDUSTRY_QUERIES list
    end_idx = -1
    in_queries = False
    for i, line in enumerate(lines):
        if line.startswith("INDUSTRY_QUERIES = ["):
            in_queries = True
            continue
        if in_queries and line.strip() == "]":
            end_idx = i
            break
            
    if end_idx != -1:
        # Insert new queries just before the closing bracket
        new_lines = []
        for q in new_queries:
            new_lines.append(f'    "{q}",\n')
            
        # Ensure the line before has a comma
        prev_line = lines[end_idx - 1]
        if prev_line.strip() and not prev_line.strip().endswith(",") and not prev_line.strip().startswith("#") and prev_line.strip() != "[":
            lines[end_idx - 1] = prev_line.rstrip() + ",\n"
            
        lines = lines[:end_idx] + new_lines + lines[end_idx:]
        
        with open(filepath, "w", encoding="utf-8") as f:
            f.writelines(lines)
        print(f"Appended {len(new_queries)} queries to {filepath}")
    else:
        print(f"Could not find INDUSTRY_QUERIES array in {filepath}")

append_queries("c:\\Projects\\AVLpoint\\sources\\nimbleway_search.py")
append_queries("c:\\Projects\\AVLpoint\\sources\\firecrawl_discovery.py")
