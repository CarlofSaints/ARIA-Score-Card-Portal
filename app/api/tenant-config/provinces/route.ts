import { NextRequest } from "next/server";
import { requireRole, handleAuthError, noCacheHeaders, AuthError } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { getTenantConfig } from "@/lib/getTenantConfig";
import { updateTenant } from "@/lib/tenantConfig";
import { readJson } from "@/lib/blob";
import { countryName, provinceName } from "@/lib/provinceScores";
import type { ScorecardStore } from "@/lib/types";

// Which countries and provinces the Province and Store Scorecards show (picked
// in Control Centre). Each list: null = all shown.
async function lists(slug: string) {
  const stores = await readJson<ScorecardStore[]>(`${slug}/data/stores.json`, []);
  return {
    countries: Array.from(new Set(stores.map(countryName))).sort(),
    provinces: Array.from(new Set(stores.map((s) => provinceName(s.region)))).sort(),
  };
}

// Keep known names only; an empty list means "show all" (stored as unset).
function pick(value: unknown, known: string[], label: string): string[] | undefined {
  if (value === null || value === undefined) return undefined;
  if (!Array.isArray(value)) throw new AuthError(`Invalid ${label} list`, 400);
  const ok = new Set(known);
  const out = Array.from(new Set(value.filter((v): v is string => typeof v === "string" && ok.has(v))));
  return out.length ? out : undefined;
}

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, "admin");
    const slug = await getTenantSlug();
    const [config, all] = await Promise.all([getTenantConfig(slug), lists(slug)]);
    return Response.json(
      {
        all: all.provinces,
        included: config?.includedProvinces ?? null,
        countries: all.countries,
        includedCountries: config?.includedCountries ?? null,
      },
      { headers: noCacheHeaders() }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireRole(req, "admin");
    const slug = await getTenantSlug();
    const body = await req.json();
    const all = await lists(slug);
    const includedProvinces = pick(body.included, all.provinces, "province");
    const includedCountries = pick(body.includedCountries, all.countries, "country");
    await updateTenant(slug, { includedProvinces, includedCountries });
    return Response.json(
      { included: includedProvinces ?? null, includedCountries: includedCountries ?? null },
      { headers: noCacheHeaders() }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}
