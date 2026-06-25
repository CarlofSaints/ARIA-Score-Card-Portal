import { NextRequest } from "next/server";
import { requirePermission, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { readJson } from "@/lib/blob";
import type { NdDetailRow } from "@/lib/types";

export const dynamic = "force-dynamic";

// Reads the Numerical Distribution detail blob. Empty until Mark's nd_* queries
// are wired into runSync (write to `${slug}/data/nd/${period}/detail.json`).
export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "view_nd");
    const slug = await getTenantSlug();

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const period =
      searchParams.get("period") ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const rows = await readJson<NdDetailRow[]>(
      `${slug}/data/nd/${period}/detail.json`,
      []
    );

    return Response.json({ rows, period }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
