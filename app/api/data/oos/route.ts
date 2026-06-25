import { NextRequest } from "next/server";
import { requirePermission, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { readJson } from "@/lib/blob";
import type { OosDetailRow } from "@/lib/types";

export const dynamic = "force-dynamic";

// Reads the OOS detail blob. Tolerant of two shapes: the enriched OosDetailRow
// (written by a future sync) OR the raw oos_detail query rows currently written
// by runSync (SiteName/Channel/SKU/SOH/LatestDate). Normalises to OosDetailRow
// so the page renders either way — "plug in the query" needs no page change.
export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "view_oos");
    const slug = await getTenantSlug();

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const period =
      searchParams.get("period") ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const raw = await readJson<Record<string, unknown>[]>(
      `${slug}/data/oos/${period}/detail.json`,
      []
    );

    const rows: OosDetailRow[] = raw.map((r) => ({
      siteCode: str(r.siteCode ?? r.SiteCode ?? r.SiteID),
      storeName: str(r.storeName ?? r.SiteName ?? r.siteCode ?? r.SiteCode),
      channelName: str(r.channelName ?? r.Channel),
      subChannel: str(r.subChannel ?? r.SubChannel ?? ""),
      province: str(r.province ?? r.Province ?? ""),
      productId: str(r.productId ?? r.SKU ?? r.ProductID),
      productName: str(r.productName ?? r["Product Description"] ?? r.SKU),
      brand: str(r.brand ?? r["Product Brand"] ?? ""),
      soh: num(r.soh ?? r.SOH),
      date: str(r.date ?? r.LatestDate ?? r.LatestDate ?? ""),
    }));

    return Response.json({ rows, period }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
