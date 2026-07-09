/** Shared helpers used across server and client components. */

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** Safely parse a JSON-string column into an array of strings. */
export function jsonList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    }
    return [];
  } catch {
    // Some legacy rows store comma-separated text instead of JSON.
    return raw.includes(",") ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [raw];
  }
}

/** Safely parse a JSON-string column into an object. */
export function jsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

/** Normalize the many spellings of countries found in scraped data. */
export function normalizeCountry(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const c = raw.trim();
  const map: Record<string, string> = {
    us: "United States",
    usa: "United States",
    "u.s.": "United States",
    "u.s.a.": "United States",
    "united states": "United States",
    "united states of america": "United States",
    uk: "United Kingdom",
    "u.k.": "United Kingdom",
    "great britain": "United Kingdom",
    "united kingdom": "United Kingdom",
  };
  return map[c.toLowerCase()] ?? titleCase(c);
}

/** Reverse lookup: which raw DB values correspond to a normalized country. */
export function countryVariants(normalized: string): string[] {
  if (normalized === "United States")
    return ["US", "USA", "U.S.", "U.S.A.", "United States", "United States of America", "us", "usa", "united states"];
  if (normalized === "United Kingdom")
    return ["UK", "U.K.", "United Kingdom", "Great Britain", "uk", "united kingdom"];
  return [normalized, normalized.toLowerCase(), normalized.toUpperCase()];
}

export function vendorLocation(v: {
  city?: string | null;
  state_province?: string | null;
  country?: string | null;
  headquarters_location?: string | null;
}): string {
  const parts = [v.city, v.state_province, normalizeCountry(v.country)].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  return v.headquarters_location ?? "Location on file";
}

export function hostname(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/\s+\S*$/, "") + "…";
}
