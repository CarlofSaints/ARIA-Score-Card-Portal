import { getTenantConfig } from "@/lib/getTenantConfig";
import { writeJson, readJson } from "@/lib/blob";
import { loadAllRanging } from "@/lib/rangingData";
import {
  getClientChannels,
  getClientStores,
  getClientProducts,
  getClientBrands,
  getYtdSalesByChannel,
  getYtdSalesByStore,
  getYtdSalesByProduct,
  getOosPnp,
  getNdPnp,
  getPhantomStockPnp,
} from "@/lib/sqlProxy";
import type {
  ScorecardChannel,
  ScorecardStore,
  ScorecardProduct,
  SalesData,
  PhantomDetailRow,
  OosDetailRow,
  NdDetailRow,
} from "@/lib/types";

export interface SyncResult {
  period: string;
  phantomSkipped: boolean;
  phantomError?: string;
  counts: {
    channels: number;
    stores: number;
    products: number;
    brands: number;
    salesChannels: number;
    salesStores: number;
    salesProducts: number;
    oosDetail: number | string;
    ndDetail: number | string;
    phantomDetail: number | string;
  };
}

/**
 * Pull all SQL data for a single tenant and write it to blob. Shared by the
 * manual sync route, the auto-resync trigger, and the scheduled cron. Takes a
 * tenant slug directly — no request/header/auth dependency — so it can run
 * outside a user session (e.g. from cron).
 *
 * Throws if the tenant has no SQL client mapped (caller decides how to surface).
 *
 * `source` records what triggered the run; cron runs additionally stamp a
 * `lastAutoSync` timestamp so the Control Centre can show when the schedule
 * last fired (distinct from a manual Sync Now).
 */
