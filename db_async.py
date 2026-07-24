"""Async, batched SQLite layer.

Single writer task drains a queue and flushes in chunks. WAL mode enabled.
Reuses existing `vendors.db` schema; adds `seen_urls` for cross-cycle dedup.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import asdict, dataclass, field
from typing import Iterable, Optional

from datetime import datetime

import aiosqlite
import sqlite3
import aiohttp
import os
import re

log = logging.getLogger("db")


@dataclass
class VendorRecord:
    company_name: str
    website_url: Optional[str] = None
    headquarters_location: Optional[str] = None
    facility_size_sqft: Optional[str] = None
    certifications_held: list = field(default_factory=list)
    primary_business_type: Optional[str] = None
    materials_handled: list = field(default_factory=list)
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    key_personnel: list = field(default_factory=list)
    year_established: Optional[str] = None
    thomasnet_profile_url: Optional[str] = None
    data_source: str = ""
    # --- expanded fields (Phase 1) ---
    logo_url: Optional[str] = None
    logo_local_path: Optional[str] = None
    street_address: Optional[str] = None
    city: Optional[str] = None
    state_province: Optional[str] = None
    country: Optional[str] = None
    zip_postal_code: Optional[str] = None
    company_description: Optional[str] = None
    services: list = field(default_factory=list)
    capabilities: list = field(default_factory=list)
    welding_processes: list = field(default_factory=list)
    fabrication_capabilities: list = field(default_factory=list)
    industries_served: list = field(default_factory=list)
    memberships: list = field(default_factory=list)
    equipment_list: list = field(default_factory=list)
    shop_capacity: Optional[str] = None
    employee_count: Optional[str] = None
    geographic_service_areas: list = field(default_factory=list)
    social_profiles: Optional[str] = None  # JSON object as string
    images: list = field(default_factory=list)
    contact_form_url: Optional[str] = None
    license_numbers: list = field(default_factory=list)
    registration_numbers: list = field(default_factory=list)
    language_needs_approval: bool = False
    enterprise_suitability_score: int = 0
    enterprise_rationale: Optional[str] = None
    dynamic_priority_score: int = 0
    # --- expanded fields (Phase 2) ---
    alternate_names: list = field(default_factory=list)
    sub_industries: list = field(default_factory=list)
    products: list = field(default_factory=list)
    additional_locations: list = field(default_factory=list)
    keywords: list = field(default_factory=list)
    search_tags: list = field(default_factory=list)
    ai_summary: Optional[str] = None
    use_cases: list = field(default_factory=list)
    vendor_categories: list = field(default_factory=list)
    project_types: list = field(default_factory=list)
    technical_specialties: list = field(default_factory=list)
    partnerships_and_dealers: list = field(default_factory=list)
    # --- Massive Expansion (Phase 3) ---
    ai_synopsis: Optional[str] = None
    representative_images: list = field(default_factory=list)
    # --- Enterprise Enrichment (Phase 4) ---
    ai_metadata_data: Optional[str] = None  # Full structured LLM extraction JSON blob
    inspection_and_qa_capabilities: list = field(default_factory=list)
    notable_customers: list = field(default_factory=list)
    itar_registered: bool = False
    cage_code: Optional[str] = None
    duns_number: Optional[str] = None
    iso_9001: bool = False
    as9100: bool = False
    cybersecurity_compliance: Optional[str] = None
    annual_revenue_estimate: Optional[str] = None
    lead_times: Optional[str] = None
    # --- Lifecycle & Enterprise Tier (populated by db_async on every upsert) ---
    lifecycle_stage: str = 'discovered'  # discovered | enriched | fully_built | locked | disqualified
    enterprise_tier: int = 0             # 1=large enterprise  2=regional  3=small/unclear  0=unassessed
    enrichment_attempts: int = 0

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False)


SCHEMA = """
CREATE TABLE IF NOT EXISTS vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT UNIQUE NOT NULL,
    website_url TEXT,
    headquarters_location TEXT,
    facility_size_sqft TEXT,
    certifications_held TEXT,
    primary_business_type TEXT,
    materials_handled TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    key_personnel TEXT,
    year_established TEXT,
    thomasnet_profile_url TEXT,
    data_source TEXT,
    completeness_status TEXT DEFAULT 'incomplete',
    confidence_level TEXT DEFAULT 'partial',
    data_provenance TEXT DEFAULT '{}',
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    logo_url TEXT,
    logo_local_path TEXT,
    street_address TEXT,
    city TEXT,
    state_province TEXT,
    country TEXT,
    zip_postal_code TEXT,
    company_description TEXT,
    services TEXT DEFAULT '[]',
    capabilities TEXT DEFAULT '[]',
    welding_processes TEXT DEFAULT '[]',
    fabrication_capabilities TEXT DEFAULT '[]',
    industries_served TEXT DEFAULT '[]',
    memberships TEXT DEFAULT '[]',
    equipment_list TEXT DEFAULT '[]',
    shop_capacity TEXT,
    employee_count TEXT,
    geographic_service_areas TEXT DEFAULT '[]',
    social_profiles TEXT DEFAULT '{}',
    images TEXT DEFAULT '[]',
    license_numbers TEXT DEFAULT '[]',
    registration_numbers TEXT DEFAULT '[]',
    language_needs_approval INTEGER DEFAULT 0,
    enterprise_suitability_score INTEGER DEFAULT 0,
    enterprise_rationale TEXT,
    dynamic_priority_score INTEGER DEFAULT 0,
    alternate_names TEXT DEFAULT '[]',
    sub_industries TEXT DEFAULT '[]',
    products TEXT DEFAULT '[]',
    additional_locations TEXT DEFAULT '[]',
    keywords TEXT DEFAULT '[]',
    search_tags TEXT DEFAULT '[]',
    ai_summary TEXT,
    use_cases TEXT DEFAULT '[]',
    vendor_categories TEXT DEFAULT '[]',
    project_types TEXT DEFAULT '[]',
    technical_specialties TEXT DEFAULT '[]',
    partnerships_and_dealers TEXT DEFAULT '[]',
    ai_synopsis TEXT,
    representative_images TEXT DEFAULT '[]',
    itar_registered INTEGER DEFAULT 0,
    cage_code TEXT,
    duns_number TEXT,
    iso_9001 INTEGER DEFAULT 0,
    as9100 INTEGER DEFAULT 0,
    cybersecurity_compliance TEXT,
    annual_revenue_estimate TEXT,
    lead_times TEXT,
    enrichment_attempts INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_vendors_website ON vendors(website_url);
CREATE INDEX IF NOT EXISTS idx_vendors_city ON vendors(city);
CREATE INDEX IF NOT EXISTS idx_vendors_state ON vendors(state_province);
CREATE TABLE IF NOT EXISTS seen_urls (
    url TEXT PRIMARY KEY,
    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_scraped TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    scrape_count INTEGER DEFAULT 1,
    source TEXT
);
CREATE TABLE IF NOT EXISTS url_cache (
    url TEXT PRIMARY KEY,
    md_text TEXT,
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS certifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_id INTEGER REFERENCES vendors(id),
    company_name TEXT NOT NULL,
    certification_type TEXT,
    certification_number TEXT,
    certification_status TEXT DEFAULT 'active',
    expiration_date TEXT,
    registry_id TEXT,
    issuing_organization TEXT,
    verification_url TEXT,
    metadata TEXT DEFAULT '{}',
    source TEXT,
    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_verified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_name, certification_type, certification_number)
);
CREATE INDEX IF NOT EXISTS idx_cert_vendor ON certifications(vendor_id);
CREATE INDEX IF NOT EXISTS idx_cert_company ON certifications(company_name);
CREATE INDEX IF NOT EXISTS idx_cert_type ON certifications(certification_type);

