import { NextRequest } from "next/server";
import { noCacheHeaders } from "@/lib/auth";
import { getAllTenants } from "@/lib/tenantConfig";
import { runSyncForTenant } from "@/lib/runSync";

// A full multi-tenant sync (incl. the slow phantom SP) can run long; give it room.
export const maxDuration = 300;

/**
 * Scheduled sync. Vercel calls this hourly (see vercel.json) with the
 * Authorization: Bearer <CRON_SECRET> header. Each tenant stores the local
 * (SAST) hours it wants to sync; we run only the tenants whose schedule matches
 * the current hour. Tenants are processed sequentially to bound SQL load.
 */
export async function GET(req: NextRequest) {
  // Only Vercel Cron (or someone with the secret) may trigger this.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: noCacheHeaders() }
    );
  }

  // Current hour in South African time (Vercel cron fires in UTC).
  const hourStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Johannesburg",
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  // "24" can be emitted for midnight by some runtimes — normalise to "00".
  const currentTime = `${hourStr === "24" ? "00" : hourStr}:00`;

  const tenants = await getAllTenants();
  const due = tenants.filter(
    (t) =>
      t.active &&
      t.sqlClientName &&
      Array.isArray(t.syncTimes) &&
      t.syncTimes.includes(currentTime)
  );

  const results: Array<{ slug: string; ok: boolean; detail: string }> = [];
  for (const t of due) {
    try {
      const r = await runSyncForTenant(t.slug);
      results.push({
        slug: t.slug,
        ok: true,
        detail: `${r.counts.channels} channels, ${r.counts.stores} stores, ${r.counts.products} products, ${r.counts.phantomDetail} phantom`,
      });
    } catch (err) {
      results.push({
        slug: t.slug,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json(
    { ran: currentTime, synced: results.length, results },
    { headers: noCacheHeaders() }
  );
}
