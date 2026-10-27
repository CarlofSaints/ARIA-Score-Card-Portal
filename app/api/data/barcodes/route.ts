import { NextRequest } from "next/server";
import { requireLogin, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { readJson } from "@/lib/blob";

// SKU -> "Product Barcode EA", collected by the sync (data/barcodes.json).
export async function GET(req: NextRequest) {
  try {
    await requireLogin(req);
    const slug = await getTenantSlug();
    const barcodes = await readJson<Record<string, string>>(`${slug}/data/barcodes.json`, {});
    return Response.json({ barcodes }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
