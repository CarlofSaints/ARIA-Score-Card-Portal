import { NextRequest } from "next/server";
import { requireRole, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import {
  getProductMapping,
  saveProductMapping,
  buildProductMaster,
  autoMatchHeaders,
} from "@/lib/productMasterData";
import { getPmfHeaders } from "@/lib/controlFileData";
import type { ProductFieldMapping } from "@/lib/types";

/**
 * GET — returns current mapping + detected PMF headers + auto-match suggestions
 */
export async function GET(req: NextRequest) {
  try {
    requireRole(req, "admin");
    const slug = await getTenantSlug();

    const [mapping, headers] = await Promise.all([
      getProductMapping(slug),
      getPmfHeaders(slug),
    ]);

    const autoMatched = headers.length > 0 ? autoMatchHeaders(headers) : {};

    return Response.json(
      { mapping, headers, autoMatched },
      { headers: noCacheHeaders() }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * PUT — saves mapping, then auto-runs buildProductMaster(), returns master count.
 */
export async function PUT(req: NextRequest) {
  try {
    requireRole(req, "admin");
    const slug = await getTenantSlug();
    const body = (await req.json()) as { mapping: ProductFieldMapping };

    if (!body.mapping || !body.mapping.article) {
      return Response.json(
        { error: "Article field mapping is required" },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    await saveProductMapping(slug, body.mapping);
    const result = await buildProductMaster(slug);

    return Response.json(
      { success: true, count: result.count },
      { headers: noCacheHeaders() }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}
