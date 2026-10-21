import { NextRequest } from "next/server";
import { requireLogin, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { listChildFolders } from "@/lib/blob";

export const dynamic = "force-dynamic";

// Available scorecard periods = the month folders that hold KPI snapshots. Each
// sync writes into the current month's folder, so a past month's folder is that
// month's end-of-month snapshot — which is what the scorecard month selector
// reads to compare progression/regression month over month.
export async function GET(req: NextRequest) {
  try {
    await requireLogin(req);
    const slug = await getTenantSlug();

    const folders = await listChildFolders(`${slug}/data/kpi/`);
    const periods = folders
      .filter((f) => /^\d{4}-\d{2}$/.test(f))
      .sort()
      .reverse();

    const now = new Date();
    const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    // The current month always exists as an option even before its first sync.
    if (!periods.includes(current)) periods.unshift(current);

    return Response.json({ periods, current }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
