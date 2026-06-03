/* ──────────────────────────────────────────────────────────────
   Enrichment Engine — query-time dimension enrichment
   ────────────────────────────────────────────────────────────── */

import { getProductLookup } from "./productMasterData";
import { getStoreLookup } from "./storeLookup";
import type { ProductMaster, ScorecardStore } from "./types";

type RawRow = Record<string, unknown>;
type EnrichedRow = Record<string, unknown>;

/**
 * Enrich a single row with product + store dimensions.
 * Prefixed field names avoid collisions with original data.
 *
 * Product fields (from ProductMaster):
 *   _brand, _category, _productStatus, _productDescription, _barcode
 *
 * Store fields (from ScorecardStore):
 *   _storeId, _storeName, _storeChannel, _storeRegion
 */
export function enrichLedgerRow(
  row: RawRow,
  productLookup: Map<string, ProductMaster>,
  storeLookup: Map<string, ScorecardStore>
): EnrichedRow {
  const enriched: EnrichedRow = { ...row };

  // ── Product join (by Article field) ──
  const articleRaw = row["Article"] ?? row["article"] ?? row["ARTICLE"];
  if (articleRaw != null) {
    const articleKey = String(articleRaw).toLowerCase().trim();
    const product = productLookup.get(articleKey);
    if (product) {
      enriched._brand = product.brand ?? "";
      enriched._category = product.category ?? "";
      enriched._productStatus = product.status ?? "";
      enriched._productDescription = product.description ?? "";
      enriched._barcode = product.barcode ?? "";
    } else {
      enriched._brand = "";
      enriched._category = "";
      enriched._productStatus = "";
      enriched._productDescription = "";
      enriched._barcode = "";
    }
  }

  // ── Store join (by Site field) ──
  const siteRaw = row["Site"] ?? row["site"] ?? row["SITE"];
  if (siteRaw != null) {
    const siteKey = String(siteRaw).toLowerCase().trim();
    const store = storeLookup.get(siteKey);
    if (store) {
      enriched._storeId = store.id;
      enriched._storeName = store.name ?? "";
      enriched._storeChannel = store.channelName ?? "";
      enriched._storeRegion = store.region ?? "";
    } else {
      enriched._storeId = "";
      enriched._storeName = "";
      enriched._storeChannel = "";
      enriched._storeRegion = "";
    }
  }

  return enriched;
}

/**
 * Enrich an array of ledger rows with product + store dimensions.
 * Loads both lookups in parallel, then enriches all rows.
 */
export async function enrichLedger(
  rows: RawRow[],
  slug: string
): Promise<{
  rows: EnrichedRow[];
  productCount: number;
  storeCount: number;
}> {
  const [productLookup, storeLookup] = await Promise.all([
    getProductLookup(slug),
    getStoreLookup(slug),
  ]);

  const enrichedRows = rows.map((row) =>
    enrichLedgerRow(row, productLookup, storeLookup)
  );

  return {
    rows: enrichedRows,
    productCount: productLookup.size,
    storeCount: storeLookup.size,
  };
}
