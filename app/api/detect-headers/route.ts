import { NextRequest } from "next/server";
import { requireRole, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { getPmfHeaders } from "@/lib/controlFileData";

/**
 * GET — returns array of column names found in the stored raw PMF data.
 * Used by the mapping UI to populate dropdown options.
 */
export async function GET(req: NextRequest) {
  try {
    requireRole(req, "admin");
    const slug = await getTenantSlug();
    const headers = await getPmfHeaders(slug);

    return Response.json({ headers }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