CREATE VIRTUAL TABLE IF NOT EXISTS vendors_fts USING fts5(
    company_name,
    company_description,
    capabilities,
    services,
    ai_summary,
    search_tags,
    keywords,
    partnerships_and_dealers,
    identity_data,
    business_data,
    capabilities_data,
    certifications_data,
    relationships_data,
    products_data,
    experience_data,
    geographic_data,
    business_info_data,
    digital_presence_data,
    brand_assets_data,
    reputation_data,
    ai_metadata_data,
    content='vendors',
    content_rowid='id'
);
"""

# Idempotent migrations for pre-existing DBs. Each runs in its own try block
# so a previously-applied migration doesn't block the next.
# TTL for seen_urls: URLs older than this many days are eligible for re-scrape.
SEEN_URL_TTL_DAYS = 30

MIGRATIONS = [
    "ALTER TABLE vendors ADD COLUMN completeness_status TEXT DEFAULT 'incomplete'",
    "ALTER TABLE vendors ADD COLUMN confidence_level TEXT DEFAULT 'partial'",
    "ALTER TABLE vendors ADD COLUMN data_provenance TEXT DEFAULT '{}'",
    "CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(completeness_status)",
    "CREATE INDEX IF NOT EXISTS idx_vendors_confidence ON vendors(confidence_level)",
    "CREATE INDEX IF NOT EXISTS idx_vendors_last_updated ON vendors(last_updated)",
    "CREATE INDEX IF NOT EXISTS idx_vendors_country ON vendors(country)",
    "ALTER TABLE vendors ADD COLUMN enterprise_suitability_score INTEGER DEFAULT 0",
    "ALTER TABLE vendors ADD COLUMN enterprise_rationale TEXT",
    "CREATE INDEX IF NOT EXISTS idx_vendors_enterprise_score ON vendors(enterprise_suitability_score)",
    "ALTER TABLE vendors ADD COLUMN dynamic_priority_score INTEGER DEFAULT 0",
    "CREATE INDEX IF NOT EXISTS idx_vendors_priority ON vendors(dynamic_priority_score DESC)",
    # seen_urls TTL support
    "ALTER TABLE seen_urls ADD COLUMN last_scraped TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    "ALTER TABLE seen_urls ADD COLUMN scrape_count INTEGER DEFAULT 1",
    # --- Phase 1 expanded fields ---
    "ALTER TABLE vendors ADD COLUMN logo_url TEXT",
    "ALTER TABLE vendors ADD COLUMN logo_local_path TEXT",
    "ALTER TABLE vendors ADD COLUMN street_address TEXT",
    "ALTER TABLE vendors ADD COLUMN city TEXT",
    "ALTER TABLE vendors ADD COLUMN state_province TEXT",
    "ALTER TABLE vendors ADD COLUMN country TEXT",
    "ALTER TABLE vendors ADD COLUMN zip_postal_code TEXT",
    "ALTER TABLE vendors ADD COLUMN company_description TEXT",
    "ALTER TABLE vendors ADD COLUMN services TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN capabilities TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN welding_processes TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN fabrication_capabilities TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN industries_served TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN memberships TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN equipment_list TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN shop_capacity TEXT",
    "ALTER TABLE vendors ADD COLUMN employee_count TEXT",
    "ALTER TABLE vendors ADD COLUMN geographic_service_areas TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN social_profiles TEXT DEFAULT '{}'",
    "ALTER TABLE vendors ADD COLUMN images TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN contact_form_url TEXT",
    "ALTER TABLE vendors ADD COLUMN license_numbers TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN registration_numbers TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN language_needs_approval INTEGER DEFAULT 0",
    # --- Phase 2 expanded fields ---
    "ALTER TABLE vendors ADD COLUMN alternate_names TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN sub_industries TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN products TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN additional_locations TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN keywords TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN search_tags TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN ai_summary TEXT",
    "ALTER TABLE vendors ADD COLUMN use_cases TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN vendor_categories TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN project_types TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN technical_specialties TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN partnerships_and_dealers TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN identity_data TEXT DEFAULT '{}'",
    "ALTER TABLE vendors ADD COLUMN business_data TEXT DEFAULT '{}'",
    "ALTER TABLE vendors ADD COLUMN capabilities_data TEXT DEFAULT '{}'",
    "ALTER TABLE vendors ADD COLUMN certifications_data TEXT DEFAULT '{}'",
    "ALTER TABLE vendors ADD COLUMN relationships_data TEXT DEFAULT '{}'",
    "ALTER TABLE vendors ADD COLUMN products_data TEXT DEFAULT '{}'",
    "ALTER TABLE vendors ADD COLUMN experience_data TEXT DEFAULT '{}'",
    "ALTER TABLE vendors ADD COLUMN geographic_data TEXT DEFAULT '{}'",
    "ALTER TABLE vendors ADD COLUMN business_info_data TEXT DEFAULT '{}'",
    "ALTER TABLE vendors ADD COLUMN digital_presence_data TEXT DEFAULT '{}'",
    "ALTER TABLE vendors ADD COLUMN brand_assets_data TEXT DEFAULT '{}'",
    "ALTER TABLE vendors ADD COLUMN reputation_data TEXT DEFAULT '{}'",
    "ALTER TABLE vendors ADD COLUMN ai_metadata_data TEXT DEFAULT '{}'",
    "ALTER TABLE vendors ADD COLUMN ai_synopsis TEXT",
    "ALTER TABLE vendors ADD COLUMN inspection_and_qa_capabilities TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN notable_customers TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN representative_images TEXT DEFAULT '[]'",
    "ALTER TABLE vendors ADD COLUMN itar_registered INTEGER DEFAULT 0",
    "ALTER TABLE vendors ADD COLUMN cage_code TEXT",
    "ALTER TABLE vendors ADD COLUMN duns_number TEXT",
    "ALTER TABLE vendors ADD COLUMN iso_9001 INTEGER DEFAULT 0",
    "ALTER TABLE vendors ADD COLUMN as9100 INTEGER DEFAULT 0",
    "ALTER TABLE vendors ADD COLUMN cybersecurity_compliance TEXT",
    "ALTER TABLE vendors ADD COLUMN annual_revenue_estimate TEXT",
    "ALTER TABLE vendors ADD COLUMN lead_times TEXT",
    "ALTER TABLE vendors ADD COLUMN enrichment_attempts INTEGER DEFAULT 0",
    "CREATE INDEX IF NOT EXISTS idx_vendors_city ON vendors(city)",
    "CREATE INDEX IF NOT EXISTS idx_vendors_state ON vendors(state_province)",
    # Certifications table
    """CREATE TABLE IF NOT EXISTS certifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendor_id INTEGER REFERENCES vendors(id),
        company_name TEXT NOT NULL,
        certification_type TEXT,
        certification_number TEXT,
        certification_status TEXT DEFAULT 'active',
        expiration_date TEXT,
        registry_id TEXT,
        issuing_organization TEXT,
        verification_url TEXT,
        metadata TEXT DEFAULT '{}',
        source TEXT,
        first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_verified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_name, certification_type, certification_number)
    )""",
    "CREATE INDEX IF NOT EXISTS idx_cert_vendor ON certifications(vendor_id)",
    "CREATE INDEX IF NOT EXISTS idx_cert_company ON certifications(company_name)",
    "CREATE INDEX IF NOT EXISTS idx_cert_type ON certifications(certification_type)",
    "DROP TABLE IF EXISTS vendors_fts",
    "DROP TRIGGER IF EXISTS vendors_ai",
    "DROP TRIGGER IF EXISTS vendors_ad",
    "DROP TRIGGER IF EXISTS vendors_au",
    "CREATE VIRTUAL TABLE IF NOT EXISTS vendors_fts USING fts5(company_name, company_description, capabilities, services, ai_summary, search_tags, keywords, partnerships_and_dealers, identity_data, business_data, capabilities_data, certifications_data, relationships_data, products_data, experience_data, geographic_data, business_info_data, digital_presence_data, brand_assets_data, reputation_data, ai_metadata_data, content='vendors', content_rowid='id')",
    "CREATE TRIGGER IF NOT EXISTS vendors_ai AFTER INSERT ON vendors BEGIN INSERT INTO vendors_fts(rowid, company_name, company_description, capabilities, services, ai_summary, search_tags, keywords, partnerships_and_dealers, identity_data, business_data, capabilities_data, certifications_data, relationships_data, products_data, experience_data, geographic_data, business_info_data, digital_presence_data, brand_assets_data, reputation_data, ai_metadata_data) VALUES (new.id, new.company_name, new.company_description, new.capabilities, new.services, new.ai_summary, new.search_tags, new.keywords, new.partnerships_and_dealers, new.identity_data, new.business_data, new.capabilities_data, new.certifications_data, new.relationships_data, new.products_data, new.experience_data, new.geographic_data, new.business_info_data, new.digital_presence_data, new.brand_assets_data, new.reputation_data, new.ai_metadata_data); END;",
    "CREATE TRIGGER IF NOT EXISTS vendors_ad AFTER DELETE ON vendors BEGIN INSERT INTO vendors_fts(vendors_fts, rowid, company_name, company_description, capabilities, services, ai_summary, search_tags, keywords, partnerships_and_dealers, identity_data, business_data, capabilities_data, certifications_data, relationships_data, products_data, experience_data, geographic_data, business_info_data, digital_presence_data, brand_assets_data, reputation_data, ai_metadata_data) VALUES ('delete', old.id, old.company_name, old.company_description, old.capabilities, old.services, old.ai_summary, old.search_tags, old.keywords, old.partnerships_and_dealers, old.identity_data, old.business_data, old.capabilities_data, old.certifications_data, old.relationships_data, old.products_data, old.experience_data, old.geographic_data, old.business_info_data, old.digital_presence_data, old.brand_assets_data, old.reputation_data, old.ai_metadata_data); END;",
    "CREATE TRIGGER IF NOT EXISTS vendors_au AFTER UPDATE ON vendors BEGIN INSERT INTO vendors_fts(vendors_fts, rowid, company_name, company_description, capabilities, services, ai_summary, search_tags, keywords, partnerships_and_dealers, identity_data, business_data, capabilities_data, certifications_data, relationships_data, products_data, experience_data, geographic_data, business_info_data, digital_presence_data, brand_assets_data, reputation_data, ai_metadata_data) VALUES ('delete', old.id, old.company_name, old.company_description, old.capabilities, old.services, old.ai_summary, old.search_tags, old.keywords, old.partnerships_and_dealers, old.identity_data, old.business_data, old.capabilities_data, old.certifications_data, old.relationships_data, old.products_data, old.experience_data, old.geographic_data, old.business_info_data, old.digital_presence_data, old.brand_assets_data, old.reputation_data, old.ai_metadata_data); INSERT INTO vendors_fts(rowid, company_name, company_description, capabilities, services, ai_summary, search_tags, keywords, partnerships_and_dealers, identity_data, business_data, capabilities_data, certifications_data, relationships_data, products_data, experience_data, geographic_data, business_info_data, digital_presence_data, brand_assets_data, reputation_data, ai_metadata_data) VALUES (new.id, new.company_name, new.company_description, new.capabilities, new.services, new.ai_summary, new.search_tags, new.keywords, new.partnerships_and_dealers, new.identity_data, new.business_data, new.capabilities_data, new.certifications_data, new.relationships_data, new.products_data, new.experience_data, new.geographic_data, new.business_info_data, new.digital_presence_data, new.brand_assets_data, new.reputation_data, new.ai_metadata_data); END;",
    "INSERT INTO vendors_fts(vendors_fts) VALUES('rebuild')",
    # --- Lifecycle & Enterprise Tier columns (idempotent) ---
    "ALTER TABLE vendors ADD COLUMN lifecycle_stage TEXT DEFAULT 'discovered'",
    "ALTER TABLE vendors ADD COLUMN enterprise_tier INTEGER DEFAULT 0",
    "CREATE INDEX IF NOT EXISTS idx_vendors_lifecycle ON vendors(lifecycle_stage)",
    "CREATE INDEX IF NOT EXISTS idx_vendors_enterprise_tier ON vendors(enterprise_tier)",
]


def assess_completeness(v: "VendorRecord | dict") -> str:
    """Return 'verified' or 'incomplete'.

    Verified: name + location + at least one direct-contact channel
              (phone, email, or its own website). High-trust record.
    Incomplete: name + any other identifier. Worth keeping for future
                enrichment + customer correction.
    """
    def g(field):
        return getattr(v, field, None) if not isinstance(v, dict) else v.get(field)
    name = (g("company_name") or "").strip()
    if not name:
        return "incomplete"
    loc = bool((g("headquarters_location") or "").strip())
    ph = bool((g("contact_phone") or "").strip())
    em = bool((g("contact_email") or "").strip())
    web = bool((g("website_url") or "").strip())
    if loc and (ph or em or web):
        return "verified"
    return "incomplete"


def assess_confidence(v: "VendorRecord | dict") -> str:
    """Return 'verified' | 'partial' | 'inferred' | 'unconfirmed'.

    Used alongside completeness_status to separate provenance quality
    from field-count quality.

      verified    -> sourced from a certification registry where we have
                     name + location + at least one direct-contact field
                     AND ≥1 cert label.
      partial     -> sourced from a registry but missing contact data.
      inferred    -> field came from a non-authoritative source (e.g. an
                     OpenCorporates match keyed only on name+state).
      unconfirmed -> harvested URL only — name derived from a URL slug
                     or a Thomasnet listing that we haven't deep-scraped.
    """
    def g(field):
        return getattr(v, field, None) if not isinstance(v, dict) else v.get(field)
    src = (g("data_source") or "").lower()
    name = (g("company_name") or "").strip()
    if not name:
        return "unconfirmed"
    loc = bool((g("headquarters_location") or "").strip())
    ph = bool((g("contact_phone") or "").strip())
    em = bool((g("contact_email") or "").strip())
    web = bool((g("website_url") or "").strip())
    certs = g("certifications_held") or []
    if isinstance(certs, str):
        try:
            import json as _j
            certs = _j.loads(certs or "[]")
        except Exception:
            certs = []
    if src.startswith("thomasnet"):
        return "partial" if (loc or ph or web) else "unconfirmed"
    if src.startswith("opencorporates"):
        return "inferred"
    # registry sources (CEMA, TEMA, HEI, STI-SPFA, NBIC, AWS, ASME, AISC)
    if any(certs) and loc and (ph or em or web):
        return "verified"
    if any(certs):
        return "partial"
    return "inferred"


def has_any_identifier(v: "VendorRecord | dict") -> bool:
    """True if record has name + at least one other identifying field.

    Used by source parsers to decide whether to keep a candidate at all.
    Records that only have a name (no location/phone/email/web/cert/profile/
    personnel) are treated as noise and dropped before insert.
    """
    def g(field):
        return getattr(v, field, None) if not isinstance(v, dict) else v.get(field)
    name = (g("company_name") or "").strip()
    if not name:
        return False
    for f in ("headquarters_location", "contact_phone", "contact_email",
              "website_url", "thomasnet_profile_url"):
        if (g(f) or "").strip():
            return True
    for f in ("certifications_held", "key_personnel", "materials_handled"):
        val = g(f)
        if val and isinstance(val, (list, tuple)) and any(val):
            return True
    if (g("primary_business_type") or "").strip():
        return True
    return False

# We now need a two-step upsert: read-merge-write for list fields.
# The simple INSERT OR IGNORE seeds the row; the UPDATE merges.
INSERT_SQL = """
INSERT OR IGNORE INTO vendors (
    company_name, website_url, headquarters_location, facility_size_sqft,
    certifications_held, primary_business_type, materials_handled,
    contact_email, contact_phone, key_personnel, year_established,
    thomasnet_profile_url, data_source, completeness_status,
    confidence_level, data_provenance,
    logo_url, logo_local_path, street_address, city, state_province, country,
    zip_postal_code, company_description, services, capabilities,
    welding_processes, fabrication_capabilities, industries_served,
    memberships, equipment_list, shop_capacity, employee_count,
    geographic_service_areas, social_profiles, images, contact_form_url,
    license_numbers, registration_numbers, language_needs_approval,
    enterprise_suitability_score, enterprise_rationale, dynamic_priority_score,
    alternate_names, sub_industries, products, additional_locations,
    keywords, search_tags, ai_summary, use_cases, vendor_categories,
    project_types, technical_specialties, partnerships_and_dealers,
    ai_synopsis, representative_images
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);
"""

UPDATE_SQL = """
UPDATE vendors SET
    website_url=COALESCE(?, vendors.website_url),
    headquarters_location=COALESCE(?, vendors.headquarters_location),
    facility_size_sqft=COALESCE(?, vendors.facility_size_sqft),
    certifications_held=?,
    primary_business_type=COALESCE(?, vendors.primary_business_type),
    materials_handled=?,
    contact_email=COALESCE(?, vendors.contact_email),
    contact_phone=COALESCE(?, vendors.contact_phone),
    key_personnel=?,
    year_established=COALESCE(?, vendors.year_established),
    thomasnet_profile_url=COALESCE(?, vendors.thomasnet_profile_url),
    data_source=?,
    completeness_status=?,
    confidence_level=?,
    data_provenance=?,
    logo_url=COALESCE(?, vendors.logo_url),
    logo_local_path=COALESCE(?, vendors.logo_local_path),
    street_address=COALESCE(?, vendors.street_address),
    city=COALESCE(?, vendors.city),
    state_province=COALESCE(?, vendors.state_province),
    country=COALESCE(?, vendors.country),
    zip_postal_code=COALESCE(?, vendors.zip_postal_code),
    company_description=COALESCE(?, vendors.company_description),
    services=?,
    capabilities=?,
    welding_processes=?,
    fabrication_capabilities=?,
    industries_served=?,
    memberships=?,
    equipment_list=?,
    shop_capacity=COALESCE(?, vendors.shop_capacity),
    employee_count=COALESCE(?, vendors.employee_count),
    geographic_service_areas=?,
    social_profiles=COALESCE(?, vendors.social_profiles),
    images=?,
    contact_form_url=COALESCE(?, vendors.contact_form_url),
    license_numbers=?,
    registration_numbers=?,
    language_needs_approval=COALESCE(?, vendors.language_needs_approval),
    enterprise_suitability_score=COALESCE(?, vendors.enterprise_suitability_score),
    enterprise_rationale=COALESCE(?, vendors.enterprise_rationale),
    dynamic_priority_score=COALESCE(?, vendors.dynamic_priority_score),
    alternate_names=?,
    sub_industries=?,
    products=?,
    additional_locations=?,
    keywords=?,
    search_tags=?,
    ai_summary=COALESCE(?, vendors.ai_summary),
    use_cases=?,
    vendor_categories=?,
    project_types=?,
    technical_specialties=?,
    partnerships_and_dealers=?,
    ai_synopsis=COALESCE(?, vendors.ai_synopsis),
    representative_images=?,
    identity_data=?,
    business_data=?,
    capabilities_data=?,
    certifications_data=?,
    relationships_data=?,
    products_data=?,
    experience_data=?,
    geographic_data=?,
    business_info_data=?,
    digital_presence_data=?,
    brand_assets_data=?,
    reputation_data=?,
    ai_metadata_data=?,
    inspection_and_qa_capabilities=?,
    notable_customers=?,
    enterprise_tier=?,
    lifecycle_stage=CASE WHEN lifecycle_stage IN ('fully_built','locked') THEN lifecycle_stage ELSE ? END,
    last_updated=CURRENT_TIMESTAMP
