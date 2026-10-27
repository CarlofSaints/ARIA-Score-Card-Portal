import { NextRequest } from "next/server";
import { requireRole, handleAuthError, noCacheHeaders, AuthError } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { getTenantConfig } from "@/lib/getTenantConfig";
import { updateTenant } from "@/lib/tenantConfig";
import { readJson } from "@/lib/blob";
import { provinceName } from "@/lib/provinceScores";
import type { ScorecardStore } from "@/lib/types";

// Which provinces the Province Score Card shows. The store master has no
// country, so the admin ticks the SA provinces here. null = all shown.
async function allProvinces(slug: string): Promise<string[]> {
  const stores = await readJson<ScorecardStore[]>(`${slug}/data/stores.json`, []);
  return Array.from(new Set(stores.map((s) => provinceName(s.region)))).sort();
}

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, "admin");
    const slug = await getTenantSlug();
    const [config, all] = await Promise.all([getTenantConfig(slug), allProvinces(slug)]);
    return Response.json(
      { all, included: config?.includedProvinces ?? null },
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
    const all = new Set(await allProvinces(slug));
    // Keep known names only; an empty list means "show all" (null).
    if (body.included !== null && !Array.isArray(body.included)) throw new AuthError("Invalid province list", 400);
    const picked: string[] = Array.isArray(body.included)
      ? Array.from(new Set(body.included.filter((p: unknown): p is string => typeof p === "string" && all.has(p))))
      : [];
    await updateTenant(slug, { includedProvinces: picked.length ? picked : undefined });
    return Response.json({ included: picked.length ? picked : null }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
