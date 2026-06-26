import { getTenantConfig } from "@/lib/getTenantConfig";
import { writeJson, readJson } from "@/lib/blob";
import { loadAllRanging } from "@/lib/rangingData";
import {
  getClientChannels,
  getClientStores,
  getClientProducts,
  getClientBrands,
  getSalesPnp,
  getSparSales,
  getOosPnp,
  getNdPnp,
  getSparNd,
  getPhantomStockPnp,
} from "@/lib/sqlProxy";
import type {
  ScorecardChannel,
  ScorecardStore,
  ScorecardProduct,
  SalesData,
  SalesDetailRow,
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
    salesChannels: number | string;
    salesStores: number | string;
    salesProducts: number | string;
    salesDetail: number | string;
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
    subChannel: st.SubChannel || undefined,
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

  // ── Batch 2: Sales, OOS, ND, Phantom, Brands (PnP + SPAR) ──
  // Track whether each stored procedure actually succeeded — a failed call must
  // NOT overwrite previously-synced data with an empty set. Sales and ND are now
  // multi-channel: PnP (pool2) + SPAR (primary) run in parallel and their rows
  // are merged. SPAR has no SOH → no SPAR OOS/Phantom.
  let salesPnpOk = true;
  let salesSparOk = true;
  let salesError = "";
  let oosOk = true;
  let oosError = "";
  let ndPnpOk = true;
  let ndSparOk = true;
  let ndError = "";
  let phantomOk = true;
  let phantomError = "";

  const [salesPnpRes, salesSparRes, oosRes, ndPnpRes, ndSparRes, phantomRes, brandsRes] =
    await Promise.all([
      getSalesPnp(client).catch((e) => {
        salesPnpOk = false;
        salesError = e instanceof Error ? e.message : String(e);
        return { data: [], count: 0 };
      }),
      getSparSales(client).catch((e) => {
        salesSparOk = false;
        salesError = (salesError ? salesError + " | " : "") + "SPAR: " + (e instanceof Error ? e.message : String(e));
        return { data: [], count: 0 };
      }),
      getOosPnp(client).catch((e) => {
        oosOk = false;
        oosError = e instanceof Error ? e.message : String(e);
        return { data: [], count: 0 };
      }),
      getNdPnp(client, ndRollingDays).catch((e) => {
        ndPnpOk = false;
        ndError = e instanceof Error ? e.message : String(e);
        return { data: [], count: 0 };
      }),
      getSparNd(client, ndRollingDays).catch((e) => {
        ndSparOk = false;
        ndError = (ndError ? ndError + " | " : "") + "SPAR: " + (e instanceof Error ? e.message : String(e));
        return { data: [], count: 0 };
      }),
      getPhantomStockPnp(client, phantomDays).catch((e) => {
        phantomOk = false;
        phantomError = e instanceof Error ? e.message : String(e);
        return { data: [], count: 0 };
      }),
      getClientBrands(client).catch(() => ({ data: [], count: 0 })),
    ]);

  // Merge PnP + SPAR rows for the multi-channel KPIs. Each row carries its own
  // Channel, so the per-channel/store/product aggregation handles both natively.
  const salesRes = { data: [...salesPnpRes.data, ...salesSparRes.data] };
  const ndRes = { data: [...ndPnpRes.data, ...ndSparRes.data] };
  // Sales/ND are written if ANY of their channels returned data (so a SPAR
  // timeout doesn't wipe PnP, and vice-versa).
  const salesOk = salesPnpOk || salesSparOk;
  const ndOk = ndPnpOk || ndSparOk;

  // ── Shared lookup maps (used by Sales, OOS, ND and Phantom aggregation) ──
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

  // ── Aggregate Sales (GetSales_PNP — PnP channel) ──
  // The SP returns one row per site-SKU with YTD + MTD measures and their
  // prior-year (PY) comparatives. SPLY = "PY YTD". We aggregate up to
  // channel/store/product (the scorecard entity grains) producing both the
  // SalesData[] used by the scoring engine and the SalesDetailRow[] rendered by
  // the Sales page. Units columns come back as strings → coerce with num().
  const num = (v: unknown): number => {
    const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
    return Number.isFinite(n) ? n : 0;
  };

  interface SalesAgg {
    ytdValue: number;
    ytdUnits: number;
    splyValue: number;
    splyUnits: number;
    mtdValue: number;
    mtdUnits: number;
    pyMtdValue: number;
    pyMtdUnits: number;
    lmValue: number;
    lmUnits: number;
  }
  const emptyAgg = (): SalesAgg => ({
    ytdValue: 0,
    ytdUnits: 0,
    splyValue: 0,
    splyUnits: 0,
    mtdValue: 0,
    mtdUnits: 0,
    pyMtdValue: 0,
    pyMtdUnits: 0,
    lmValue: 0,
    lmUnits: 0,
  });
  const addRow = (a: SalesAgg, r: (typeof salesRes.data)[number]) => {
    a.ytdValue += num(r["YTD Value"]);
    a.ytdUnits += num(r["YTD Units"]);
    a.splyValue += num(r["PY YTD Value"]);
    a.splyUnits += num(r["PY YTD Units"]);
    a.mtdValue += num(r["MTD Value"]);
    a.mtdUnits += num(r["MTD Units"]);
    a.pyMtdValue += num(r["PY MTD Value"]);
    a.pyMtdUnits += num(r["PY MTD Units"]);
    a.lmValue += num(r["PMTD Value"]);
    a.lmUnits += num(r["PMTD Units"]);
  };

  const salesByChannelId = new Map<string, SalesAgg>();
  const salesByStoreId = new Map<string, SalesAgg>();
  const salesByProductId = new Map<string, SalesAgg>();
  // Resolve product display name/brand from the SP rows for product detail rows.
  const salesBrandByProduct: Record<string, string> = {};
  const salesNameByProduct: Record<string, string> = {};

  for (const r of salesRes.data) {
    const store = storeBySiteCode.get(r.SiteCode);
    const product = productBySku.get(r["Product ID"]);
    const channelId = store
      ? channelIdByName.get(store.channelName)
      : channelIdByName.get(r.Channel);

    if (channelId) {
      let a = salesByChannelId.get(channelId);
      if (!a) salesByChannelId.set(channelId, (a = emptyAgg()));
      addRow(a, r);
    }
    if (store) {
      let a = salesByStoreId.get(store.id);
      if (!a) salesByStoreId.set(store.id, (a = emptyAgg()));
      addRow(a, r);
    }
    if (product) {
      let a = salesByProductId.get(product.id);
      if (!a) salesByProductId.set(product.id, (a = emptyAgg()));
      addRow(a, r);
      const spBrand = String(r["Product Brand"] ?? r.Brand ?? "");
      if (spBrand) salesBrandByProduct[product.id] = spBrand;
      if (r["Product Description"]) salesNameByProduct[product.id] = r["Product Description"];
    }
  }

  const growth = (ytd: number, sply: number): number =>
    sply > 0 ? Math.round(((ytd - sply) / sply) * 1000) / 10 : 0;

  const salesChannels: SalesData[] = channels.map((ch) => {
    const a = salesByChannelId.get(ch.id) || emptyAgg();
    return {
      entityId: ch.id,
      entityType: "channel" as const,
      period,
      salesValue: a.ytdValue,
      salesUnits: a.ytdUnits,
      previousPeriodSalesValue: a.splyValue,
      previousPeriodSalesUnits: a.splyUnits,
      mtdValue: a.mtdValue,
      mtdUnits: a.mtdUnits,
      pyMtdValue: a.pyMtdValue,
      pyMtdUnits: a.pyMtdUnits,
      lastMonthValue: a.lmValue,
      lastMonthUnits: a.lmUnits,
    };
  });

  const salesStores: SalesData[] = stores.map((st) => {
    const a = salesByStoreId.get(st.id) || emptyAgg();
    return {
      entityId: st.id,
      entityType: "store" as const,
      period,
      salesValue: a.ytdValue,
      salesUnits: a.ytdUnits,
      previousPeriodSalesValue: a.splyValue,
      previousPeriodSalesUnits: a.splyUnits,
      mtdValue: a.mtdValue,
      mtdUnits: a.mtdUnits,
      pyMtdValue: a.pyMtdValue,
      pyMtdUnits: a.pyMtdUnits,
      lastMonthValue: a.lmValue,
      lastMonthUnits: a.lmUnits,
    };
  });

  const salesProducts: SalesData[] = products.map((p) => {
    const a = salesByProductId.get(p.id) || emptyAgg();
    return {
      entityId: p.id,
      entityType: "product" as const,
      period,
      salesValue: a.ytdValue,
      salesUnits: a.ytdUnits,
      previousPeriodSalesValue: a.splyValue,
      previousPeriodSalesUnits: a.splyUnits,
      mtdValue: a.mtdValue,
      mtdUnits: a.mtdUnits,
      pyMtdValue: a.pyMtdValue,
      pyMtdUnits: a.pyMtdUnits,
      lastMonthValue: a.lmValue,
      lastMonthUnits: a.lmUnits,
    };
  });

  // One flat detail row per entity (channel/store/product) for the Sales page.
  const salesDetailRows: SalesDetailRow[] = [];
  for (const ch of channels) {
    const a = salesByChannelId.get(ch.id) || emptyAgg();
    salesDetailRows.push({
      level: "channel",
      entityId: ch.id,
      channelName: ch.name,
      subChannel: "",
      siteCode: "",
      storeName: "",
      productId: "",
      productName: "",
      brand: "",
      ytdValue: a.ytdValue,
      ytdUnits: a.ytdUnits,
      splyValue: a.splyValue,
      splyUnits: a.splyUnits,
      growthPercent: growth(a.ytdValue, a.splyValue),
      mtdValue: a.mtdValue,
      mtdUnits: a.mtdUnits,
      pyMtdValue: a.pyMtdValue,
      pyMtdUnits: a.pyMtdUnits,
      mtdGrowthPercent: growth(a.mtdValue, a.pyMtdValue),
    });
  }
  for (const st of stores) {
    const a = salesByStoreId.get(st.id) || emptyAgg();
    salesDetailRows.push({
      level: "store",
      entityId: st.id,
      channelName: st.channelName,
      subChannel: st.subChannel || "",
      siteCode: st.siteCode || st.id,
      storeName: st.name,
      productId: "",
      productName: "",
      brand: "",
      ytdValue: a.ytdValue,
      ytdUnits: a.ytdUnits,
      splyValue: a.splyValue,
      splyUnits: a.splyUnits,
      growthPercent: growth(a.ytdValue, a.splyValue),
      mtdValue: a.mtdValue,
      mtdUnits: a.mtdUnits,
      pyMtdValue: a.pyMtdValue,
      pyMtdUnits: a.pyMtdUnits,
      mtdGrowthPercent: growth(a.mtdValue, a.pyMtdValue),
    });
  }
  for (const p of products) {
    const a = salesByProductId.get(p.id) || emptyAgg();
    salesDetailRows.push({
      level: "product",
      entityId: p.id,
      channelName: "",
      subChannel: "",
      siteCode: "",
      storeName: "",
      productId: p.sku,
      productName: salesNameByProduct[p.id] || p.name,
      brand: salesBrandByProduct[p.id] || p.brand || "",
      ytdValue: a.ytdValue,
      ytdUnits: a.ytdUnits,
      splyValue: a.splyValue,
      splyUnits: a.splyUnits,
      growthPercent: growth(a.ytdValue, a.splyValue),
      mtdValue: a.mtdValue,
      mtdUnits: a.mtdUnits,
      pyMtdValue: a.pyMtdValue,
      pyMtdUnits: a.pyMtdUnits,
      mtdGrowthPercent: growth(a.mtdValue, a.pyMtdValue),
    });
  }

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

  // ── Aggregate ND (GetDataForCustomDev_PNP_NumericalDistribution — PnP) ──
  // The SP returns ALL ranged site-SKUs (Ranging Status = TRUE) with a
  // "Numerical Distributed" flag (1 = distributed, 0 = not). ND% per entity =
  // distributed / ranged, computed directly from these rows (self-contained —
  // no range file). distributedCount = numerator, rangedCount = denominator.
  const seenNd = new Set<string>();
  const dedupedNd = ndRes.data.filter((row) => {
    const key = `${row.SiteCode}|${row["Product ID"]}`;
    if (seenNd.has(key)) return false;
    seenNd.add(key);
    return true;
  });

  const isDistributed = (v: unknown): boolean => {
    const s = String(v ?? "").trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes" || s === "y";
  };

  // [distributed, rangedTotal] per entity id.
  const ndDistByChannel: Record<string, number> = {};
  const ndRangedByChannel: Record<string, number> = {};
  const ndDistByStore: Record<string, number> = {};
  const ndRangedByStore: Record<string, number> = {};
  const ndDistByProduct: Record<string, number> = {};
  const ndRangedByProduct: Record<string, number> = {};
  // Resolve brand per product id from the SP rows (preferred over the master).
  const ndBrandByProduct: Record<string, string> = {};

  for (const row of dedupedNd) {
    const store = storeBySiteCode.get(row.SiteCode);
    const product = productBySku.get(row["Product ID"]);
    const channelId = store
      ? channelIdByName.get(store.channelName)
      : channelIdByName.get(row.Channel);
    const dist = isDistributed(row["Numerical Distributed"]);

    if (channelId) {
      ndRangedByChannel[channelId] = (ndRangedByChannel[channelId] || 0) + 1;
      if (dist) ndDistByChannel[channelId] = (ndDistByChannel[channelId] || 0) + 1;
    }
    if (store) {
      ndRangedByStore[store.id] = (ndRangedByStore[store.id] || 0) + 1;
      if (dist) ndDistByStore[store.id] = (ndDistByStore[store.id] || 0) + 1;
    }
    if (product) {
      ndRangedByProduct[product.id] = (ndRangedByProduct[product.id] || 0) + 1;
      if (dist) ndDistByProduct[product.id] = (ndDistByProduct[product.id] || 0) + 1;
    }

    const spBrand = String(row["Product Brand"] ?? row.Brand ?? "");
    if (product && spBrand) ndBrandByProduct[product.id] = spBrand;
  }

  const ndByChannel: Record<string, number> = {};
  const ndByStore: Record<string, number> = {};
  const ndByProduct: Record<string, number> = {};
  const ndDetailRows: NdDetailRow[] = [];
  const ndPct = (dist: number, ranged: number) =>
    ranged > 0 ? Math.round((dist / ranged) * 1000) / 10 : 0;

  for (const ch of channels) {
    const dist = ndDistByChannel[ch.id] || 0;
    const ranged = ndRangedByChannel[ch.id] || 0;
    const pct = ndPct(dist, ranged);
    ndByChannel[ch.id] = pct;
    ndDetailRows.push({
      level: "channel",
      channelName: ch.name,
      subChannel: "",
      siteCode: "",
      storeName: "",
      productId: "",
      productName: "",
      brand: "",
      rangedCount: dist,
      totalCount: ranged,
      ndPercent: pct,
    });
  }

  for (const st of stores) {
    const dist = ndDistByStore[st.id] || 0;
    const ranged = ndRangedByStore[st.id] || 0;
    const pct = ndPct(dist, ranged);
    ndByStore[st.id] = pct;
    ndDetailRows.push({
      level: "store",
      channelName: st.channelName,
      subChannel: st.subChannel || "",
      siteCode: st.siteCode || st.id,
      storeName: st.name,
      productId: "",
      productName: "",
      brand: "",
      rangedCount: dist,
      totalCount: ranged,
      ndPercent: pct,
    });
  }

  for (const p of products) {
    const dist = ndDistByProduct[p.id] || 0;
    const ranged = ndRangedByProduct[p.id] || 0;
    const pct = ndPct(dist, ranged);
    ndByProduct[p.id] = pct;
    ndDetailRows.push({
      level: "product",
      channelName: "",
      subChannel: "",
      siteCode: "",
      storeName: "",
      productId: p.sku,
      productName: p.name,
      brand: ndBrandByProduct[p.id] || p.brand || "",
      rangedCount: dist,
      totalCount: ranged,
      ndPercent: pct,
    });
  }

  // Extract brand list
  const brands: string[] = brandsRes.data.map((b) => b.Brand);

  // ── Coverage: which entities have data, PER KPI ──
  // Channels differ by KPI: PnP has all four; SPAR has only Sales + ND (no SOH →
  // no OOS/Phantom). The scores route uses this to (a) show "—" for KPIs an
  // entity has no data for, and (b) redistribute the missing KPIs' points over
  // the ones it does have. An entity with no data for any KPI shows as no-data.
  const coverageFrom = (
    rows: ReadonlyArray<{ SiteCode: string; "Product ID": string; Channel: string }>
  ) => {
    const ch = new Set<string>();
    const st = new Set<string>();
    const pr = new Set<string>();
    for (const r of rows) {
      const store = storeBySiteCode.get(r.SiteCode);
      const product = productBySku.get(r["Product ID"]);
      const channelId = store
        ? channelIdByName.get(store.channelName)
        : channelIdByName.get(r.Channel);
      if (channelId) ch.add(channelId);
      if (store) st.add(store.id);
      if (product) pr.add(product.id);
    }
    return { channels: [...ch], stores: [...st], products: [...pr] };
  };
  const coverage = {
    sales: coverageFrom(salesRes.data),
    nd: coverageFrom(dedupedNd),
    oos: coverageFrom(oosRows),
    phantom: coverageFrom(dedupedPhantom),
  };

  // ── Write everything to blob ──
  const writes = [
    writeJson(`${slug}/data/channels.json`, channels),
    writeJson(`${slug}/data/stores.json`, stores),
    writeJson(`${slug}/data/products.json`, products),
    writeJson(`${slug}/data/brands.json`, brands),
    writeJson(`${slug}/data/kpi/${period}/coverage.json`, coverage),
  ];

  // Only overwrite Sales data when the SP succeeded (a failed call must not wipe
  // previously-synced sales with an empty set).
  if (salesOk) {
    writes.push(
      writeJson(`${slug}/data/sales/${period}/channels.json`, salesChannels),
      writeJson(`${slug}/data/sales/${period}/stores.json`, salesStores),
      writeJson(`${slug}/data/sales/${period}/products.json`, salesProducts),
      writeJson(`${slug}/data/sales/${period}/detail.json`, salesDetailRows)
    );
  }

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
  if (salesOk) {
    syncMeta.salesChannelCount = salesChannels.length;
    syncMeta.salesStoreCount = salesStores.length;
    syncMeta.salesProductCount = salesProducts.length;
    syncMeta.salesDetailCount = salesDetailRows.length;
    syncMeta.salesRowCount = salesRes.data.length;
  }
  syncMeta.salesOk = salesOk;
  syncMeta.salesPnpOk = salesPnpOk;
  syncMeta.salesSparOk = salesSparOk;
  syncMeta.salesError = salesError;
  if (oosOk) syncMeta.oosDetailCount = oosDetailRows.length;
  syncMeta.oosOk = oosOk;
  syncMeta.oosError = oosError;
  if (ndOk) syncMeta.ndDetailCount = ndDetailRows.length;
  syncMeta.ndOk = ndOk;
  syncMeta.ndPnpOk = ndPnpOk;
  syncMeta.ndSparOk = ndSparOk;
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
      salesChannels: salesOk ? salesChannels.length : "(unchanged — SP failed)",
      salesStores: salesOk ? salesStores.length : "(unchanged — SP failed)",
      salesProducts: salesOk ? salesProducts.length : "(unchanged — SP failed)",
      salesDetail: salesOk ? salesDetailRows.length : "(unchanged — SP failed)",
      oosDetail: oosOk ? oosDetailRows.length : "(unchanged — SP failed)",
      ndDetail: ndOk ? ndDetailRows.length : "(unchanged — SP failed)",
      phantomDetail: phantomOk ? phantomRows.length : "(unchanged — SP failed)",
    },
  };
}
