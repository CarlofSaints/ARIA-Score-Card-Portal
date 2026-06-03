import { NextRequest } from "next/server";
import { requireRole, requireLogin, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { getProductMaster, buildProductMaster } from "@/lib/productMasterData";

/**
 * GET — returns the structured product master array.
 */
export async function GET(req: NextRequest) {
  try {
    requireLogin(req);
    const slug = await getTenantSlug();
    const master = await getProductMaster(slug);

    return Response.json(
      { products: master, count: master.length },
      { headers: noCacheHeaders() }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * POST — force rebuild the product master from raw PMF + mapping.
 */
export async function POST(req: NextRequest) {
  try {
    requireRole(req, "admin");
    const slug = await getTenantSlug();
    const result = await buildProductMaster(slug);

    return Response.json(
      { success: true, count: result.count },
      { headers: noCacheHeaders() }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}
