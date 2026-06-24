import { NextRequest } from "next/server";
import { requireRole, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { getTenantConfig } from "@/lib/getTenantConfig";
import { updateTenant } from "@/lib/tenantConfig";

// Accept only whole-hour "HH:00" strings (matches the hourly cron granularity),
// dedupe, clamp 00–23, and sort. Anything else is dropped.
function normalizeTimes(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const hours = new Set<number>();
  for (const t of input) {
    const m = typeof t === "string" ? t.match(/^(\d{1,2}):/) : null;
    if (!m) continue;
    const h = Number(m[1]);
    if (h >= 0 && h <= 23) hours.add(h);
  }
  return [...hours]
    .sort((a, b) => a - b)
    .map((h) => `${String(h).padStart(2, "0")}:00`);
}

export async function GET(req: NextRequest) {
  try {
    requireRole(req, "admin");
    const slug = await getTenantSlug();
    const config = await getTenantConfig(slug);

    return Response.json(
      { syncTimes: config?.syncTimes ?? [] },
      { headers: noCacheHeaders() }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    requireRole(req, "admin");
    const slug = await getTenantSlug();
    const body = await req.json();
    const syncTimes = normalizeTimes(body.syncTimes);

    await updateTenant(slug, { syncTimes });

    return Response.json({ syncTimes }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