WHERE company_name=?;
"""


# All list-type fields on VendorRecord that get JSON-serialized in the DB.
LIST_FIELDS = (
    "certifications_held", "materials_handled", "key_personnel",
    "services", "capabilities", "welding_processes",
    "fabrication_capabilities", "industries_served", "memberships",
    "equipment_list", "geographic_service_areas", "images",
    "license_numbers", "registration_numbers",
    "alternate_names", "sub_industries", "products", "additional_locations",
    "keywords", "search_tags", "use_cases", "vendor_categories",
    "project_types", "technical_specialties", "partnerships_and_dealers",
    "representative_images",
)


DICT_FIELDS = ()

SCALAR_FIELDS = (
    "company_name", "website_url", "headquarters_location",
    "facility_size_sqft", "primary_business_type", "contact_email",
    "contact_phone", "year_established", "thomasnet_profile_url",
    "logo_url", "logo_local_path", "street_address", "city", "state_province",
    "country", "zip_postal_code", "company_description",
    "shop_capacity", "employee_count", "social_profiles",
    "contact_form_url", "language_needs_approval", "ai_summary", "enterprise_suitability_score", "enterprise_rationale", "dynamic_priority_score", "ai_synopsis", "enrichment_attempts",
)


def _build_provenance(v: VendorRecord) -> str:
    """Default provenance: every populated field is attributed to v.data_source."""
    src = (v.data_source or "unknown").strip()
    try:
        from datetime import timezone
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    except Exception:
        today = datetime.utcnow().strftime("%Y-%m-%d")
    prov: dict = {}
    for f in SCALAR_FIELDS:
        val = getattr(v, f, None)
        if val:
            prov[f] = {"source": src, "date": today}
    for f in LIST_FIELDS:
        val = getattr(v, f, None) or []
        if val:
            prov[f] = {"source": src, "date": today}
    return json.dumps(prov)


def _merge_json_lists(existing_json: str, new_list) -> str:
    """Union-merge two JSON-encoded lists, preserving existing items."""
    try:
        existing = json.loads(existing_json or "[]")
    except (json.JSONDecodeError, TypeError):
        existing = []
    if not isinstance(existing, list):
        existing = []
        
    if isinstance(new_list, str):
        try:
            new_list = json.loads(new_list or "[]")
        except (json.JSONDecodeError, TypeError):
            new_list = []
    if not isinstance(new_list, list):
        new_list = []
        
    # We convert to string to make unhashable types (like dicts) safe-ish if they sneak in,
    # but normally these are strings. To safely preserve order and distinctness of primitives:
    merged = []
    for item in existing + new_list:
        if item not in merged:
            merged.append(item)
    return json.dumps(merged)


def _merge_sources(existing_source: str, new_source: str) -> str:
    """Track all contributing data sources as a pipe-delimited string."""
    existing_parts = {s.strip() for s in (existing_source or "").split("|") if s.strip()}
    new_source = (new_source or "").strip()
    if new_source:
        existing_parts.add(new_source)
    return " | ".join(sorted(existing_parts))


def _merge_provenance(existing_json: str, new_json: str) -> str:
    """Deep-merge provenance dicts: new fields overwrite per-field, existing are preserved."""
    try:
        existing = json.loads(existing_json or "{}")
    except (json.JSONDecodeError, TypeError):
        existing = {}
    try:
        new = json.loads(new_json or "{}")
    except (json.JSONDecodeError, TypeError):
        new = {}
    if not isinstance(existing, dict):
        existing = {}
    if not isinstance(new, dict):
        new = {}
    # New fields overwrite existing per-field entries (latest source wins per field)
    merged = {**existing, **new}
    return json.dumps(merged)




def calculate_dynamic_priority(v: VendorRecord) -> int:
    score = 0
    if v.website_url: score += 50
    if v.contact_email: score += 20
    if v.contact_phone: score += 10
    
    country = (v.country or "").lower()
    if country in ("us", "usa", "united states", "united states of america"):
        score += 5000
    elif country != "":
        score -= 5000
        
    if v.website_url:
        tld = v.website_url.split('.')[-1].split('/')[0].lower()
        if tld in ('uk', 'au', 'ca', 'de', 'fr', 'in', 'cn', 'jp', 'mx', 'nz', 'za', 'ie', 'sg', 'pl', 'nl', 'it', 'es'):
            score -= 5000
        
    if v.enterprise_suitability_score:
        score += (v.enterprise_suitability_score * 3) # Max 300
        
    certs = v.certifications_held or []
    if certs:
        score += (len(certs) * 50)
        
    # NEW: Industrial Keyword Pre-Ranking
    desc = (v.company_description or "").lower()
    svcs = " ".join([s.lower() for s in (v.services or [])])
    bt = (v.primary_business_type or "").lower()
    combined_text = f"{desc} {svcs} {bt}"
    
    industrial_keywords = [
        "pressure vessel", "subsea", "undersea", "infrastructure", "fiberglass", "frp",
        "dualaminate", "inspection", "ndt", "orbital welding", "structural steel", 
        "asme", "api", "code-certified", "nace", "ampp", "fabrication", "alloy",
        "reactive metals", "titanium", "tantalum", "zirconium", "heavy wall"
    ]
    matches = sum(1 for kw in industrial_keywords if kw in combined_text)
    if matches > 0:
        # Boost up to 300 points for heavy industrial keyword density
        score += min(matches * 50, 300)
        
    if not v.website_url and not v.thomasnet_profile_url:
        score -= 500
        
    return score

def assess_enterprise_score(v: VendorRecord) -> int:
    score = 0
    desc = (v.company_description or "").lower()
    if "fortune 500" in desc or "enterprise" in desc or "fortune 100" in desc:
        score += 30
    certs = [c.lower() for c in (v.certifications_held or [])]
    for c in certs:
        if any(x in c for x in ["as9100", "iatf", "iso 9001", "nadcap", "asme", "nbic", "api ", "aws-cwi", "nace", "ampp", "ndt", "level ii", "level iii"]):
            score += 50
            break
    if v.facility_size_sqft:
        import re as _re
        nums = _re.findall(r'\d+', v.facility_size_sqft.replace(',', ''))
        if nums and int(nums[0]) > 50000:
            score += 15
    if (v.data_source or "").lower().startswith("thomasnet"):
        score += 10
    return min(100, score)


def assess_enterprise_tier(v) -> int:
    """Return 1, 2, or 3.

    1 = Large enterprise — certifications, Fortune 500 adjacency, defense/aerospace/nuclear/
        pressure-vessel signals, or strong enterprise suitability score.
    2 = Regional enterprise — credible web presence + some industrial credential.
    3 = Small / unclear — no enterprise signals; mom-and-pop / consumer / ambiguous.

    0 is reserved for the default unassessed state (DB default); this function never
    returns 0 — every evaluated record gets 1, 2, or 3.
    """
    def g(f):
        return getattr(v, f, None) if not isinstance(v, dict) else v.get(f)

    tier_score = 0

    # --- High-signal enterprise certifications ---
    certs = g("certifications_held") or []
    if isinstance(certs, str):
        try:
            certs = json.loads(certs or "[]")
        except Exception:
            certs = []
    certs_text = " ".join(str(c).lower() for c in certs)
    ENTERPRISE_CERTS = [
        "asme", "api ", "as9100", "nadcap", "nqa-1", "itar", "nbic", "r stamp",
        "aws-cwi", "nace", "ampp", "iso 9001", "iatf 16949", "iso 13485",
        "ul listed", "nrtl", "ped", "atex", "dnv", "lloyd", "aws d1",
    ]
    if any(ec in certs_text for ec in ENTERPRISE_CERTS):
        tier_score += 3

    # --- Fortune 500 / OEM adjacency ---
    notable = g("notable_customers") or []
    if isinstance(notable, str):
        try:
            notable = json.loads(notable or "[]")
        except Exception:
            notable = []
    if notable:
        tier_score += 4

    # --- Enterprise keywords in description / synopsis / services ---
    desc = (
        (g("company_description") or "") + " " +
        (g("ai_synopsis") or "") + " " +
        " ".join(str(s) for s in (g("services") or []))
    ).lower()
    TIER1_KEYWORDS = [
        "pressure vessel", "subsea", "nuclear", "aerospace", "defense",
        "fortune 500", "tier 1 supplier", "prime contractor", "oem supplier",
        "federal contract", "department of defense", "military",
        "u-stamp", "u stamp", "asme code", "api 6a", "api 16a",
        "nadcap accredited", "itar registered",
    ]
    hits = sum(1 for kw in TIER1_KEYWORDS if kw in desc)
    tier_score += min(hits * 2, 6)

    # --- Existing enterprise suitability score (LLM-assessed) ---
    ent = int(g("enterprise_suitability_score") or 0)
    if ent >= 70:
        tier_score += 3
    elif ent >= 50:
        tier_score += 2

    # --- Baseline operational signals ---
    if g("website_url"):
        tier_score += 1
    if g("contact_email") and g("contact_phone"):
        tier_score += 1
    dps = int(g("dynamic_priority_score") or 0)
    if dps >= 500:
        tier_score += 2
    elif dps >= 200:
        tier_score += 1
    if "thomasnet" in (g("data_source") or "").lower():
        tier_score += 1

    # --- Tier assignment ---
    if tier_score >= 6:
        return 1   # Strong enterprise signals
    if tier_score >= 2:
        return 2   # Regional / mid-market enterprise
    return 3       # Small / unclear / consumer — do not burn enrichment credits


def is_fully_built(v) -> bool:
    """Return True when this vendor has a complete enterprise profile.

    A fully-built record satisfies ALL of:
    - LLM synopsis ≥ 30 words (real paragraph, not a stub)
    - ai_metadata_data is a populated JSON blob (full structured extraction)
    - At least one contact channel (email, phone, or website URL)
    - Enterprise tier is 1 or 2 (not a small operation)

    Once True, the record is marked lifecycle_stage='fully_built' and excluded
    from all future enrichment passes.
    """
    def g(f):
        return getattr(v, f, None) if not isinstance(v, dict) else v.get(f)

    synopsis = (g("ai_synopsis") or "").strip()
    if len(synopsis.split()) < 30:
        return False

    metadata = g("ai_metadata_data") or ""
    if not metadata or metadata in ('{}', '', '""', "{}"):
        return False

    if not (g("contact_email") or g("contact_phone") or g("website_url")):
        return False

    tier = int(g("enterprise_tier") or 0)
    if tier == 3:
        return False

    return True


def _insert_row(v: VendorRecord) -> tuple:
    """Row tuple for initial INSERT OR IGNORE."""
    return (
        _sanitize_name(v.company_name),
        v.website_url,
        v.headquarters_location,
        v.facility_size_sqft,
        json.dumps(v.certifications_held or []),
        v.primary_business_type,
        json.dumps(v.materials_handled or []),
        v.contact_email,
        v.contact_phone,
        json.dumps(v.key_personnel or []),
        v.year_established,
        v.thomasnet_profile_url,
        v.data_source,
        assess_completeness(v),
        assess_confidence(v),
        _build_provenance(v),
        # expanded fields
        v.logo_url,
        v.logo_local_path,
        v.street_address,
        v.city,
        v.state_province,
        v.country,
        v.zip_postal_code,
        v.company_description,
        json.dumps(v.services or []),
        json.dumps(v.capabilities or []),
        json.dumps(v.welding_processes or []),
        json.dumps(v.fabrication_capabilities or []),
        json.dumps(v.industries_served or []),
        json.dumps(v.memberships or []),
        json.dumps(v.equipment_list or []),
        v.shop_capacity,
        v.employee_count,
        json.dumps(v.geographic_service_areas or []),
        json.dumps(v.social_profiles) if isinstance(v.social_profiles, dict) else (v.social_profiles or "{}"),
        json.dumps(v.images or []),
        v.contact_form_url,
        json.dumps(v.license_numbers or []),
        json.dumps(v.registration_numbers or []),
        int(v.language_needs_approval),
        v.enterprise_suitability_score,
        v.enterprise_rationale,
        v.dynamic_priority_score,
        json.dumps(v.alternate_names or []),
        json.dumps(v.sub_industries or []),
        json.dumps(v.products or []),
        json.dumps(v.additional_locations or []),
        json.dumps(v.keywords or []),
        json.dumps(v.search_tags or []),
        v.ai_summary,
        json.dumps(v.use_cases or []),
        json.dumps(v.vendor_categories or []),
        json.dumps(v.project_types or []),
        json.dumps(v.technical_specialties or []),
        json.dumps(v.partnerships_and_dealers or []),
        v.ai_synopsis,
        json.dumps(v.representative_images or []),
    )


def _sanitize_name(name: str) -> str:
    """Clean company name: strip markdown, HTML entities, control chars."""
    import html as _html
    import re as _re
    name = (name or "").strip()
    # Decode HTML entities
    name = _html.unescape(name)
    # Strip nested markdown image+link: [![alt](img_url)](link_url) -> alt
    name = _re.sub(r'\[!\[([^\]]*)\]\([^)]+\)\]\([^)]+\)', r'\1', name)
    # Strip markdown images: ![alt](url) -> alt
    name = _re.sub(r'!\[([^\]]*)\]\([^)]+\)', r'\1', name)
    # Strip markdown links: [text](url) -> text
    name = _re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', name)
    # Strip markdown formatting chars
    name = _re.sub(r'[*#_`~>]', '', name)
    # Remove control characters
    name = _re.sub(r'[\x00-\x1f\x7f-\x9f]', '', name)
    # Collapse whitespace
    name = _re.sub(r'\s+', ' ', name).strip()
    # Strip leading/trailing punctuation that shouldn't be in names
    name = name.strip(' ,-.')
    return name


async def download_logo(url: str, company_name: str) -> Optional[str]:
    if not url:
        return None
    try:
        ext = url.split('.')[-1].split('?')[0]
        if len(ext) > 5 or '/' in ext:
            ext = 'png'
            
        clean_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', company_name).lower()
        file_name = f"{clean_name}_logo.{ext}"
        save_path = os.path.join("logos", file_name)
        
        if os.path.exists(save_path):
            return save_path
            
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=15) as resp:
                if resp.status == 200:
                    with open(save_path, "wb") as f:
                        f.write(await resp.read())
                    return save_path
    except Exception as e:
        log.debug("Failed to download logo for %s from %s: %s", company_name, url, e)
    return None


def _merge_json_dicts(existing_json: str, new_dict: dict) -> str:
    """Deep-merge dictionaries."""
    try:
        existing = json.loads(existing_json or "{}")
    except (json.JSONDecodeError, TypeError):
        existing = {}
    if not isinstance(existing, dict):
        existing = {}
    
    def deep_merge(d1, d2):
        for k, v in d2.items():
            if k in d1 and isinstance(d1[k], dict) and isinstance(v, dict):
                d1[k] = deep_merge(d1[k], v)
            elif k in d1 and isinstance(d1[k], list) and isinstance(v, list):
                # Union the lists
                d1[k] = list({json.dumps(x, sort_keys=True): x for x in (d1[k] + v)}.values())
            elif v is not None:
                d1[k] = v
        return d1
        
    merged = deep_merge(existing, new_dict or {})
    return json.dumps(merged)

class AsyncDB:
    """Background-writer SQLite. Producers `.put()`, single coroutine flushes."""

    def __init__(self, db_path: str = "vendors.db", flush_size: int = 100, flush_interval_s: float = 2.0):
        self.db_path = db_path
        self.flush_size = flush_size
        self.flush_interval_s = flush_interval_s
        self._vendor_q: asyncio.Queue[tuple[VendorRecord, Optional[asyncio.Future]]] = asyncio.Queue(maxsize=5000)
        self._url_q: asyncio.Queue[tuple[str, str]] = asyncio.Queue(maxsize=5000)
        self._cert_q: asyncio.Queue[tuple[str, dict]] = asyncio.Queue(maxsize=5000)
        self._touch_q: asyncio.Queue[str] = asyncio.Queue(maxsize=5000)
        self._logo_q: asyncio.Queue[tuple[str, str]] = asyncio.Queue(maxsize=5000)
        self._logo_update_q: asyncio.Queue[tuple[str, str]] = asyncio.Queue(maxsize=5000)  # (local_path, company_name) — written by logo worker, drained by _writer_loop
        self._stop = asyncio.Event()
        self._writer_task: Optional[asyncio.Task] = None
        self._logo_task: Optional[asyncio.Task] = None
        self.written = 0
        self.urls_marked = 0
        self.certs_written = 0
        self._seen_cache: dict[str, str] = {}  # url -> last_scraped ISO timestamp

    async def open(self):
        async with aiosqlite.connect(self.db_path, timeout=60.0) as conn:
            await conn.executescript(SCHEMA)
            for sql in MIGRATIONS:
                try:
                    await conn.execute(sql)
                except Exception:
                    pass  # already applied
            await conn.commit()
            await conn.execute("PRAGMA journal_mode=WAL")
            await conn.execute("PRAGMA synchronous=NORMAL")
            async with conn.execute("SELECT url, COALESCE(last_scraped, first_seen) as ls FROM seen_urls") as cur:
                async for row in cur:
                    self._seen_cache[row[0]] = row[1] or ""
        log.info("DB open: %s (seen_urls cache=%d)", self.db_path, len(self._seen_cache))
        self._writer_task = asyncio.create_task(self._writer_loop(), name="db-writer")
        self._logo_task = asyncio.create_task(self._logo_worker_loop(), name="db-logo-worker")

    async def _logo_worker_loop(self):
        """Background worker that downloads logos and queues DB updates.

        IMPORTANT: This worker does NOT open its own database connection.
        It downloads files to disk, then pushes (local_path, company_name)
        tuples onto _logo_update_q, which the single _writer_loop drains.
        This eliminates the second write connection that caused lock contention.
        """
        while not self._stop.is_set():
            try:
                # Batch logos to process
                batch = []
                while len(batch) < 10:
                    try:
                        url, company_name = await asyncio.wait_for(self._logo_q.get(), timeout=1.0)
                        batch.append((url, company_name))
                    except asyncio.TimeoutError:
                        break
                
                if not batch:
                    continue
                    
                for url, company_name in batch:
                    path = await download_logo(url, company_name)
                    if path:
                        try:
                            self._logo_update_q.put_nowait((path, _sanitize_name(company_name)))
                        except asyncio.QueueFull:
                            log.debug("Logo update queue full, skipping %s", company_name)
            except Exception as e:
                log.error("Logo worker error: %s", e)
                await asyncio.sleep(2)

    async def close(self):
        self._stop.set()
        if self._writer_task:
            await self._writer_task
        if self._logo_task:
            await self._logo_task

    async def put(self, vendor: VendorRecord):
        """Queue a vendor for write.

        Drops only nameless rows or rows with no identifying information
        beyond the name. Keeps EVERY other partial record — the writer
        will tag them as 'incomplete' so they end up in the partials export.
        """
        if not (vendor.company_name and vendor.company_name.strip()):
            return
        if not has_any_identifier(vendor):
            return
            
        if vendor.logo_url and not vendor.logo_local_path:
            try:
                self._logo_q.put_nowait((vendor.logo_url, vendor.company_name))
            except asyncio.QueueFull:
                pass
            
        await self._vendor_q.put((vendor, None))

    async def put_and_wait(self, vendor: VendorRecord) -> bool:
        """Queue a vendor for write and wait for completion."""
        if not (vendor.company_name and vendor.company_name.strip()):
            return False
        if not has_any_identifier(vendor):
            return False
            
        if vendor.logo_url and not vendor.logo_local_path:
            try:
                self._logo_q.put_nowait((vendor.logo_url, vendor.company_name))
            except asyncio.QueueFull:
                pass
            
        loop = asyncio.get_running_loop()
        fut = loop.create_future()
        await self._vendor_q.put((vendor, fut))
        try:
            return await fut
        except Exception:
            return False

    async def touch_vendor(self, company_name: str):
        """Queue a vendor to bump its last_updated timestamp."""
        name = _sanitize_name(company_name)
        if not name:
            return
        await self._touch_q.put(name)

    async def mark_seen(self, url: str, source: str = ""):
        if url:
            now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S")
            self._seen_cache[url] = now
            await self._url_q.put((url, source))

    def is_seen(self, url: str) -> bool:
        """Check if URL was scraped recently (within SEEN_URL_TTL_DAYS).

        Returns False for URLs never seen OR whose last scrape is older
        than the TTL, allowing re-scraping of stale pages.
        """
        if url not in self._seen_cache:
            return False
        last = self._seen_cache.get(url, "")
        if not last:
            return False
        try:
            last_dt = datetime.fromisoformat(last.replace("Z", "+00:00").replace("+00:00", ""))
            age_days = (datetime.utcnow() - last_dt).days
            return age_days < SEEN_URL_TTL_DAYS
        except (ValueError, TypeError):
            return True  # If we can't parse, assume it's recent

    async def is_seen_company(self, company_name: str, website_url: str = None) -> bool:
        """Returns True if the company exists and does NOT need enrichment."""
        name = _sanitize_name(company_name)
        if not name:
            return False
        async with aiosqlite.connect(self.db_path, timeout=10.0) as conn:
            # 1. Check exact name match
            async with conn.execute(
                "SELECT completeness_status FROM vendors WHERE company_name=?",
                (name,)
            ) as cur:
                if await cur.fetchone():
                    return True # It exists in DB at all, avoid re-discovering
            
            # 2. Check hostname match to prevent duplication of name variations
            if website_url:
                from urllib.parse import urlparse
                host = urlparse(website_url).netloc.lower().replace("www.", "")
                if host:
                    async with conn.execute(
                        "SELECT company_name FROM vendors WHERE website_url LIKE ?",
                        (f"%{host}%",)
                    ) as cur:
                        if await cur.fetchone():
                            return True
                            
            return False

    async def get_enrich_targets(self, limit: int = 500) -> list[dict]:
        """Pull vendors for enrichment — enterprise-first, completion-locked.

        Priority order:
          1. Tier 1 (large enterprise) vendors with no LLM output yet
          2. Tier 1 vendors with partial LLM output (needs inspection_qa upgrade)
          3. Tier 2 (regional enterprise) — new, then legacy upgrades
          4. Unassessed (tier=0) — not yet scored, could be any tier

        Hard exclusions (never returned):
          - lifecycle_stage IN ('fully_built', 'locked', 'disqualified', 'quarantined')
          - enterprise_tier = 3  (confirmed small operators, no enrichment budget)
          - No URL of any kind

        Cooldown logic (prevents thrashing on already-processed vendors):
          - Vendors WITH ai_synopsis/ai_metadata already (partially enriched):
            must wait 24h before re-enrichment attempt
          - Vendors with ZERO LLM output AND zero enrichment_attempts:
            no cooldown — the scraper touched them but Sonnet never ran;
            they're new work and must not be blocked by the touch_vendor call.
        """
        async with aiosqlite.connect(self.db_path, timeout=60.0) as conn:
            conn.row_factory = aiosqlite.Row
            await conn.execute("PRAGMA busy_timeout=30000")
            await conn.execute("PRAGMA journal_mode=WAL")

            query = f"""
                SELECT * FROM vendors
                WHERE (
                    (website_url IS NOT NULL AND website_url != '')
                    OR (thomasnet_profile_url IS NOT NULL AND thomasnet_profile_url != '')
                )
                AND lifecycle_stage NOT IN ('fully_built', 'locked', 'disqualified', 'quarantined')
                -- Curation gate: only enrich AWAKE companies. Records the admin has put
                -- to sleep (junk / non-industrial / off-topic) are skipped entirely, so
                -- enrichment spend goes only to the curated, best-of-the-best survivors.
                -- This supersedes the old blunt `enterprise_tier != 3` exclusion, which
                -- wrongly skipped real tier-3 shops; sleep state is now the quality gate.
                AND NOT EXISTS (
                    SELECT 1 FROM vendor_states s
                    WHERE s.vendor_id = vendors.id AND s.state = 'sleeping'
                )
                -- Junk-name guard: list/directory/article pages are not companies and
                -- waste LLM calls (the model can't build a profile from a listicle, so it
                -- fails and retries). Never enrich them.
                AND company_name NOT LIKE 'Top %'
                AND company_name NOT LIKE 'Best %'
                AND company_name NOT LIKE '%Directory%'
                AND company_name NOT LIKE '%Companies 20%'
                AND company_name NOT LIKE '% in 20%'
                AND company_name NOT LIKE '%Manufacturers in %'
                AND company_name NOT LIKE '%Suppliers in %'
                AND company_name NOT LIKE '%List of %'
                AND company_name NOT LIKE '%Universities%'
                AND LENGTH(company_name) <= 70
                AND (
                    (ai_metadata_data IS NULL OR ai_metadata_data IN ('{{}}', '', '""'))
                    OR (ai_metadata_data IS NOT NULL
                        AND ai_metadata_data NOT LIKE '%inspection_and_qa_capabilities%')
                )
                AND (
                    -- Never-enriched vendors (no LLM output, 0 attempts) bypass the
                    -- 24h cooldown. The scraper touches last_updated during scraping,
                    -- which would otherwise block them even though Sonnet never ran.
                    (COALESCE(enrichment_attempts, 0) = 0
                     AND (ai_synopsis IS NULL OR LENGTH(ai_synopsis) < 10)
                     AND (ai_metadata_data IS NULL OR ai_metadata_data IN ('{{}}', '', '""')))
                    -- Partially-enriched vendors use the full 24h cooldown to prevent thrashing.
                    OR (last_updated IS NULL OR julianday('now') - julianday(last_updated) > 1)
                )
                ORDER BY
                    CASE enterprise_tier
                        WHEN 1 THEN 1
                        WHEN 2 THEN 2
                        WHEN 0 THEN 3
                        ELSE 9
                    END ASC,
                    dynamic_priority_score DESC,
                    enterprise_suitability_score DESC,
                    CASE completeness_status
                        WHEN 'verified' THEN 0
                        WHEN 'partial'  THEN 1
                        WHEN 'inferred' THEN 2
                        ELSE 3
                    END ASC,
                    last_updated ASC
                LIMIT {limit}
            """

            out = []
            async with conn.execute(query) as cur:
                async for r in cur:
                    d = dict(r)
                    for f in ("certifications_held", "materials_handled", "key_personnel",
                              "services", "capabilities", "welding_processes",
                              "industries_served", "fabrication_capabilities",
                              "memberships", "registration_numbers", "social_profiles"):
                        try:
                            d[f] = json.loads(d[f] or "[]")
                        except Exception:
                            d[f] = []
                    out.append(d)

            return out

    async def touch_vendor(self, company_name: str) -> None:
        """Set last_updated=NOW for a vendor without changing any data fields.

        Called when scraping produces no useful change, so the 24-hour cooldown
        gate in get_enrich_targets() prevents immediate re-queuing of the same
        vendor on the next pipeline iteration.
        """
        async with aiosqlite.connect(self.db_path, timeout=60.0) as conn:
            await conn.execute("PRAGMA journal_mode=WAL")
            await conn.execute(
                "UPDATE vendors SET last_updated=CURRENT_TIMESTAMP WHERE company_name=?",
                (_sanitize_name(company_name),),
            )
            await conn.commit()

    async def increment_enrichment_attempts(self, company_name: str) -> None:
        """Atomically increment enrichment_attempts before each LLM call.

        Called before the Sonnet request fires so that a crash or credit
        exhaustion mid-call still registers as an attempt. The quarantine
        check in enrichment.py reads this counter after a failure.
        """
        async with aiosqlite.connect(self.db_path, timeout=60.0) as conn:
            await conn.execute("PRAGMA journal_mode=WAL")
            await conn.execute(
                "UPDATE vendors "
                "SET enrichment_attempts = COALESCE(enrichment_attempts, 0) + 1, "
                "    last_updated = CURRENT_TIMESTAMP "
                "WHERE company_name = ?",
                (_sanitize_name(company_name),),
            )
            await conn.commit()

    async def get_enrichment_attempts(self, company_name: str) -> int:
        """Return current enrichment_attempts count for a vendor."""
        async with aiosqlite.connect(self.db_path, timeout=60.0) as conn:
            async with conn.execute(
                "SELECT COALESCE(enrichment_attempts, 0) FROM vendors WHERE company_name = ?",
                (_sanitize_name(company_name),),
            ) as cur:
                row = await cur.fetchone()
                return int(row[0]) if row else 0

    async def reset_enrichment_attempts(self, company_name: str) -> None:
        """Reset enrichment_attempts to 0 after a successful LLM extraction.

        Ensures future re-enrichment attempts (e.g. schema upgrades) start
        from a clean slate rather than immediately hitting the quarantine limit.
        """
        async with aiosqlite.connect(self.db_path, timeout=60.0) as conn:
            await conn.execute("PRAGMA journal_mode=WAL")
            await conn.execute(
                "UPDATE vendors SET enrichment_attempts = 0 WHERE company_name = ?",
                (_sanitize_name(company_name),),
            )
            await conn.commit()

    async def quarantine_vendor(self, company_name: str) -> None:
        """Mark a vendor as quarantined after repeated enrichment failures.

        Quarantined vendors are excluded from get_enrich_targets() permanently
        unless manually reset. This prevents broken/inaccessible vendors from
        consuming credits on every pipeline run.
        """
        async with aiosqlite.connect(self.db_path, timeout=60.0) as conn:
            await conn.execute("PRAGMA journal_mode=WAL")
            await conn.execute(
                "UPDATE vendors "
                "SET lifecycle_stage = 'quarantined', "
                "    last_updated = CURRENT_TIMESTAMP "
                "WHERE company_name = ?",
                (_sanitize_name(company_name),),
            )
            await conn.commit()

    async def count(self) -> int:

        async with aiosqlite.connect(self.db_path, timeout=60.0) as conn:
            async with conn.execute("SELECT COUNT(*) FROM vendors") as cur:
                row = await cur.fetchone()
                return row[0] if row else 0

    async def _writer_loop(self):
        async with aiosqlite.connect(self.db_path, timeout=60.0, isolation_level=None) as conn:
            await conn.execute("PRAGMA journal_mode=WAL")
            await conn.execute("PRAGMA synchronous=NORMAL")
            await conn.execute("PRAGMA busy_timeout=60000")
            conn.row_factory = aiosqlite.Row
            last_flush = time.monotonic()
            buf_vendors: list[tuple[VendorRecord, Optional[asyncio.Future]]] = []
            buf_urls: list[tuple] = []
            buf_certs: list[tuple[str, dict]] = []
            buf_touches: list[str] = []
            buf_logo_updates: list[tuple[str, str]] = []  # (local_path, company_name)

            while not (self._stop.is_set() and self._vendor_q.empty() and self._url_q.empty() and self._cert_q.empty() and self._touch_q.empty() and self._logo_update_q.empty()):
                timeout = max(0.05, self.flush_interval_s - (time.monotonic() - last_flush))
                try:
                    v_item = await asyncio.wait_for(self._vendor_q.get(), timeout=timeout)
                    buf_vendors.append(v_item)
                except asyncio.TimeoutError:
                    pass
                while not self._vendor_q.empty() and len(buf_vendors) < self.flush_size * 2:
                    buf_vendors.append(self._vendor_q.get_nowait())
                while not self._url_q.empty() and len(buf_urls) < self.flush_size * 4:
                    buf_urls.append(self._url_q.get_nowait())
                while not self._cert_q.empty() and len(buf_certs) < self.flush_size * 2:
                    buf_certs.append(self._cert_q.get_nowait())
                while not self._touch_q.empty() and len(buf_touches) < self.flush_size * 2:
                    buf_touches.append(self._touch_q.get_nowait())
                # Drain logo path updates queued by _logo_worker_loop
                while not self._logo_update_q.empty() and len(buf_logo_updates) < self.flush_size * 2:
                    buf_logo_updates.append(self._logo_update_q.get_nowait())

                should_flush = (
                    len(buf_vendors) >= self.flush_size
                    or len(buf_urls) >= self.flush_size * 2
                    or len(buf_certs) >= self.flush_size
                    or len(buf_touches) >= self.flush_size
                    or len(buf_logo_updates) >= self.flush_size
                    or (time.monotonic() - last_flush) >= self.flush_interval_s
                    or self._stop.is_set()
                )
                if should_flush and (buf_vendors or buf_urls or buf_certs or buf_touches or buf_logo_updates):
                    try:
                        # Process vendors individually in autocommit mode
                        # isolation_level=None means each execute is its own transaction
                        if buf_vendors:
                            written_this_batch = 0
                            for v, fut in buf_vendors:
                                try:
                                    await self._upsert_vendor(conn, v)
                                    written_this_batch += 1
                                    if fut and not fut.done():
                                        fut.set_result(True)
                                except sqlite3.OperationalError as e:
                                    log.warning("DB locked writing %s, re-queuing: %s", v.company_name, e)
                                    if fut and not fut.done():
                                        fut.set_result(False)
                                    try:
                                        self._vendor_q.put_nowait((v, None))
                                    except asyncio.QueueFull:
                                        try:
                                            with open("failed_vendors.jsonl", "a", encoding="utf-8") as f:
                                                f.write(v.to_json() + "\n")
                                        except Exception:
                                            pass
                                except Exception as e:
                                    log.exception("Failed to write vendor %s; skipping", v.company_name)
                                    if fut and not fut.done():
                                        fut.set_result(False)
                                    try:
                                        with open("failed_vendors.jsonl", "a", encoding="utf-8") as f:
                                            f.write(v.to_json() + "\n")
                                    except Exception:
                                        pass
                            self.written += written_this_batch

                        if buf_certs:
                            await self._flush_certifications(conn, buf_certs)
                            self.certs_written += len(buf_certs)

                        if buf_urls:
                            await conn.executemany(
                                "INSERT INTO seen_urls(url, source, last_scraped, scrape_count) "
                                "VALUES (?, ?, CURRENT_TIMESTAMP, 1) "
                                "ON CONFLICT(url) DO UPDATE SET "
                                "last_scraped=CURRENT_TIMESTAMP, "
                                "scrape_count=seen_urls.scrape_count+1",
                                buf_urls,
                            )
                            self.urls_marked += len(buf_urls)

                        if buf_touches:
                            await conn.executemany(
                                "UPDATE vendors SET last_updated=CURRENT_TIMESTAMP WHERE company_name=?",
                                [(name,) for name in buf_touches],
                            )

                        if buf_logo_updates:
                            await conn.executemany(
                                "UPDATE vendors SET logo_local_path = ? WHERE company_name = ?",
                                buf_logo_updates,
                            )

                    except Exception as e:
                        log.exception("Uncaught flush error: %s", e)
                        for v, fut in buf_vendors:
                            if fut and not fut.done():
                                fut.set_result(False)

                    buf_vendors.clear()
                    buf_urls.clear()
                    buf_certs.clear()
                    buf_touches.clear()
                    buf_logo_updates.clear()
                    last_flush = time.monotonic()

    async def put_certification(self, company_name: str, cert: dict):
        """Insert or update a certification record linked to a vendor."""
        name = _sanitize_name(company_name)
        if not name:
            return
        await self._cert_q.put((name, cert))

    async def _flush_certifications(self, conn, batch: list[tuple[str, dict]]):
        """Write a batch of certification records."""
        for name, cert in batch:
            # Look up vendor_id
            async with conn.execute(
                "SELECT id FROM vendors WHERE company_name=?", (name,)
            ) as cur:
                row = await cur.fetchone()
            vendor_id = row[0] if row else None
            try:
                await conn.execute(
                    "INSERT INTO certifications "
                    "(vendor_id, company_name, certification_type, certification_number, "
                    " certification_status, expiration_date, registry_id, "
                    " issuing_organization, verification_url, metadata, source) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?,?) "
                    "ON CONFLICT(company_name, certification_type, "
                    "certification_number) DO UPDATE SET "
                    "certification_status=COALESCE(excluded.certification_status, certifications.certification_status), "
                    "expiration_date=COALESCE(excluded.expiration_date, certifications.expiration_date), "
                    "vendor_id=COALESCE(excluded.vendor_id, certifications.vendor_id), "
                    "last_verified=CURRENT_TIMESTAMP",
                    (
                        vendor_id, name,
                        cert.get("certification_type"),
                        cert.get("certification_number"),
                        cert.get("certification_status", "active"),
                        cert.get("expiration_date"),
                        cert.get("registry_id"),
                        cert.get("issuing_organization"),
                        cert.get("verification_url"),
                        json.dumps(cert.get("metadata", {})),
                        cert.get("source"),
                    ),
                )
            except Exception:
                pass  # dedup conflict or other non-fatal error


    async def _upsert_vendor(self, conn, v: VendorRecord):
        """Read-merge-write a single vendor with proper list-field and dict-field union."""
        name = _sanitize_name(v.company_name)
        if not name:
            return

        
        if v.enterprise_suitability_score == 0:
            v.enterprise_suitability_score = assess_enterprise_score(v)
            
        v.dynamic_priority_score = calculate_dynamic_priority(v)

        # --- Enterprise tier & lifecycle stage ---
        # Calculate tier every write so new data can upgrade a record.
        new_tier = assess_enterprise_tier(v)
        v.enterprise_tier = new_tier

        # Try to insert first (no-op if exists)
        await conn.execute(INSERT_SQL, _insert_row(v))

        # Read existing row for merge. We select * to grab all fields easily.
        async with conn.execute(
            "SELECT * FROM vendors WHERE company_name=?",
            (name,),
        ) as cur:
            existing = await cur.fetchone()

        if not existing:
            return  # INSERT succeeded, nothing to merge

        # Helper to merge list fields
        def m_list(field_name):
            return _merge_json_lists(existing[field_name], getattr(v, field_name, None) or [])
            
        def m_dict(field_name):
            val = getattr(v, field_name, None) or {}
            if isinstance(val, str):
                try: val = json.loads(val)
                except: val = {}
            return _merge_json_dicts(existing[field_name], val)

        merged_source = _merge_sources(existing["data_source"], v.data_source)
        merged_prov = _merge_provenance(existing["data_provenance"], _build_provenance(v))

        # Build a merged record for completeness/confidence assessment
        v_merged = VendorRecord(
            company_name=name,
            website_url=v.website_url,
            headquarters_location=v.headquarters_location,
            certifications_held=json.loads(m_list("certifications_held")),
            materials_handled=json.loads(m_list("materials_handled")),
            key_personnel=json.loads(m_list("key_personnel")),
            data_source=merged_source,
            contact_email=v.contact_email,
            contact_phone=v.contact_phone,
            facility_size_sqft=v.facility_size_sqft,
            primary_business_type=v.primary_business_type,
            year_established=v.year_established,
            thomasnet_profile_url=v.thomasnet_profile_url,
        )

        # Determine the lifecycle stage to write.
        # Rules:
        #   1. Never downgrade 'fully_built' or 'locked' — the CASE in SQL enforces this
        #      at the DB layer, but we respect it here too for clarity.
        #   2. Promote to 'fully_built' if the incoming vendor data satisfies all criteria
        #      and the tier is 1 or 2 (enterprise-qualified).
        #   3. Otherwise preserve the current stage so discovery writes don't reset it.
        current_stage = (existing['lifecycle_stage'] if existing else 'discovered') or 'discovered'
        if current_stage in ('fully_built', 'locked'):
            new_lifecycle_stage = current_stage  # immutable — SQL CASE handles it too
        elif is_fully_built(v) and new_tier != 3:
            new_lifecycle_stage = 'fully_built'
        else:
            new_lifecycle_stage = current_stage

        params = (
            v.website_url, # 1
            v.headquarters_location, # 2
            v.facility_size_sqft, # 3
            m_list("certifications_held"), # 4
            v.primary_business_type, # 5
            m_list("materials_handled"), # 6
            v.contact_email, # 7
            v.contact_phone, # 8
            m_list("key_personnel"), # 9
            v.year_established, # 10
            v.thomasnet_profile_url, # 11
            merged_source, # 12
            assess_completeness(v_merged), # 13
            assess_confidence(v_merged), # 14
            merged_prov, # 15
            v.logo_url, # 16
            v.logo_local_path, # 17
            v.street_address, # 18
            v.city, # 19
            v.state_province, # 20
            v.country, # 21
            v.zip_postal_code, # 22
            v.company_description, # 23
            m_list("services"), # 24
            m_list("capabilities"), # 25
            m_list("welding_processes"), # 26
            m_list("fabrication_capabilities"), # 27
            m_list("industries_served"), # 28
            m_list("memberships"), # 29
            m_list("equipment_list"), # 30
            v.shop_capacity, # 31
            v.employee_count, # 32
            m_list("geographic_service_areas"), # 33
            json.dumps(v.social_profiles) if isinstance(v.social_profiles, dict) else (v.social_profiles or "{}"), # 34
            m_list("images"), # 35
            v.contact_form_url, # 36
            m_list("license_numbers"), # 37
            m_list("registration_numbers"), # 38
            int(v.language_needs_approval), # 39
            v.enterprise_suitability_score, # 39.1
            v.enterprise_rationale, # 39.2
            v.dynamic_priority_score, # 39.3
            m_list("alternate_names"), # 40
            m_list("sub_industries"), # 41
            m_list("products"), # 42
            m_list("additional_locations"), # 43
            m_list("keywords"), # 44
            m_list("search_tags"), # 45
            v.ai_summary, # 46
            m_list("use_cases"), # 47
            m_list("vendor_categories"), # 48
            m_list("project_types"), # 49
            m_list("technical_specialties"), # 50
            m_list("partnerships_and_dealers"), # 51
            v.ai_synopsis, # 52
            m_list("representative_images"), # 53
            m_dict("identity_data"), # 54
            m_dict("business_data"), # 53
            m_dict("capabilities_data"), # 54
            m_dict("certifications_data"), # 55
            m_dict("relationships_data"), # 56
            m_dict("products_data"), # 57
            m_dict("experience_data"), # 58
            m_dict("geographic_data"), # 59
            m_dict("business_info_data"), # 60
            m_dict("digital_presence_data"), # 61
            m_dict("brand_assets_data"), # 62
            m_dict("reputation_data"), # 63
            m_dict("ai_metadata_data"), # 64
            m_list("inspection_and_qa_capabilities"), # 65
            m_list("notable_customers"), # 66
            new_tier,              # enterprise_tier  (67)
            new_lifecycle_stage,   # lifecycle_stage CASE value  (68)
            name,                  # WHERE company_name=?  (69)
        )

        await conn.execute(UPDATE_SQL, params)
