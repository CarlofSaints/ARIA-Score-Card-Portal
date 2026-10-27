import { NextRequest } from "next/server";
import { requireLogin, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { readJson } from "@/lib/blob";

const NOT_A_BARCODE = /^(unknown|n\/?a|none|null|-|0+)$/i;

// SKU -> "Product Barcode EA", collected by the sync (data/barcodes.json).
export async function GET(req: NextRequest) {
  try {
    await requireLogin(req);
    const slug = await getTenantSlug();
    const raw = await readJson<Record<string, string>>(`${slug}/data/barcodes.json`, {});
    // The product master holds placeholders like "UNKNOWN" for SKUs with no barcode.
    const barcodes = Object.fromEntries(Object.entries(raw).filter(([, v]) => !NOT_A_BARCODE.test(v)));
    return Response.json({ barcodes }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
