import { NextRequest } from "next/server";
import { requirePermission, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { readJson } from "@/lib/blob";
import type { SalesDetailRow } from "@/lib/types";

export const dynamic = "force-dynamic";

// Reads the Sales detail blob. Empty until Mark's sales detail query is wired
// into runSync (write to `${slug}/data/sales/${period}/detail.json`). The
// per-entity sales aggregates already synced (channels/stores/products.json)
// are used for scoring; this page surfaces the detailed sales lines.
export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "view_sales");
    const slug = await getTenantSlug();

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const period =
      searchParams.get("period") ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const rows = await readJson<SalesDetailRow[]>(
      `${slug}/data/sales/${period}/detail.json`,
      []
    );

    return Response.json({ rows, period }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
