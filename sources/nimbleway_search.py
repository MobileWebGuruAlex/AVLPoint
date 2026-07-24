"""Nimbleway search-based industrial company discovery.

Uses Nimbleway's google_search agent to find companies by querying
"{industry} company {state}" across all 50 states and multiple
industry keywords. Reverses the industry query list to meet Local Scraper in the middle.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import AsyncIterator, Optional
from urllib.parse import urlparse

from db_async import AsyncDB, VendorRecord
from db_async import AsyncDB, VendorRecord

INDUSTRY_QUERIES = [
    "ASME U-stamp pressure vessel fabrication",
    "ASME Section VIII Div 1 pressure vessel manufacturer",
    "ASME Section VIII Div 2 pressure vessel manufacturer",
    "NBIC R-stamp pressure vessel repair",
    "custom shell and tube heat exchanger manufacturer",
    "API 660 shell and tube heat exchanger fabrication",
    "air cooled heat exchanger manufacturer API 661",
    "TEMA class R heat exchanger fabrication",
    "plate and frame heat exchanger OEM",
    "custom process column and tower fabrication",
    "distillation column manufacturer",
    "ASME custom reactor vessel fabrication",
    "jacketed reactor vessel manufacturer",
    "autoclave manufacturer",
    "custom API 650 storage tank fabrication",
    "API 620 cryogenic storage tank manufacturer",
    "AWWA D100 steel water tank fabrication",
    "field erected storage tank contractor",
    "skid mounted modular process equipment manufacturer",
    "custom modular process plant fabrication",
    "Hastelloy C276 pressure vessel fabrication",
    "Inconel 625 custom equipment fabrication",
    "Monel 400 piping and vessel manufacturer",
    "Duplex stainless steel 2205 custom fabrication",
    "Super Duplex 2507 equipment fabrication",
    "titanium pressure vessel manufacturer",
    "titanium heat exchanger fabrication",
    "zirconium process equipment manufacturer",
    "tantalum lined reactor vessel fabrication",
    "explosion bonded clad plate equipment manufacturer",
    "316L stainless steel sanitary vessel fabrication",
    "high-nickel alloy custom fabrication",
    "AL-6XN custom process equipment",
    "cupronickel marine equipment fabrication",
    "aluminum bronze custom casting and machining",
    "custom FRP fiberglass tank manufacturer",
    "RTP-1 certified FRP vessel fabrication",
    "filament wound fiberglass pipe manufacturer",
    "PTFE lined pipe and fittings manufacturer",
    "PFA lined process equipment",
    "rubber lined tank manufacturer",
    "glass lined steel reactor manufacturer",
    "custom industrial plastic fabrication",
    "HDPE pipe spool fabrication",
    "custom pipe spool fabrication ASME B31.3",
    "ASME B31.1 power piping fabrication",
    "API 5L line pipe fabrication",
    "induction pipe bending services",
    "heavy structural steel fabrication AWS D1.1",
    "AISC certified structural steel fabricator",
    "custom structural steel skid fabrication",
    "offshore structural steel fabrication API",
    "bridge girder fabrication AISC",
    "architectural exposed structural steel fabrication",
    "ISO 9001 certified precision CNC machining",
    "AS9100 aerospace precision machining",
    "large format CNC gantry milling",
    "heavy industrial machining VTL",
    "horizontal boring mill large part machining",
    "Swiss CNC turning contract manufacturing",
    "5-axis CNC machining services",
    "tight tolerance micro machining",
    "EDM wire cutting services",
    "waterjet cutting contract services",
    "laser cutting and press brake forming",
    "custom steel foundry casting",
    "investment casting manufacturer",
    "sand casting job shop",
    "die casting contract manufacturer",
    "open die forging manufacturer",
    "closed die custom forging",
    "seamless rolled ring forging",
    "API 610 centrifugal pump manufacturer",
    "ANSI B73.1 chemical process pump manufacturer",
    "positive displacement pump OEM",
    "custom industrial valve manufacturer",
    "API 6D pipeline valve OEM",
    "control valve manufacturer",
    "API 618 reciprocating compressor OEM",
    "API 617 centrifugal compressor OEM",
    "industrial blower manufacturer",
    "custom industrial mixer and agitator OEM",
    "industrial oven manufacturer",
    "custom industrial furnace OEM",
    "vacuum furnace manufacturer",
    "NADCAP accredited heat treating services",
    "NADCAP accredited metal finishing",
    "NACE CIP certified industrial coating",
    "custom powder coating job shop",
    "industrial hard chrome plating services",
    "electroless nickel plating ISO 9001",
    "anodizing services MIL-A-8625",
    "AWS certified welding fabrication shop",
    "orbital welding services ASME B31.3",
    "electron beam welding contract services",
    "friction stir welding manufacturer",
    "ASNT Level III NDT inspection services",
    "radiographic testing RT inspection provider",
    "ultrasonic testing UT inspection services",
    "phased array ultrasonic testing PAUT services",
    "industrial equipment maintenance and repair",
    "rotating equipment repair services",
    "ITAR registered contract manufacturing",
    "defense contractor machining services",
    "CMMC compliant defense manufacturer",
    "NQA-1 nuclear manufacturing services",
    "10 CFR 50 Appendix B nuclear supplier",
    "DOE complex custom equipment manufacturer",
    "aerospace component contract manufacturer",
    "aircraft tooling fabrication",
    "ISO 13485 medical device contract manufacturing",
    "FDA registered contract manufacturer",
    "sanitary stainless steel fabrication 3-A SSI",
    "pharmaceutical process skid manufacturer",
    "cleanroom equipment custom fabrication",
    "food processing equipment OEM",
    "API-regulated oil and gas equipment manufacturing",
    "subsea equipment fabrication API 17D",
    "LNG processing equipment manufacturer",
    "cryogenic equipment manufacturer",
    "hydrogen storage and processing equipment OEM",
    "ABS certified marine equipment fabrication",
    "DNV certified offshore fabrication",
    "marine shipbuilding and repair fabrication",
    "custom industrial filtration system OEM",
    "membrane separation equipment manufacturer",
    "cyclone separator fabrication",
    "industrial wastewater treatment skid manufacturer",
    "air pollution control equipment OEM",
    "custom scrubber and exhaust system fabrication",
    "dust collector manufacturer",
    "industrial robotics integration and automation",
    "custom automated assembly line manufacturer",
    "control panel fabrication UL 508A",
    "PLC programming and automation integration",
    "custom material handling equipment OEM",
    "industrial conveyor system manufacturer",
    "custom engineered lifting equipment OEM",
    "custom wire rope and cable assembly manufacturer",
    "heavy duty spring manufacturing",
    "industrial gasket and seal manufacturer",
    "bellows and expansion joint fabrication",
    "corrugated metal hose assembly manufacturer",
    "industrial brush manufacturer",
    "custom perforated metal fabrication",
    "expanded metal manufacturing",
    "woven wire mesh industrial manufacturer",
    "custom industrial silencer fabrication",
    "acoustical enclosure OEM",
    "additive manufacturing metal 3D printing services",
    "direct metal laser sintering DMLS contract",
    "carbon fiber composite manufacturing job shop",
    "vacuum infusion composite fabrication",
    "pultrusion fiberglass manufacturer",
    "injection molding contract manufacturer ISO 9001",
    "blow molding custom manufacturer",
    "thermoforming heavy gauge custom plastic",
    "polyurethane casting job shop",
    "wind turbine component manufacturer",
    "solar mounting structure fabrication",
    "geothermal process equipment OEM",
    "hydropower turbine component machining",
    "biomass boiler manufacturer",
    "HRSG heat recovery steam generator fabrication",
    "gas turbine component manufacturing",
    "stator and rotor lamination manufacturer",
    "railcar component manufacturing",
    "locomotive engine block machining",
    "heavy truck axle and suspension forging",
    "commercial shipbuilding aluminum fabrication",
    "aerospace landing gear precision machining",
    "aircraft engine shroud fabrication",
    "military ground vehicle armor fabrication",
    "custom test stand fabrication",
    "dynamometer manufacturer",
    "environmental test chamber OEM",
    "flow meter calibration skid fabrication",
    "industrial load cell manufacturer",
    "industrial cooling tower manufacturer",
    "industrial chiller package OEM",
    "custom industrial heat sink fabrication",
    "industrial magnet manufacturer",
    "vibratory feeder bowl manufacturer",
    "magnetic separation equipment OEM",
    "industrial shredder and crusher manufacturer",
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
    "boron specialty chemicals and compounds manufacturing",
    "borosilicate glass raw material processing",
    "barium sulfate industrial processing and milling",
    "barium chemical compound manufacturing",
    "boron nitride powder and ceramic fabrication",
    "boron carbide advanced technical ceramics",
    "industrial barium compounds distributor",
    "rare earth element REE refining and separation",
    "rare earth oxide powder processing",
    "neodymium magnet NdFeB manufacturing",
    "dysprosium and terbium alloy processing",
    "samarium cobalt SmCo magnet manufacturing",
    "rare earth metal alloying and casting",
    "advanced technical ceramics manufacturing",
    "silicon carbide SiC structural component fabrication",
    "alumina ceramic industrial components",
    "zirconia ceramic wear parts and machining",
    "aluminum nitride AlN ceramic substrates",
    "piezoelectric ceramic component manufacturing",
    "silicon nitride Si3N4 ceramic fabrication",
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
    "high purity polysilicon manufacturing",
    "silicon wafer crystal pulling and slicing",
    "gallium nitride GaN epitaxial wafer manufacturing",
    "silicon carbide SiC power electronics materials",
    "critical mineral processing and extraction equipment OEM",
    "lithium extraction direct lithium extraction DLE technology",
    "rare earth solvent extraction equipment fabrication",
]

STATES = [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California",
    "Colorado", "Connecticut", "Delaware", "Florida", "Georgia",
    "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
    "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland",
    "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri",
    "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
    "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
    "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
    "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
    "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"
]

INTERNATIONAL_REGIONS = [
    "United Kingdom", "Germany", "France", "Italy", "Spain", "Poland",
    "Netherlands", "Belgium", "Sweden", "Switzerland", "Austria",
    "Canada", "Mexico", "Brazil", "Argentina", "Chile", "Colombia",
    "Japan", "South Korea", "Taiwan", "India", "Vietnam", "Thailand",
    "Malaysia", "Indonesia", "Philippines", "Singapore",
    "Australia", "New Zealand", "South Africa", "Turkey", "Israel"
]

def _extract_from_search_result(item: dict, query_base: str) -> Optional[VendorRecord]:
    """Parse a basic google search result snippet into a VendorRecord."""
    url = item.get("url") or ""
    if not url or "yellowpages" in url or "yelp" in url or "linkedin" in url or "facebook" in url or "zoominfo" in url or "manta" in url or "thomasnet" in url or "bbb.org" in url or "indeed.com" in url or "glassdoor" in url or "mapquest" in url:
        return None
        
    title = item.get("title") or ""
    title = title.split("|")[0].split("-")[0].strip()
    if not title or len(title) < 3:
        return None
        
    v = VendorRecord(
        company_name=title,
        website_url=url,
        company_description=item.get("description"),
        primary_business_type="Manufacturer/Fabricator",
    )
    return v

log = logging.getLogger("nimbleway-search")

class NimblewaySearchSource:
    name = "NimblewaySearch"

    def __init__(self, nimbleway_api_key: str, db: AsyncDB, max_queries: int = 2000):
        self.nimbleway_api_key = nimbleway_api_key
        self.db = db
        self.max_queries = max_queries
        self._queries_run = 0

    async def _search(self, query: str) -> list[dict]:
        """Run a single Nimbleway search query via HTTP REST API."""
        try:
            import aiohttp
            
            headers = {
                "Authorization": f"Bearer {self.nimbleway_api_key}",
                "Content-Type": "application/json"
            }
            
            # Using Nimble API standard Web Search endpoint
            payload = {
                "query": query,
                "focus": "general",
                "searchDepth": "lite",
                "max_results": 10
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post("https://sdk.nimbleway.com/v1/search", json=payload, headers=headers, timeout=30) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return data.get("results", [])
                    else:
                        log.debug("Nimbleway search HTTP %s", resp.status)
                        return []
        except Exception as e:
            log.debug("Nimbleway search failed for %r: %s", query, e)
            return []

    async def discover(self) -> AsyncIterator[VendorRecord]:
        seen_names = set()
        queries_done = 0
        
        # Load cached queries (Nimbleway's own cache for the new query format)
        cache_file = "nimbleway_completed_queries.txt"
        completed_queries = set()
        if os.path.exists(cache_file):
            with open(cache_file, "r", encoding="utf-8") as f:
                completed_queries = set(f.read().splitlines())
        log.info("[%s] Loaded %d completed queries from cache", self.name, len(completed_queries))

        # Reverse the queries so it mixes up the order
        reversed_queries = list(reversed(INDUSTRY_QUERIES))

        # Phase 1: 70/30 U.S. vs International weighting generator
        log.info("[%s] Starting global discovery phase with 70%% U.S. priority...", self.name)
        
        def location_generator():
            us_list = list(reversed(STATES))
            intl_list = list(INTERNATIONAL_REGIONS)
            us_idx, intl_idx = 0, 0
            
            while us_idx < len(us_list) or intl_idx < len(intl_list):
                # Yield 7 U.S. regions
                for _ in range(7):
                    if us_idx < len(us_list):
                        yield us_list[us_idx]
                        us_idx += 1
                
                # Yield 3 Intl regions
                for _ in range(3):
                    if intl_idx < len(intl_list):
                        yield intl_list[intl_idx]
                        intl_idx += 1
                        
        for query_base in reversed_queries:
            if queries_done >= self.max_queries:
                break
            for location in location_generator():
                if queries_done >= self.max_queries:
                    break
                
                # Use a slightly different query to find companies Local Scraper missed
                query = f"top {query_base} in {location}"
                
                if query in completed_queries:
                    continue
                    
                results = await self._search(query)
                self._queries_run += 1
                
                # Mark query as completed immediately
                completed_queries.add(query)
                with open(cache_file, "a", encoding="utf-8") as f:
                    f.write(query + "\n")
                    
                for r in results:
                    v = _extract_from_search_result(r, query_base)
                    if v and v.company_name.lower() not in seen_names:
                        if await self.db.is_seen_company(v.company_name, v.website_url):
                            continue
                        seen_names.add(v.company_name.lower())
                        v.data_source = f"{self.name}:{query_base[:30]}"
                        yield v
                queries_done += 1
                if queries_done % 10 == 0:
                    log.info("[%s] %d queries, %d U.S. companies found", self.name, queries_done, len(seen_names))
                await asyncio.sleep(0.5)

        log.info("[%s] Discovery phase complete.", self.name)
