import { NextRequest } from "next/server";
import { requireRole, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { savePmfData, getControlFileData } from "@/lib/controlFileData";
import { getProductMapping, buildProductMaster } from "@/lib/productMasterData";

/**
 * GET — returns raw PMF data info (row count, headers).
 */
export async function GET(req: NextRequest) {
  try {
    requireRole(req, "admin");
    const slug = await getTenantSlug();
    const rows = await getControlFileData(slug, "pmf");

    return Response.json(
      {
        count: rows.length,
        headers: rows.length > 0 ? Object.keys(rows[0]) : [],
      },
      { headers: noCacheHeaders() }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * POST — accepts raw PMF rows as JSON and saves to blob.
 * Body: { rows: Record<string, string>[] }
 *
 * After saving, if a product mapping exists, auto-rebuilds the product master.
 */
export async function POST(req: NextRequest) {
  try {
    requireRole(req, "admin");
    const slug = await getTenantSlug();
    const body = (await req.json()) as { rows: Record<string, string>[] };

    if (!body.rows || !Array.isArray(body.rows) || body.rows.length === 0) {
      return Response.json(
        { error: "Request body must contain a non-empty rows array" },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    await savePmfData(slug, body.rows);

    // Auto-rebuild product master if a mapping exists
    let masterCount = 0;
    const mapping = await getProductMapping(slug);
    if (mapping && mapping.article) {
      const result = await buildProductMaster(slug);
      masterCount = result.count;
    }

    return Response.json(
      {
        success: true,
        rowCount: body.rows.length,
        headers: Object.keys(body.rows[0]),
        masterRebuilt: masterCount > 0,
        masterCount,
      },
      { headers: noCacheHeaders() }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}
