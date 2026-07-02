import { NextRequest } from "next/server";
import { requireRole, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { readJson } from "@/lib/blob";

export const dynamic = "force-dynamic";

// Returns the rolling sync log (last 50 runs) with per-query durations/rows, so
// the Control Centre can show how long each SP took on each sync.
export async function GET(req: NextRequest) {
  try {
    requireRole(req, "admin");
    const slug = await getTenantSlug();
    const log = await readJson<unknown[]>(`${slug}/data/sync-log.json`, []);
    return Response.json({ log }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
