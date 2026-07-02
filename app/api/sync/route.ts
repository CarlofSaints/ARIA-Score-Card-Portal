import { NextRequest } from "next/server";
import { requireRole, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { readJson } from "@/lib/blob";
import { runSyncForTenant, ALL_SYNC_PARTS, type SyncPart } from "@/lib/runSync";

// SPAR's sales SP is heavy (~100s on the primary server); give the whole sync
// plenty of headroom (matches the cron route).
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    requireRole(req, "admin");
    const slug = await getTenantSlug();

    // Optional { parts: [...] } body scopes the sync to specific KPIs/master
    // data (default = everything). Invalid entries are dropped; an empty/absent
    // list falls back to a full sync.
    const body = (await req.json().catch(() => ({}))) as { parts?: unknown };
    const parts: SyncPart[] | undefined = Array.isArray(body?.parts)
      ? (body.parts.filter((p): p is SyncPart =>
          (ALL_SYNC_PARTS as string[]).includes(p as string)
        ))
      : undefined;

    const result = await runSyncForTenant(
      slug,
      "manual",
      parts && parts.length ? { parts } : {}
    );

    return Response.json(
      {
        success: true,
        period: result.period,
        phantomSkipped: result.phantomSkipped,
        phantomError: result.phantomError,
        counts: result.counts,
      },
      { headers: noCacheHeaders() }
    );
  } catch (err) {
    // A missing SQL-client mapping is a 400, not a server error.
    if (err instanceof Error && err.message.startsWith("No SQL client mapped")) {
      return Response.json(
        { error: err.message },
        { status: 400, headers: noCacheHeaders() }
      );
    }
    return handleAuthError(err);
  }
}

// GET returns sync status
export async function GET(req: NextRequest) {
  try {
    requireRole(req, "admin");
    const slug = await getTenantSlug();
    const syncMeta = await readJson<Record<string, unknown>>(`${slug}/data/sync-meta.json`, {});

    return Response.json(syncMeta, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