export async function runSyncForTenant(
  slug: string,
  source: "manual" | "cron" = "manual"
): Promise<SyncResult> {
  const config = await getTenantConfig(slug);
  if (!config?.sqlClientName) {
    throw new Error(
      `No SQL client mapped for tenant "${slug}". Set it in Super Admin > Edit Client.`
    );
  }

  const client = config.sqlClientName;
  const phantomDays = config.phantomLookbackDays ?? 60;
  const ndRollingDays = config.ndRollingDays ?? 60;
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // ── Batch 1: Core data (channels, stores, products) ──
  const [channelsRes, storesRes, productsRes] = await Promise.all([
    getClientChannels(client),
    getClientStores(client),
    getClientProducts(client),
  ]);

  // Transform channels — no ChannelDataID exists; the channel name is the id.
  const channels: ScorecardChannel[] = channelsRes.data.map((ch) => ({
    id: ch.Channel,
    name: ch.Channel,
  }));

  // Transform stores — SiteID is the site code string (e.g. "PNP-HC14"); the
  // display name lives in "Site Name". Use SiteID as both id and siteCode.
  const stores: ScorecardStore[] = storesRes.data.map((st) => ({
    id: String(st.SiteID),
    name: st["Site Name"] || String(st.SiteID),
    channelId: st.Channel,
    channelName: st.Channel,
    region: st.Province || undefined,
    siteCode: String(st.SiteID),
  }));

  // Transform products — the product key is "Client Product ID" (no ID column).
  const products: ScorecardProduct[] = productsRes.data.map((p) => ({
    id: p["Client Product ID"],
    name: p["Product Description"] || p["Client Product ID"],
    sku: p["Client Product ID"],
    brand: p["Product Brand"] || "Unknown",
    category: p["Product Category"] || undefined,
  }));

  // ── Batch 2: Sales, OOS, ND, Phantom, Brands ──
  // Track whether each PnP stored procedure actually succeeded — a failed call
  // must NOT overwrite previously-synced data with an empty set.
  let oosOk = true;
  let oosError = "";
  let ndOk = true;
  let ndError = "";
  let phantomOk = true;
  let phantomError = "";

  const [
    salesChannelRes,
    salesStoreRes,
    salesProductRes,
    oosRes,
    ndRes,
    phantomRes,
    brandsRes,
  ] = await Promise.all([
    getYtdSalesByChannel(client).catch(() => ({ data: [], count: 0 })),
    getYtdSalesByStore(client).catch(() => ({ data: [], count: 0 })),
    getYtdSalesByProduct(client).catch(() => ({ data: [], count: 0 })),
    getOosPnp(client).catch((e) => {
      oosOk = false;
      oosError = e instanceof Error ? e.message : String(e);
      return { data: [], count: 0 };
    }),
    getNdPnp(client, ndRollingDays).catch((e) => {
      ndOk = false;
      ndError = e instanceof Error ? e.message : String(e);
      return { data: [], count: 0 };
    }),
    getPhantomStockPnp(client, phantomDays).catch((e) => {
      phantomOk = false;
      phantomError = e instanceof Error ? e.message : String(e);
      return { data: [], count: 0 };
    }),
    getClientBrands(client).catch(() => ({ data: [], count: 0 })),
  ]);

  // ── Transform sales rows into SalesData[] ──
  const salesChannels: SalesData[] = salesChannelRes.data.map((r) => {
    const ch = channels.find((c) => c.name === r.Channel);
    return {
      entityId: ch?.id || String(r.ChannelDataID || r.Channel),
      entityType: "channel" as const,
      period,
      salesValue: r.YTD_Value || 0,
      salesUnits: r.YTD_Units || 0,
      previousPeriodSalesValue: r.SPLY_Value || 0,
      previousPeriodSalesUnits: r.SPLY_Units || 0,
    };
  });

  const salesStores: SalesData[] = salesStoreRes.data.map((r) => ({
    entityId: String(r.SiteID),
    entityType: "store" as const,
    period,
    salesValue: r.YTD_Value || 0,
    salesUnits: r.YTD_Units || 0,
    previousPeriodSalesValue: r.SPLY_Value || 0,
    previousPeriodSalesUnits: r.SPLY_Units || 0,
  }));

  const salesProducts: SalesData[] = salesProductRes.data.map((r) => {
    const p = products.find((x) => x.sku === r.SKU);
    return {
      entityId: p?.id || String(r.ProductID),
      entityType: "product" as const,
      period,
      salesValue: r.YTD_Value || 0,
      salesUnits: r.YTD_Units || 0,
      previousPeriodSalesValue: r.SPLY_Value || 0,
      previousPeriodSalesUnits: r.SPLY_Units || 0,
    };
  });

  // ── Shared lookup maps (used by OOS, ND and Phantom aggregation) ──
  const channelIdByName = new Map<string, string>(
    channels.map((c) => [c.name, c.id] as [string, string])
  );
  const storeBySiteCode = new Map<string, ScorecardStore>(
    stores
      .filter((s) => s.siteCode)
      .map((s) => [s.siteCode as string, s] as [string, ScorecardStore])
  );
  const productBySku = new Map<string, ScorecardProduct>(
    products.map((p) => [p.sku, p] as [string, ScorecardProduct])
  );

  // ── Aggregate OOS (GetOutOfStock_PNP — PnP channel) ──
  // The SP returns per site-SKU rows it flags as out of stock. SiteCode maps to
  // a store (store.id === SiteCode) and "Product ID" to a product (product.id
  // === sku). Brand prefers the SP column, falling back to the product master.
  // % per entity = OOS items / total possible (stores × products).
  const oosRows = oosRes.data;
  const oosCountByChannel: Record<string, number> = {};
  const oosTotalByChannel: Record<string, number> = {};
  const oosCountByStore: Record<string, number> = {};
  const oosTotalByStore: Record<string, number> = {};
  const oosCountByProduct: Record<string, number> = {};
  const oosTotalByProduct: Record<string, number> = {};

  const oosDetailRows: OosDetailRow[] = oosRows.map((row) => {
    const store = storeBySiteCode.get(row.SiteCode);
    const product = productBySku.get(row["Product ID"]);
    const channelId = store
      ? channelIdByName.get(store.channelName)
      : channelIdByName.get(row.Channel);

    if (channelId) oosCountByChannel[channelId] = (oosCountByChannel[channelId] || 0) + 1;
    if (store) oosCountByStore[store.id] = (oosCountByStore[store.id] || 0) + 1;
    if (product) oosCountByProduct[product.id] = (oosCountByProduct[product.id] || 0) + 1;

    return {
      siteCode: row.SiteCode,
      storeName: store?.name || row.SiteName || row.SiteCode,
      channelName: store?.channelName || row.Channel || "",
      subChannel: String(row.SubChannel ?? ""),
      province: store?.region || String(row.Province ?? ""),
      productId: row["Product ID"],
      productName: product?.name || row["Product Description"] || row["Product ID"],
      brand: String(row["Product Brand"] ?? row.Brand ?? "") || product?.brand || "",
      soh: 0,
      date: "",
    };
  });

  for (const ch of channels) {
    const chStores = stores.filter((s) => s.channelName === ch.name);
    oosTotalByChannel[ch.id] = chStores.length * products.length || 1;
  }
  for (const st of stores) {
    oosTotalByStore[st.id] = products.length || 1;
  }
  for (const p of products) {
    oosTotalByProduct[p.id] = stores.length || 1;
  }

  const oosByChannel: Record<string, number> = {};
  for (const ch of channels) {
    const count = oosCountByChannel[ch.id] || 0;
    const total = oosTotalByChannel[ch.id] || 1;
    oosByChannel[ch.id] = Math.round((count / total) * 1000) / 10;
  }

  const oosByStore: Record<string, number> = {};
  for (const st of stores) {
    const count = oosCountByStore[st.id] || 0;
    const total = oosTotalByStore[st.id] || 1;
    oosByStore[st.id] = Math.round((count / total) * 1000) / 10;
  }

  const oosByProduct: Record<string, number> = {};
  for (const p of products) {
    const count = oosCountByProduct[p.id] || 0;
    const total = oosTotalByProduct[p.id] || 1;
    oosByProduct[p.id] = Math.round((count / total) * 1000) / 10;
  }

  // ── Aggregate Phantom (GetPhantomStock_PNP — PnP channel) ──
  const seenPhantom = new Set<string>();
  const dedupedPhantom = phantomRes.data.filter((row) => {
    const key = `${row.SiteCode}|${row["Product ID"]}|${row.Date}`;
    if (seenPhantom.has(key)) return false;
    seenPhantom.add(key);
    return true;
  });

  // Load uploaded ranging — the % denominator for both phantom and ND.
  const ranging = await loadAllRanging(slug);
  const rangedByStoreCode: Record<string, number> = {};
  const rangedByProductId: Record<string, number> = {};
  const rangedTotalByChannelName: Record<string, number> = {};
  for (const rc of ranging) {
    rangedTotalByChannelName[rc.channel] =
      (rangedTotalByChannelName[rc.channel] || 0) + rc.total;
    for (const [sc, n] of Object.entries(rc.byStore))
      rangedByStoreCode[sc] = (rangedByStoreCode[sc] || 0) + n;
    for (const [pid, n] of Object.entries(rc.byProduct))
      rangedByProductId[pid] = (rangedByProductId[pid] || 0) + n;
  }
  const hasRanging = ranging.some((r) => r.total > 0);

  const phantomCountByChannel: Record<string, number> = {};
  const phantomCountByStore: Record<string, number> = {};
  const phantomCountByProduct: Record<string, number> = {};

  const phantomRows: PhantomDetailRow[] = dedupedPhantom.map((row) => {
    const store = storeBySiteCode.get(row.SiteCode);
    const product = productBySku.get(row["Product ID"]);
    const channelId = store ? channelIdByName.get(store.channelName) : undefined;

    const spRanging = String(row["Ranging Status"] ?? "").toLowerCase();
    const ranged = spRanging === "true" ? true : spRanging === "false" ? false : null;

    if (!hasRanging || ranged === true) {
      if (channelId)
        phantomCountByChannel[channelId] = (phantomCountByChannel[channelId] || 0) + 1;
      if (store) phantomCountByStore[store.id] = (phantomCountByStore[store.id] || 0) + 1;
      if (product) phantomCountByProduct[product.id] = (phantomCountByProduct[product.id] || 0) + 1;
    }

    return {
      siteCode: row.SiteCode,
      storeName: store?.name || row.SiteCode,
      channelName: store?.channelName || "",
      subChannel: String(row.SubChannel ?? ""),
      province: store?.region || "",
      productId: row["Product ID"],
      productName: product?.name || row["Product ID"],
      brand:
        String(row["Product Brand"] ?? row.Brand ?? "") || product?.brand || "",
      channelArticle: row.ChannelArticle,
      siteArticleStatus: String(row["Site Article Status"] ?? ""),
      ranged,
      soh: row.LatestSOH,
      date: row.Date,
      dateLastSold: row["Date Last Sold"] ?? null,
    };
  });

  const phantomByChannel: Record<string, number> = {};
  for (const ch of channels) {
    const count = phantomCountByChannel[ch.id] || 0;
    if (hasRanging) {
      const total = rangedTotalByChannelName[ch.name] || 0;
      if (total > 0) phantomByChannel[ch.id] = Math.round((count / total) * 1000) / 10;
    } else {
      const total = oosTotalByChannel[ch.id] || 1;
      phantomByChannel[ch.id] = Math.round((count / total) * 1000) / 10;
    }
  }

  const phantomByStore: Record<string, number> = {};
  for (const st of stores) {
    const count = phantomCountByStore[st.id] || 0;
    if (hasRanging) {
      const total = st.siteCode ? rangedByStoreCode[st.siteCode] || 0 : 0;
      if (total > 0) phantomByStore[st.id] = Math.round((count / total) * 1000) / 10;
    } else {
      const total = oosTotalByStore[st.id] || 1;
      phantomByStore[st.id] = Math.round((count / total) * 1000) / 10;
    }
  }

  const phantomByProduct: Record<string, number> = {};
  for (const p of products) {
    const count = phantomCountByProduct[p.id] || 0;
    if (hasRanging) {
      const total = rangedByProductId[p.sku] || 0;
      if (total > 0) phantomByProduct[p.id] = Math.round((count / total) * 1000) / 10;
    } else {
      const total = oosTotalByProduct[p.id] || 1;
      phantomByProduct[p.id] = Math.round((count / total) * 1000) / 10;
    }
  }

  // ── Aggregate ND (GetNumericalDistribution_PNP — PnP channel) ──
  // The SP returns per site-SKU rows it considers DISTRIBUTED within the scan
  // window. ND% = distributed / ranged (range file) by channel/store/product —
  // mirrors the phantom denominator logic (falls back to stores × products when
  // no ranging file is loaded). One detail row per level for the ND page.
  const seenNd = new Set<string>();
  const dedupedNd = ndRes.data.filter((row) => {
    const key = `${row.SiteCode}|${row["Product ID"]}`;
    if (seenNd.has(key)) return false;
    seenNd.add(key);
    return true;
  });

  const ndCountByChannel: Record<string, number> = {};
  const ndCountByStore: Record<string, number> = {};
  const ndCountByProduct: Record<string, number> = {};
  // Resolve brand per product id from the SP rows (preferred over the master).
  const ndBrandByProduct: Record<string, string> = {};

  for (const row of dedupedNd) {
    const store = storeBySiteCode.get(row.SiteCode);
    const product = productBySku.get(row["Product ID"]);
    const channelId = store
      ? channelIdByName.get(store.channelName)
      : channelIdByName.get(row.Channel);

    if (channelId) ndCountByChannel[channelId] = (ndCountByChannel[channelId] || 0) + 1;
    if (store) ndCountByStore[store.id] = (ndCountByStore[store.id] || 0) + 1;
    if (product) ndCountByProduct[product.id] = (ndCountByProduct[product.id] || 0) + 1;

    const spBrand = String(row["Product Brand"] ?? row.Brand ?? "");
    if (product && spBrand) ndBrandByProduct[product.id] = spBrand;
  }

  const ndByChannel: Record<string, number> = {};
  const ndByStore: Record<string, number> = {};
  const ndByProduct: Record<string, number> = {};
  const ndDetailRows: NdDetailRow[] = [];

  for (const ch of channels) {
    const count = ndCountByChannel[ch.id] || 0;
    const total = hasRanging
      ? rangedTotalByChannelName[ch.name] || 0
      : oosTotalByChannel[ch.id] || 0;
    const pct = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
    ndByChannel[ch.id] = pct;
    ndDetailRows.push({
      level: "channel",
      channelName: ch.name,
      siteCode: "",
      storeName: "",
      productId: "",
      productName: "",
      brand: "",
      rangedCount: count,
      totalCount: total,
      ndPercent: pct,
    });
  }

  for (const st of stores) {
    const count = ndCountByStore[st.id] || 0;
    const total = hasRanging
      ? st.siteCode
        ? rangedByStoreCode[st.siteCode] || 0
        : 0
      : oosTotalByStore[st.id] || 0;
    const pct = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
    ndByStore[st.id] = pct;
    ndDetailRows.push({
      level: "store",
      channelName: st.channelName,
      siteCode: st.siteCode || st.id,
      storeName: st.name,
      productId: "",
      productName: "",
      brand: "",
      rangedCount: count,
      totalCount: total,
      ndPercent: pct,
    });
  }

  for (const p of products) {
    const count = ndCountByProduct[p.id] || 0;
    const total = hasRanging
      ? rangedByProductId[p.sku] || 0
      : oosTotalByProduct[p.id] || 0;
    const pct = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
    ndByProduct[p.id] = pct;
    ndDetailRows.push({
      level: "product",
      channelName: "",
      siteCode: "",
      storeName: "",
      productId: p.sku,
      productName: p.name,
      brand: ndBrandByProduct[p.id] || p.brand || "",
      rangedCount: count,
      totalCount: total,
      ndPercent: pct,
    });
  }

  // Extract brand list
  const brands: string[] = brandsRes.data.map((b) => b.Brand);

  // ── Write everything to blob ──
  const writes = [
    writeJson(`${slug}/data/channels.json`, channels),
    writeJson(`${slug}/data/stores.json`, stores),
    writeJson(`${slug}/data/products.json`, products),
    writeJson(`${slug}/data/sales/${period}/channels.json`, salesChannels),
    writeJson(`${slug}/data/sales/${period}/stores.json`, salesStores),
    writeJson(`${slug}/data/sales/${period}/products.json`, salesProducts),
    writeJson(`${slug}/data/brands.json`, brands),
  ];

  // Only overwrite OOS data when the SP succeeded.
  if (oosOk) {
    writes.push(
      writeJson(`${slug}/data/kpi/${period}/oos-channel.json`, oosByChannel),
      writeJson(`${slug}/data/kpi/${period}/oos-store.json`, oosByStore),
      writeJson(`${slug}/data/kpi/${period}/oos-product.json`, oosByProduct),
      writeJson(`${slug}/data/oos/${period}/detail.json`, oosDetailRows)
    );
  }

  // Only overwrite ND data when the SP succeeded.
  if (ndOk) {
    writes.push(
      writeJson(`${slug}/data/kpi/${period}/nd-channel.json`, ndByChannel),
      writeJson(`${slug}/data/kpi/${period}/nd-store.json`, ndByStore),
      writeJson(`${slug}/data/kpi/${period}/nd-product.json`, ndByProduct),
      writeJson(`${slug}/data/nd/${period}/detail.json`, ndDetailRows)
    );
  }

  // Only overwrite phantom data when the SP succeeded.
  if (phantomOk) {
    writes.push(
      writeJson(`${slug}/data/kpi/${period}/phantom-channel.json`, phantomByChannel),
      writeJson(`${slug}/data/kpi/${period}/phantom-store.json`, phantomByStore),
      writeJson(`${slug}/data/kpi/${period}/phantom-product.json`, phantomByProduct),
      writeJson(`${slug}/data/phantom/${period}/detail.json`, phantomRows)
    );
  }

  await Promise.all(writes);

  // Save sync metadata
  const syncMeta = await readJson<Record<string, unknown>>(`${slug}/data/sync-meta.json`, {});
  syncMeta.lastSync = now.toISOString();
  syncMeta.lastSyncSource = source;
  if (source === "cron") syncMeta.lastAutoSync = now.toISOString();
  syncMeta.lastPeriod = period;
  syncMeta.channelCount = channels.length;
  syncMeta.storeCount = stores.length;
  syncMeta.productCount = products.length;
  syncMeta.brandCount = brands.length;
  syncMeta.salesChannelCount = salesChannels.length;
  syncMeta.salesStoreCount = salesStores.length;
  syncMeta.salesProductCount = salesProducts.length;
  if (oosOk) syncMeta.oosDetailCount = oosDetailRows.length;
  syncMeta.oosOk = oosOk;
  syncMeta.oosError = oosError;
  if (ndOk) syncMeta.ndDetailCount = ndDetailRows.length;
  syncMeta.ndOk = ndOk;
  syncMeta.ndError = ndError;
  // Record the scan window actually used so the ND page can show it.
  if (ndOk) syncMeta.ndRollingDays = ndRollingDays;
  if (phantomOk) syncMeta.phantomDetailCount = phantomRows.length;
  syncMeta.phantomOk = phantomOk;
  syncMeta.phantomError = phantomError;
  // Record the lookback window actually used so the Phantom page can show it.
  if (phantomOk) syncMeta.phantomDays = phantomDays;
  syncMeta.phantomBasis = hasRanging ? "ranged (range file)" : "legacy (stores×products)";
  syncMeta.rangedChannels = ranging.map((r) => r.channel);
  syncMeta.sqlClient = client;
  await writeJson(`${slug}/data/sync-meta.json`, syncMeta);

  return {
    period,
    phantomSkipped: !phantomOk,
    phantomError: phantomOk ? undefined : phantomError,
    counts: {
      channels: channels.length,
      stores: stores.length,
      products: products.length,
      brands: brands.length,
      salesChannels: salesChannels.length,
      salesStores: salesStores.length,
      salesProducts: salesProducts.length,
      oosDetail: oosOk ? oosDetailRows.length : "(unchanged — SP failed)",
      ndDetail: ndOk ? ndDetailRows.length : "(unchanged — SP failed)",
      phantomDetail: phantomOk ? phantomRows.length : "(unchanged — SP failed)",
    },
  };
}
