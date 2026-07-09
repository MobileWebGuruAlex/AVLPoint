"""Quick smoke tests for the new merge functions and sanitization."""
import json
from db_async import (
    _merge_json_lists,
    _merge_sources,
    _merge_provenance,
    _sanitize_name,
    assess_completeness,
    assess_confidence,
    has_any_identifier,
    VendorRecord,
    SEEN_URL_TTL_DAYS,
)

# --- _merge_json_lists ---
# Union of two lists, preserving order and deduplicating
assert _merge_json_lists('["A","B"]', ["B", "C"]) == json.dumps(["A", "B", "C"])
assert _merge_json_lists('[]', ["X"]) == json.dumps(["X"])
assert _merge_json_lists(None, ["Y"]) == json.dumps(["Y"])
assert _merge_json_lists('["A"]', []) == json.dumps(["A"])
assert _merge_json_lists('invalid', ["Z"]) == json.dumps(["Z"])
print("✓ _merge_json_lists")

# --- _merge_sources ---
assert _merge_sources("CEMA wp-json", "Thomasnet:tanks:tx") == "CEMA wp-json | Thomasnet:tanks:tx"
assert _merge_sources("A | B", "C") == "A | B | C"
assert _merge_sources("A | B", "A") == "A | B"  # no duplicate
assert _merge_sources("", "First") == "First"
assert _merge_sources(None, "First") == "First"
print("✓ _merge_sources")

# --- _merge_provenance ---
existing = json.dumps({"company_name": {"source": "CEMA", "date": "2026-01-01"}})
new = json.dumps({"contact_email": {"source": "enrichment", "date": "2026-06-17"}})
merged = json.loads(_merge_provenance(existing, new))
assert "company_name" in merged
assert "contact_email" in merged
assert merged["company_name"]["source"] == "CEMA"
assert merged["contact_email"]["source"] == "enrichment"
print("✓ _merge_provenance")

# --- _sanitize_name ---
assert _sanitize_name("  Acme Steel Co.  ") == "Acme Steel Co."
assert _sanitize_name("**Bold Name**") == "Bold Name"
assert _sanitize_name("# Header Name") == "Header Name"
assert _sanitize_name("[Link Text](http://example.com)") == "Link Text"
assert _sanitize_name("Name &amp; Sons") == "Name & Sons"
assert _sanitize_name("Clean Name") == "Clean Name"
assert _sanitize_name("  Multiple   spaces  ") == "Multiple spaces"
print("✓ _sanitize_name")

# --- SEEN_URL_TTL_DAYS ---
assert SEEN_URL_TTL_DAYS == 30
print("✓ SEEN_URL_TTL_DAYS = 30")

# --- Completeness / confidence still work ---
v = VendorRecord(
    company_name="Test Co",
    headquarters_location="Houston, TX",
    contact_phone="555-1234",
    certifications_held=["ASME U"],
    data_source="ASME CA Connect:U",
)
assert assess_completeness(v) == "verified"
assert assess_confidence(v) == "verified"
print("✓ assess_completeness / assess_confidence")

# --- has_any_identifier ---
v_empty = VendorRecord(company_name="Name Only")
assert not has_any_identifier(v_empty)
v_with_loc = VendorRecord(company_name="Name", headquarters_location="TX")
assert has_any_identifier(v_with_loc)
print("✓ has_any_identifier")

print("\n=== ALL TESTS PASSED ===")
