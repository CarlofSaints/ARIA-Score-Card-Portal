import { NextRequest } from "next/server";
import { requireRole, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { readJson } from "@/lib/blob";
import {
  runSyncForTenant,
  backfillSalesMonths,
  ALL_SYNC_PARTS,
  type SyncPart,
} from "@/lib/runSync";

// SPAR's sales SP is heavy (~100s on the primary server); give the whole sync
// plenty of headroom (matches the cron route).
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    await requireRole(req, "admin");
    const slug = await getTenantSlug();

    // Optional { parts: [...] } body scopes the sync to specific KPIs/master
    // data (default = everything). Invalid entries are dropped; an empty/absent
    // list falls back to a full sync. "salesmonths" is a special part: it runs
    // the completed-month @YearMonth backfill (its own heavy pass) rather than a
    // KPI sync, so it never drags a routine sync over the time limit.
    const body = (await req.json().catch(() => ({}))) as { parts?: unknown; force?: unknown };
    const rawParts = Array.isArray(body?.parts) ? body.parts.map((p) => String(p)) : null;
    const wantsMonths = rawParts?.includes("salesmonths") ?? false;
    const kpiParts: SyncPart[] = (rawParts ?? []).filter((p): p is SyncPart =>
      (ALL_SYNC_PARTS as string[]).includes(p)
    );

    // Completed-month backfill (correct full month + full prior-year).
    const monthsResult = wantsMonths
      ? await backfillSalesMonths(slug, { force: body?.force === true })
      : undefined;

    // KPI/master sync. Runs when parts were unspecified (→ full sync) or when
    // specific KPI parts were requested. A months-only request skips it.
    const runKpis = rawParts === null || kpiParts.length > 0;
    const result = runKpis
      ? await runSyncForTenant(slug, "manual", kpiParts.length ? { parts: kpiParts } : {})
      : undefined;

    return Response.json(
      {
        success: true,
        ...(result
          ? {
              period: result.period,
              phantomSkipped: result.phantomSkipped,
              phantomError: result.phantomError,
              counts: result.counts,
            }
          : {}),
        ...(monthsResult ? { months: monthsResult } : {}),
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
    await requireRole(req, "admin");
    const slug = await getTenantSlug();
    const syncMeta = await readJson<Record<string, unknown>>(`${slug}/data/sync-meta.json`, {});

    return Response.json(syncMeta, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
