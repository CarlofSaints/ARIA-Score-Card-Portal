import { NextRequest } from "next/server";
import { requireLogin, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { readJson } from "@/lib/blob";

// When the data last refreshed, for the "Data last updated" stamp every user
// sees (the full sync meta stays admin-only on GET /api/sync).
export async function GET(req: NextRequest) {
  try {
    await requireLogin(req);
    const slug = await getTenantSlug();
    const meta = await readJson<{ lastSync?: string }>(`${slug}/data/sync-meta.json`, {});
    return Response.json({ lastSync: meta.lastSync ?? null }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
