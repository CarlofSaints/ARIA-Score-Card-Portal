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
  getMassbuildSales,
  getGameSales,
  getMakroSales,
  getSrcSales,
  getOosPnp,
  getMassbuildOos,
  getGameOos,
  getMakroOos,
  getSrcOos,
  getNdPnp,
  getSparNd,
  getMassbuildNd,
  getGameNd,
  getMakroNd,
  getSrcNd,
  getPhantomStockPnp,
  getSrcPhantom,
  getMassbuildPhantom,
  getGamePhantom,
  getMakroPhantom,
} from "@/lib/sqlProxy";
import type { SqlSalesPnpRow } from "@/lib/sqlProxy";
import type {
  ScorecardChannel,
  ScorecardStore,
  ScorecardProduct,
  SalesData,
  SalesDetailRow,
  MonthSales,
  PhantomDetailRow,
  OosDetailRow,
  NdDetailRow,
} from "@/lib/types";

// A sync can be scoped to specific parts so a routine refresh doesn't re-pull
// everything (Sales changes daily; ND/Phantom rarely). "core" = channels /
// stores / products / brands master data.
export type SyncPart = "core" | "sales" | "oos" | "nd" | "phantom";
export const ALL_SYNC_PARTS: SyncPart[] = ["core", "sales", "oos", "nd", "phantom"];

export interface SyncResult {
  period: string;
  parts: SyncPart[];
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
  source: "manual" | "cron" = "manual",
  options: { parts?: SyncPart[] } = {}
): Promise<SyncResult> {
  const config = await getTenantConfig(slug);
  if (!config?.sqlClientName) {
    throw new Error(
      `No SQL client mapped for tenant "${slug}". Set it in Super Admin > Edit Client.`
    );
  }

  // Which parts to sync (default = everything, e.g. cron & first run).
  const parts: SyncPart[] =
    options.parts && options.parts.length ? options.parts : ALL_SYNC_PARTS;
  const wants = (p: SyncPart) => parts.includes(p);

  // Per-query timing: wrap each SP call so we record how long it took, how many
  // rows it returned, and whether it succeeded. Fed into the sync log + meta so
  // the Control Centre can show which query is slow.
  const syncStart = Date.now();
  const timings: Record<string, { ms: number; rows: number; ok: boolean; error?: string }> = {};
  const timed = <T extends { data: unknown[] }>(key: string, fn: () => Promise<T>): Promise<T> => {
    const start = Date.now();
    return fn().then(
      (r) => {
        timings[key] = { ms: Date.now() - start, rows: r.data.length, ok: true };
        return r;
      },
      (e) => {
        timings[key] = {
          ms: Date.now() - start,
          rows: 0,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        };
        throw e;
      }
    );
  };

  const client = config.sqlClientName;
  const phantomDays = config.phantomLookbackDays ?? 60;
  const ndRollingDays = config.ndRollingDays ?? 60;
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // ── Core master data (channels, stores, products, brands) ──
  // KPI rows map to these, so they must be in memory even on a partial sync.
  // When "core" is requested we re-pull + rewrite them; otherwise we reuse the
  // last-synced copies from blob (a KPI-only sync shouldn't re-pull master data).
  let channels: ScorecardChannel[] = [];
  let productMasterRows: Record<string, unknown>[] = []; // raw, for the barcode scan below
  let stores: ScorecardStore[] = [];
  let products: ScorecardProduct[] = [];
  let brands: string[] = [];
  let coreFetched = wants("core");

  const fetchCore = async () => {
    const [channelsRes, storesRes, productsRes, brandsRes] = await Promise.all([
      timed("client_channels", () => getClientChannels(client)),
      timed("client_stores", () => getClientStores(client)),
      timed("client_products", () => getClientProducts(client)),
      timed("client_brands", () => getClientBrands(client)).catch(() => ({ data: [], count: 0 })),
    ]);
    // Channels — no ChannelDataID exists; the channel name is the id.
    channels = channelsRes.data.map((ch) => ({ id: ch.Channel, name: ch.Channel }));
    // Stores — SiteID is the site code string (e.g. "PNP-HC14"); the display
    // name lives in "Site Name". Use SiteID as both id and siteCode.
    stores = storesRes.data.map((st) => ({
      id: String(st.SiteID),
      name: st["Site Name"] || String(st.SiteID),
      channelId: st.Channel,
      channelName: st.Channel,
      subChannel: st.SubChannel || undefined,
      region: st.Province || undefined,
      country: st.Country?.trim() || undefined,
      siteCode: String(st.SiteID),
    }));
    // Products — the product key is "Client Product ID" (no ID column).
    productMasterRows = productsRes.data as unknown as Record<string, unknown>[];
    products = productsRes.data.map((p) => ({
      id: p["Client Product ID"],
      name: p["Product Description"] || p["Client Product ID"],
      sku: p["Client Product ID"],
      brand: p["Product Brand"] || "Unknown",
      category: p["Product Category"] || undefined,
    }));
    brands = brandsRes.data.map((b) => b.Brand);
  };

  if (coreFetched) {
    await fetchCore();
  } else {
    [channels, stores, products] = await Promise.all([
      readJson<ScorecardChannel[]>(`${slug}/data/channels.json`, []),
      readJson<ScorecardStore[]>(`${slug}/data/stores.json`, []),
      readJson<ScorecardProduct[]>(`${slug}/data/products.json`, []),
    ]);
    // First-run safety: if master data was never synced, pull it now so KPI
    // rows have something to map to (and write it below).
    if (!channels.length && !stores.length && !products.length) {
      await fetchCore();
      coreFetched = true;
    }
  }

  // ── Batch 2: Sales, OOS, ND, Phantom, Brands (PnP + SPAR) ──
  // Track whether each stored procedure actually succeeded — a failed call must
  // NOT overwrite previously-synced data with an empty set. Sales and ND are now
  // multi-channel: PnP (pool2) + SPAR (primary) run in parallel and their rows
  // are merged. SPAR has no SOH → no SPAR OOS/Phantom.
  // Per-source success flags + a shared error log. A guarded fetch records its
  // own failure so a single channel's SP (denied / timed out) never wipes the
  // others or breaks the sync.
  const salesErrors: string[] = [];
  const ndErrors: string[] = [];
  const oosErrors: string[] = [];
  const phantomErrors: string[] = [];
  const okFlags = {
    salesPnp: true, salesSpar: true, salesMass: true, salesGame: true, salesMakro: true, salesSrc: true,
    ndPnp: true, ndSpar: true, ndMass: true, ndGame: true, ndMakro: true, ndSrc: true,
    oosPnp: true, oosMass: true, oosGame: true, oosMakro: true, oosSrc: true,
    phantomPnp: true, phantomMass: true, phantomGame: true, phantomMakro: true, phantomSrc: true,
  };
  const guard = (label: string, log: string[], onFail: () => void) => (e: unknown) => {
    onFail();
    log.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    return { data: [], count: 0 };
  };
  // Placeholder for a KPI phase that isn't being synced this run — its blobs are
  // left untouched below (nothing is written for it), preserving existing data.
  const emptyRes = { data: [] as never[], count: 0 };

  // ⚠️ Concurrency cap: run the SPs in KPI PHASES rather than one giant
  // Promise.all. The secondary server (pool2, .2) only has 5 connections, and
  // some SPs are slow (PnP sales ~77s). Firing all ~20 at once starved the pool
  // — queued queries hit the acquire timeout and were silently guarded out,
  // dropping whole channels' data at random (e.g. PnP/MASSBUILD sales vanished).
  // Each phase keeps pool2 concurrency at ≤5 (the pool max), so nothing queues,
  // and it's far gentler on Mark's DB than 20 heavy SPs at once. Phases run
  // sequentially; SPAR (primary .234) rides along in its phase on the other pool.
  const [
    salesPnpRes,
    salesSparRes,
    salesMassRes,
    salesGameRes,
    salesMakroRes,
    salesSrcRes,
  ] = wants("sales")
    ? await Promise.all([
        timed("sales_pnp", () => getSalesPnp(client)).catch(guard("PnP", salesErrors, () => (okFlags.salesPnp = false))),
        timed("sales_spar", () => getSparSales(client)).catch(guard("SPAR", salesErrors, () => (okFlags.salesSpar = false))),
        timed("sales_massbuild", () => getMassbuildSales(client)).catch(guard("MASSBUILD", salesErrors, () => (okFlags.salesMass = false))),
        timed("sales_game", () => getGameSales(client)).catch(guard("GAME", salesErrors, () => (okFlags.salesGame = false))),
        timed("sales_makro", () => getMakroSales(client)).catch(guard("MAKRO", salesErrors, () => (okFlags.salesMakro = false))),
        timed("sales_src", () => getSrcSales(client)).catch(guard("SRC", salesErrors, () => (okFlags.salesSrc = false))),
      ])
    : [emptyRes, emptyRes, emptyRes, emptyRes, emptyRes, emptyRes];

  const [
    oosPnpRes,
    oosMassRes,
    oosGameRes,
    oosMakroRes,
    oosSrcRes,
  ] = wants("oos")
    ? await Promise.all([
        timed("oos_pnp", () => getOosPnp(client)).catch(guard("PnP", oosErrors, () => (okFlags.oosPnp = false))),
        timed("oos_massbuild", () => getMassbuildOos(client)).catch(guard("MASSBUILD", oosErrors, () => (okFlags.oosMass = false))),
        timed("oos_game", () => getGameOos(client)).catch(guard("GAME", oosErrors, () => (okFlags.oosGame = false))),
        timed("oos_makro", () => getMakroOos(client)).catch(guard("MAKRO", oosErrors, () => (okFlags.oosMakro = false))),
        timed("oos_src", () => getSrcOos(client)).catch(guard("SRC", oosErrors, () => (okFlags.oosSrc = false))),
      ])
    : [emptyRes, emptyRes, emptyRes, emptyRes, emptyRes];

  const [
    ndPnpRes,
    ndSparRes,
    ndMassRes,
    ndGameRes,
    ndMakroRes,
    ndSrcRes,
  ] = wants("nd")
    ? await Promise.all([
        timed("nd_pnp", () => getNdPnp(client, ndRollingDays)).catch(guard("PnP", ndErrors, () => (okFlags.ndPnp = false))),
        timed("nd_spar", () => getSparNd(client, ndRollingDays)).catch(guard("SPAR", ndErrors, () => (okFlags.ndSpar = false))),
        timed("nd_massbuild", () => getMassbuildNd(client, ndRollingDays)).catch(guard("MASSBUILD", ndErrors, () => (okFlags.ndMass = false))),
        timed("nd_game", () => getGameNd(client, ndRollingDays)).catch(guard("GAME", ndErrors, () => (okFlags.ndGame = false))),
        timed("nd_makro", () => getMakroNd(client, ndRollingDays)).catch(guard("MAKRO", ndErrors, () => (okFlags.ndMakro = false))),
        timed("nd_src", () => getSrcNd(client, ndRollingDays)).catch(guard("SRC", ndErrors, () => (okFlags.ndSrc = false))),
      ])
    : [emptyRes, emptyRes, emptyRes, emptyRes, emptyRes, emptyRes];

  const [
    phantomPnpRes,
    phantomSrcRes,
    phantomMassRes,
    phantomGameRes,
    phantomMakroRes,
  ] = wants("phantom")
    ? await Promise.all([
        timed("phantom_stock_pnp", () => getPhantomStockPnp(client, phantomDays)).catch(guard("PnP", phantomErrors, () => (okFlags.phantomPnp = false))),
        timed("phantom_src", () => getSrcPhantom(client, phantomDays)).catch(guard("SRC", phantomErrors, () => (okFlags.phantomSrc = false))),
        timed("phantom_massbuild", () => getMassbuildPhantom(client, phantomDays)).catch(guard("MASSBUILD", phantomErrors, () => (okFlags.phantomMass = false))),
        timed("phantom_game", () => getGamePhantom(client, phantomDays)).catch(guard("GAME", phantomErrors, () => (okFlags.phantomGame = false))),
        timed("phantom_makro", () => getMakroPhantom(client, phantomDays)).catch(guard("MAKRO", phantomErrors, () => (okFlags.phantomMakro = false))),
      ])
    : [emptyRes, emptyRes, emptyRes, emptyRes, emptyRes];

  // Merge all channels' rows for the multi-channel KPIs. Each row carries its
  // own Channel, so the per-channel/store/product aggregation handles them all.
  const salesRes = {
    data: [
      ...salesPnpRes.data,
      ...salesSparRes.data,
      ...salesMassRes.data,
      ...salesGameRes.data,
      ...salesMakroRes.data,
      ...salesSrcRes.data,
    ],
  };
  const ndRes = {
    data: [
      ...ndPnpRes.data,
      ...ndSparRes.data,
      ...ndMassRes.data,
      ...ndGameRes.data,
      ...ndMakroRes.data,
      ...ndSrcRes.data,
    ],
  };
  const oosRes = {
    data: [
      ...oosPnpRes.data,
      ...oosMassRes.data,
      ...oosGameRes.data,
      ...oosMakroRes.data,
      ...oosSrcRes.data,
    ],
  };
  const phantomRes = {
    data: [
      ...phantomPnpRes.data,
      ...phantomSrcRes.data,
      ...phantomMassRes.data,
      ...phantomGameRes.data,
      ...phantomMakroRes.data,
    ],
  };
  // Sales/ND/OOS/Phantom are written if ANY channel returned data (so one
  // channel's failure never wipes the others).
  // Gate on wants(): a KPI that wasn't part of this sync must NOT write (its
  // existing blobs are preserved). A synced KPI writes if ANY channel returned.
  const salesOk =
    wants("sales") &&
    (okFlags.salesPnp || okFlags.salesSpar || okFlags.salesMass ||
      okFlags.salesGame || okFlags.salesMakro || okFlags.salesSrc);
  const ndOk =
    wants("nd") &&
    (okFlags.ndPnp || okFlags.ndSpar || okFlags.ndMass ||
      okFlags.ndGame || okFlags.ndMakro || okFlags.ndSrc);
  const oosOk =
    wants("oos") &&
    (okFlags.oosPnp || okFlags.oosMass || okFlags.oosGame ||
      okFlags.oosMakro || okFlags.oosSrc);
  const phantomOk =
    wants("phantom") &&
    (okFlags.phantomPnp || okFlags.phantomSrc || okFlags.phantomMass ||
      okFlags.phantomGame || okFlags.phantomMakro);
  const salesError = salesErrors.join(" | ");
  const ndError = ndErrors.join(" | ");
  const oosError = oosErrors.join(" | ");
  const phantomError = phantomErrors.join(" | ");
  const salesPnpOk = okFlags.salesPnp;
  const salesSparOk = okFlags.salesSpar;
  const ndPnpOk = okFlags.ndPnp;
  const ndSparOk = okFlags.ndSpar;

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

  // Month helpers: convert the SP's relative windows to absolute calendar months.
  const ymOf = (d: unknown): string => String(d ?? "").slice(0, 7); // "YYYY-MM"
  const prevYm = (ym: string): string => {
    const [y, m] = ym.split("-").map(Number);
    if (!y || !m) return "";
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  };

  // Per-month aggregate — mirrors MonthSales (full + live/partial figures).
  interface MonthAgg {
    value: number; // FULL calendar-month value (from PFM); 0 for the live month
    units: number;
    pyValue: number; // FULL same-month-LY (from PY FM); 0 until captured
    pyUnits: number;
    complete: boolean; // true for a settled month (value is the full month)
    asOf: string; // MaxDate for the live/partial month
    partialValue: number; // to-date value (MTD) — only meaningful while live
    partialUnits: number;
    partialPyValue: number; // to-date same-month-LY (PY MTD)
    partialPyUnits: number;
  }
  interface SalesAgg {
    ytdValue: number;
    ytdUnits: number;
    splyValue: number;
    splyUnits: number;
    mtdValue: number;
    mtdUnits: number;
    pyMtdValue: number;
    pyMtdUnits: number;
    lmValue: number; // PMTD (previous month TO-DATE) — the LM comparator
    lmUnits: number;
    pfmValue: number; // PFM (previous FULL month)
    pfmUnits: number;
    pyFmValue: number; // PY FM (anchor month, prior year, FULL)
    pyFmUnits: number;
    maxDate: string; // latest MaxDate seen for this entity (YYYY-MM-DD)
    months: Record<string, MonthAgg>; // "YYYY-MM" → sales
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
    pfmValue: 0,
    pfmUnits: 0,
    pyFmValue: 0,
    pyFmUnits: 0,
    maxDate: "",
    months: {},
  });
  const monthBucket = (a: SalesAgg, ym: string): MonthAgg => {
    let b = a.months[ym];
    if (!b)
      a.months[ym] = b = {
        value: 0,
        units: 0,
        pyValue: 0,
        pyUnits: 0,
        complete: false,
        asOf: "",
        partialValue: 0,
        partialUnits: 0,
        partialPyValue: 0,
        partialPyUnits: 0,
      };
    return b;
  };
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
    a.pfmValue += num(r["PFM Value"]);
    a.pfmUnits += num(r["PFM Units"]);
    a.pyFmValue += num(r["PY FM Value"]);
    a.pyFmUnits += num(r["PY FM Units"]);

    // Bucket into absolute months. The SP's windows give us two months per row:
    //   • the anchor month (MaxDate's month) — still IN PROGRESS, so we bank its
    //     to-date figures (MTD, PY MTD) and its FULL prior-year total (PY FM),
    //     but NOT a full value yet (that arrives next month as PFM).
    //   • the previous month — SETTLED, whose FULL total is PFM (a whole calendar
    //     month, not day-clamped). This is what fixes the "June = 1 day" bug.
    // Banking a full previous month + a full prior-year, and never treating the
    // live month's to-date as a full month, is what makes the history correct.
    const md = String(r.MaxDate ?? "").slice(0, 10);
    if (md) {
      if (md > a.maxDate) a.maxDate = md;
      const anchorYm = ymOf(md);
      if (anchorYm) {
        const bA = monthBucket(a, anchorYm);
        bA.pyValue += num(r["PY FM Value"]);
        bA.pyUnits += num(r["PY FM Units"]);
        bA.partialValue += num(r["MTD Value"]);
        bA.partialUnits += num(r["MTD Units"]);
        bA.partialPyValue += num(r["PY MTD Value"]);
        bA.partialPyUnits += num(r["PY MTD Units"]);
        if (md > bA.asOf) bA.asOf = md;
        // (complete stays false — the anchor month has not settled.)

        const pm = prevYm(anchorYm);
        if (pm) {
          const bP = monthBucket(a, pm);
          bP.value += num(r["PFM Value"]);
          bP.units += num(r["PFM Units"]);
          bP.complete = true;
          // Its full prior-year total isn't in this row — kept from history
          // (banked as PY FM when this month was the anchor).
        }
      }
    }
  };

  const salesByChannelId = new Map<string, SalesAgg>();
  const salesByStoreId = new Map<string, SalesAgg>();
  const salesByProductId = new Map<string, SalesAgg>();
  // store×SKU combos — the finest grain, for the Sales page's "Detail" view.
  const salesByCombo = new Map<string, { agg: SalesAgg; store: ScorecardStore; product: ScorecardProduct }>();
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
    // store×SKU combo (finest grain) — only when the row resolves to both.
    if (store && product) {
      const key = `${store.id}|${product.id}`;
      let c = salesByCombo.get(key);
      if (!c) salesByCombo.set(key, (c = { agg: emptyAgg(), store, product }));
      addRow(c.agg, r);
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
      pfmValue: a.pfmValue,
      pfmUnits: a.pfmUnits,
      pyFmValue: a.pyFmValue,
      pyFmUnits: a.pyFmUnits,
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
      pfmValue: a.pfmValue,
      pfmUnits: a.pfmUnits,
      pyFmValue: a.pyFmValue,
      pyFmUnits: a.pyFmUnits,
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
      pfmValue: a.pfmValue,
      pfmUnits: a.pfmUnits,
      pyFmValue: a.pyFmValue,
      pyFmUnits: a.pyFmUnits,
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
      maxDate: a.maxDate,
      months: a.months,
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
      maxDate: a.maxDate,
      months: a.months,
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
      maxDate: a.maxDate,
      months: a.months,
    });
  }

  // Flatten store×SKU combos into Detail rows (same shape as the aggregate detail
  // rows but level "detail"; carries the live sync's month buckets too).
  const salesComboRows: SalesDetailRow[] = [];
  for (const { agg: a, store: st, product: p } of salesByCombo.values()) {
    salesComboRows.push({
      level: "detail",
      entityId: `${st.id}|${p.id}`,
      channelName: st.channelName,
      subChannel: st.subChannel || "",
      siteCode: st.siteCode || st.id,
      storeName: st.name,
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
      maxDate: a.maxDate,
      months: a.months,
    });
  }

  // Deferred write of the accumulated monthly history (pushed with the other
  // sales writes only when the sales SP actually succeeded).
  let salesHistoryWrite: ReturnType<typeof writeJson> | null = null;

  // ── Persist monthly sales history across syncs ──
  // Each sync gives us, per entity, a FULL previous month (PFM) and a FULL
  // prior-year of the anchor month (PY FM). We bank these forever so the history
  // grows: the previous month settles complete every sync, and a month's full
  // prior-year (captured while it was the anchor) is kept for when it later
  // settles. The live anchor month carries only to-date (partial) figures until
  // the following month's PFM turns it into a settled full month.
  //   Result: in August you still have June (full) + June-last-year, and July
  //   settles to its full value with the correct full prior-year.
  if (wants("sales")) {
    const monthlyHistoryKey = `${slug}/data/sales/monthly-history.json`;
    const historyIn = await readJson<Record<string, Record<string, MonthSales>>>(
      monthlyHistoryKey,
      {}
    );

    // Backfill from older period snapshots (best-effort). Pre-PFM snapshots only
    // hold to-date MTD / PY MTD, so recovered months are marked NOT complete —
    // a later PFM pass (which IS complete) always wins over them in the merge.
    for (let i = 1; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const p = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (p === period) continue;
      const oldRows = await readJson<SalesDetailRow[]>(`${slug}/data/sales/${p}/detail.json`, []);
      for (const r of oldRows) {
        const key = `${r.level}|${r.entityId}`;
        const h = (historyIn[key] ||= {});
        const py = r.pyMtdValue || 0;
        if (!h[p]) {
          h[p] = { value: r.mtdValue || 0, units: r.mtdUnits || 0, pyValue: py, pyUnits: r.pyMtdUnits || 0 };
        } else if (!(h[p].pyValue > 0) && py > 0) {
          h[p].pyValue = py;
          h[p].pyUnits = r.pyMtdUnits || 0;
        }
      }
    }

    const historyOut: Record<string, Record<string, MonthSales>> = {};
    const MAX_MONTHS = 24;
    const resolveMonths = (
      key: string,
      incoming: Record<string, MonthSales>
    ): Record<string, MonthSales> => {
      const merged: Record<string, MonthSales> = {};
      const existing = historyIn[key] || {};
      for (const [m, v] of Object.entries(existing)) merged[m] = { ...v };
      for (const [m, inc] of Object.entries(incoming)) {
        const out: MonthSales = merged[m]
          ? { ...merged[m] }
          : { value: 0, units: 0, pyValue: 0, pyUnits: 0 };

        // Full value: a SETTLED (complete) reading wins and can never be
        // overwritten by a live/partial one — this is the fix for the old bug
        // where a 1-day "MTD" clobbered a banked full month. PFM makes the
        // previous month complete on every sync.
        if (inc.complete) {
          out.value = inc.value;
          out.units = inc.units;
          out.complete = true;
        } else if (!out.complete) {
          // Neither settled → this is the live edge month (full value unknown).
          out.value = inc.value;
          out.units = inc.units;
          out.complete = false;
        } // else: keep the existing settled value untouched.

        // Full prior-year: prefer a fresh non-zero (PY FM), else keep what we banked.
        if (inc.pyValue > 0) {
          out.pyValue = inc.pyValue;
          out.pyUnits = inc.pyUnits;
        }

        // Live/partial figures describe the current edge month — always take the
        // freshest reading (ignored by the UI once the month is complete).
        if (inc.partialValue || inc.partialPyValue || inc.asOf) {
          out.partialValue = inc.partialValue;
          out.partialUnits = inc.partialUnits;
          out.partialPyValue = inc.partialPyValue;
          out.partialPyUnits = inc.partialPyUnits;
          out.asOf = inc.asOf || out.asOf;
        }

        merged[m] = out;
      }
      const capped: Record<string, MonthSales> = {};
      for (const m of Object.keys(merged).sort().reverse().slice(0, MAX_MONTHS)) capped[m] = merged[m];
      historyOut[key] = capped;
      return capped;
    };

    for (const r of salesDetailRows) {
      r.months = resolveMonths(`${r.level}|${r.entityId}`, r.months || {});
    }

    // Written below only when the sales SP succeeded (see the sales writes block).
    salesHistoryWrite = writeJson(monthlyHistoryKey, historyOut);
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
    const channelId = store
      ? channelIdByName.get(store.channelName)
      : channelIdByName.get(row.Channel);

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

  // Denominator = ranged total from the uploaded range file (by design for PnP).
  // Channels/stores/products NOT in the range file (e.g. SRC / Massmart, which
  // have phantom SPs but no PnP-style range upload) fall back to the legacy
  // stores×products universe so they still get a computable phantom %. PnP is
  // unchanged (it always has a range-file total).
  const phantomByChannel: Record<string, number> = {};
  for (const ch of channels) {
    const count = phantomCountByChannel[ch.id] || 0;
    const rangedTotal = hasRanging ? rangedTotalByChannelName[ch.name] || 0 : 0;
    const total = rangedTotal > 0 ? rangedTotal : oosTotalByChannel[ch.id] || 1;
    phantomByChannel[ch.id] = Math.round((count / total) * 1000) / 10;
  }

  const phantomByStore: Record<string, number> = {};
  for (const st of stores) {
    const count = phantomCountByStore[st.id] || 0;
    const rangedTotal = hasRanging && st.siteCode ? rangedByStoreCode[st.siteCode] || 0 : 0;
    const total = rangedTotal > 0 ? rangedTotal : oosTotalByStore[st.id] || 1;
    phantomByStore[st.id] = Math.round((count / total) * 1000) / 10;
  }

  const phantomByProduct: Record<string, number> = {};
  for (const p of products) {
    const count = phantomCountByProduct[p.id] || 0;
    const rangedTotal = hasRanging ? rangedByProductId[p.sku] || 0 : 0;
    const total = rangedTotal > 0 ? rangedTotal : oosTotalByProduct[p.id] || 1;
    phantomByProduct[p.id] = Math.round((count / total) * 1000) / 10;
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

  // ── Coverage: which entities have data, PER KPI ──
  // Row-driven: an entity is covered for a KPI only if it actually appears in
  // that KPI's source rows. So a channel whose OOS SP returns nothing shows "—"
  // (no data) rather than a false 0% / "perfect" — important because some channel
  // OOS SPs (MASSBUILD/MAKRO) currently return ~no rows due to missing SOH data
  // upstream, which is NOT genuine zero-OOS. The scores route uses coverage to
  // (a) show "—" for uncovered KPIs and (b) redistribute their points.
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

  // Merge with existing coverage: only recompute the KPIs we actually synced,
  // so a partial sync (e.g. sales-only) doesn't blank out the other KPIs'
  // coverage (which would make them show "no data" on the scorecards).
  type CoverSet = { channels: string[]; stores: string[]; products: string[] };
  const existingCoverage = await readJson<Partial<Record<"sales" | "nd" | "oos" | "phantom", CoverSet>>>(
    `${slug}/data/kpi/${period}/coverage.json`,
    {}
  );
  const emptyCover: CoverSet = { channels: [], stores: [], products: [] };
  const coverage = {
    sales: wants("sales") ? coverageFrom(salesRes.data) : existingCoverage.sales ?? emptyCover,
    nd: wants("nd") ? coverageFrom(dedupedNd) : existingCoverage.nd ?? emptyCover,
    oos: wants("oos") ? coverageFrom(oosRows) : existingCoverage.oos ?? emptyCover,
    phantom: wants("phantom") ? coverageFrom(dedupedPhantom) : existingCoverage.phantom ?? emptyCover,
  };

  // ── Write everything to blob ──
  // Coverage is always written (it was merged above). Core master data is only
  // rewritten when it was (re)fetched this run.
  const writes = [
    writeJson(`${slug}/data/kpi/${period}/coverage.json`, coverage),
  ];

  // Barcodes: "Product Barcode EA" from whichever SP returns it, keyed by SKU.
  // Own file, merged over the last one, so a partial sync never drops any. The
  // product master is applied LAST so it wins over a KPI row's barcode.
  // shortcut: a numeric SQL column loses leading zeros here; ask for it as text
  // if UPC/EAN-8 codes ever show up short.
  const barcodesKey = `${slug}/data/barcodes.json`;
  const barcodes = await readJson<Record<string, string>>(barcodesKey, {});
  let barcodeRows = 0;
  const barcodeSources: [Record<string, unknown>[], string][] = [
    [salesRes.data as unknown as Record<string, unknown>[], "Product ID"],
    [ndRes.data as unknown as Record<string, unknown>[], "Product ID"],
    [oosRes.data as unknown as Record<string, unknown>[], "Product ID"],
    [phantomRes.data as unknown as Record<string, unknown>[], "Product ID"],
    [productMasterRows, "Client Product ID"],
  ];
  for (const [rows, skuCol] of barcodeSources) {
    for (const r of rows) {
      const sku = String(r[skuCol] ?? "").trim();
      const bc = String(r["Product Barcode EA"] ?? "").trim();
      if (sku && bc) {
        barcodes[sku] = bc;
        barcodeRows++;
      }
    }
  }
  if (barcodeRows) writes.push(writeJson(barcodesKey, barcodes));
  if (coreFetched) {
    writes.push(
      writeJson(`${slug}/data/channels.json`, channels),
      writeJson(`${slug}/data/stores.json`, stores),
      writeJson(`${slug}/data/products.json`, products),
      writeJson(`${slug}/data/brands.json`, brands)
    );
  }

  // Only overwrite Sales data when the SP succeeded (a failed call must not wipe
  // previously-synced sales with an empty set).
  if (salesOk) {
    writes.push(
      writeJson(`${slug}/data/sales/${period}/channels.json`, salesChannels),
      writeJson(`${slug}/data/sales/${period}/stores.json`, salesStores),
      writeJson(`${slug}/data/sales/${period}/products.json`, salesProducts),
      writeJson(`${slug}/data/sales/${period}/detail.json`, salesDetailRows),
      writeJson(`${slug}/data/sales/${period}/combos.json`, salesComboRows)
    );
    if (salesHistoryWrite) writes.push(salesHistoryWrite);
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

  const totalMs = Date.now() - syncStart;
  // Append this run to the rolling sync log (last 50 runs). Each entry records
  // per-query duration + row count + ok flag, so we can see which SP is slow.
  const logEntry = {
    at: now.toISOString(),
    source,
    parts,
    totalMs,
    queries: timings,
  };
  const syncLog = await readJson<unknown[]>(`${slug}/data/sync-log.json`, []);
  syncLog.unshift(logEntry);
  await writeJson(`${slug}/data/sync-log.json`, syncLog.slice(0, 50));

  // Save sync metadata
  const syncMeta = await readJson<Record<string, unknown>>(`${slug}/data/sync-meta.json`, {});
  syncMeta.lastSync = now.toISOString();
  syncMeta.lastSyncSource = source;
  if (source === "cron") syncMeta.lastAutoSync = now.toISOString();
  syncMeta.lastPeriod = period;
  syncMeta.lastSyncDurationMs = totalMs;
  syncMeta.lastSyncQueryTimings = timings;
  syncMeta.lastSyncParts = parts;
  // Only touch the fields for parts we actually synced — a partial sync must not
  // clobber the other parts' recorded counts / ok-flags.
  if (coreFetched) {
    syncMeta.channelCount = channels.length;
    syncMeta.storeCount = stores.length;
    syncMeta.productCount = products.length;
    syncMeta.brandCount = brands.length;
  }
  if (wants("sales")) {
    if (salesOk) {
      syncMeta.salesChannelCount = salesChannels.length;
      syncMeta.salesStoreCount = salesStores.length;
      syncMeta.salesProductCount = salesProducts.length;
      syncMeta.salesDetailCount = salesDetailRows.length;
      syncMeta.salesRowCount = salesRes.data.length;
    }
    if (salesOk) {
      syncMeta.salesMonths = [
        ...new Set(salesDetailRows.flatMap((r) => Object.keys(r.months || {}))),
      ]
        .sort()
        .reverse();
    }
    syncMeta.salesOk = salesOk;
    syncMeta.salesPnpOk = salesPnpOk;
    syncMeta.salesSparOk = salesSparOk;
    syncMeta.salesMassbuildOk = okFlags.salesMass;
    syncMeta.salesGameOk = okFlags.salesGame;
    syncMeta.salesMakroOk = okFlags.salesMakro;
    syncMeta.salesSrcOk = okFlags.salesSrc;
    syncMeta.salesError = salesError;
  }
  if (wants("oos")) {
    if (oosOk) syncMeta.oosDetailCount = oosDetailRows.length;
    syncMeta.oosOk = oosOk;
    syncMeta.oosPnpOk = okFlags.oosPnp;
    syncMeta.oosMassbuildOk = okFlags.oosMass;
    syncMeta.oosGameOk = okFlags.oosGame;
    syncMeta.oosMakroOk = okFlags.oosMakro;
    syncMeta.oosSrcOk = okFlags.oosSrc;
    syncMeta.oosError = oosError;
  }
  if (wants("nd")) {
    if (ndOk) syncMeta.ndDetailCount = ndDetailRows.length;
    syncMeta.ndOk = ndOk;
    syncMeta.ndPnpOk = ndPnpOk;
    syncMeta.ndSparOk = ndSparOk;
    syncMeta.ndMassbuildOk = okFlags.ndMass;
    syncMeta.ndGameOk = okFlags.ndGame;
    syncMeta.ndMakroOk = okFlags.ndMakro;
    syncMeta.ndSrcOk = okFlags.ndSrc;
    syncMeta.ndError = ndError;
    // Record the scan window actually used so the ND page can show it.
    if (ndOk) syncMeta.ndRollingDays = ndRollingDays;
  }
  if (wants("phantom")) {
    if (phantomOk) syncMeta.phantomDetailCount = phantomRows.length;
    syncMeta.phantomOk = phantomOk;
    syncMeta.phantomPnpOk = okFlags.phantomPnp;
    syncMeta.phantomSrcOk = okFlags.phantomSrc;
    syncMeta.phantomMassbuildOk = okFlags.phantomMass;
    syncMeta.phantomGameOk = okFlags.phantomGame;
    syncMeta.phantomMakroOk = okFlags.phantomMakro;
    syncMeta.phantomError = phantomError;
    // Record the lookback window actually used so the Phantom page can show it.
    if (phantomOk) syncMeta.phantomDays = phantomDays;
    syncMeta.phantomBasis = hasRanging ? "ranged (range file)" : "legacy (stores×products)";
    syncMeta.rangedChannels = ranging.map((r) => r.channel);
  }
  syncMeta.sqlClient = client;
  await writeJson(`${slug}/data/sync-meta.json`, syncMeta);

  const skipped = "(skipped)";
  return {
    period,
    parts,
    phantomSkipped: wants("phantom") && !phantomOk,
    phantomError: phantomOk ? undefined : phantomError,
    counts: {
      channels: channels.length,
      stores: stores.length,
      products: products.length,
      brands: brands.length,
      salesChannels: !wants("sales") ? skipped : salesOk ? salesChannels.length : "(unchanged — SP failed)",
      salesStores: !wants("sales") ? skipped : salesOk ? salesStores.length : "(unchanged — SP failed)",
      salesProducts: !wants("sales") ? skipped : salesOk ? salesProducts.length : "(unchanged — SP failed)",
      salesDetail: !wants("sales") ? skipped : salesOk ? salesDetailRows.length : "(unchanged — SP failed)",
      oosDetail: !wants("oos") ? skipped : oosOk ? oosDetailRows.length : "(unchanged — SP failed)",
      ndDetail: !wants("nd") ? skipped : ndOk ? ndDetailRows.length : "(unchanged — SP failed)",
      phantomDetail: !wants("phantom") ? skipped : phantomOk ? phantomRows.length : "(unchanged — SP failed)",
    },
  };
}

export interface MonthBackfillResult {
  processed: string[]; // months banked this run (YYYY-MM)
  skipped: string[]; // months already banked (skipped)
  pending: string[]; // months still to do (hit the per-run cap / time budget)
  errors: Record<string, string>; // "<ym>:<channel>" → message
}

/**
 * Backfill correct FULL-MONTH sales (value AND prior-year) for COMPLETED months.
 *
 * The normal sync's latest-data pull can give a completed month's full value
 * (via PFM), but NOT its full prior-year — a July-anchored row's prior-year
 * field is July-last-year, never June-last-year. The only correct source for a
 * past month's prior-year is an @YearMonth pull of that month: anchored at the
 * month-end, the SP's MTD becomes the full month and PY MTD the full same-month-
 * last-year (verified live: GAME 2026-06 → MTD R225,421, PY MTD R249,918).
 *
 * Completed months are immutable, so each is pulled ONCE and banked forever
 * (tracked in month-backfill.json). Runs newest-first, capped per run + time-
 * budgeted, banking incrementally so it's resumable. It is its OWN sync part —
 * never folded into the normal sync — so these extra heavy pulls can't drag the
 * routine sync back over the 300s timeout.
 */
export async function backfillSalesMonths(
  slug: string,
  options: { maxMonths?: number; force?: boolean } = {}
): Promise<MonthBackfillResult> {
  const config = await getTenantConfig(slug);
  if (!config?.sqlClientName) {
    throw new Error(
      `No SQL client mapped for tenant "${slug}". Set it in Super Admin > Edit Client.`
    );
  }
  const client = config.sqlClientName;

  const num = (v: unknown): number => {
    const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
    return Number.isFinite(n) ? n : 0;
  };

  // Master data + lookup maps (reused from the last core sync).
  const [channels, stores, products] = await Promise.all([
    readJson<ScorecardChannel[]>(`${slug}/data/channels.json`, []),
    readJson<ScorecardStore[]>(`${slug}/data/stores.json`, []),
    readJson<ScorecardProduct[]>(`${slug}/data/products.json`, []),
  ]);
  const channelIdByName = new Map<string, string>(
    channels.map((c) => [c.name, c.id] as [string, string])
  );
  const storeBySiteCode = new Map<string, ScorecardStore>(
    stores.filter((s) => s.siteCode).map((s) => [s.siteCode as string, s] as [string, ScorecardStore])
  );
  const productBySku = new Map<string, ScorecardProduct>(
    products.map((p) => [p.sku, p] as [string, ScorecardProduct])
  );

  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Candidate completed months: the trailing calendar months strictly before the
  // current one, newest first (the recent months are what users look at).
  const lookback = 13;
  const candidates: string[] = [];
  for (let i = 1; i <= lookback; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    candidates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const markerKey = `${slug}/data/sales/month-backfill.json`;
  const doneMarker = await readJson<Record<string, { at: string; ok: boolean }>>(markerKey, {});
  const force = !!options.force;
  const maxMonths = Math.max(1, options.maxMonths ?? 2);

  const toDo = candidates.filter((m) => force || !doneMarker[m]?.ok);
  const skipped = candidates.filter((m) => !force && doneMarker[m]?.ok);

  const monthlyHistoryKey = `${slug}/data/sales/monthly-history.json`;
  const history = await readJson<Record<string, Record<string, MonthSales>>>(monthlyHistoryKey, {});

  const processed: string[] = [];
  const errors: Record<string, string> = {};
  const start = Date.now();
  const BUDGET_MS = 220_000; // stay well inside the route's 300s maxDuration

  const pull = async (
    fn: () => Promise<{ data: SqlSalesPnpRow[] }>,
    label: string
  ): Promise<SqlSalesPnpRow[]> => {
    try {
      return (await fn()).data;
    } catch (e) {
      errors[label] = e instanceof Error ? e.message : String(e);
      return [];
    }
  };

  for (const ym of toDo) {
    if (processed.length >= maxMonths) break;
    if (Date.now() - start > BUDGET_MS) break;

    // Pull every channel for this month, anchored at its month-end. 5 of the 6
    // SPs live on pool2 (max 5 conns) + SPAR on the primary pool → exactly fills
    // pool2 without queueing.
    const [pnp, spar, mass, game, makro, src] = await Promise.all([
      pull(() => getSalesPnp(client, ym), `${ym}:pnp`),
      pull(() => getSparSales(client, ym), `${ym}:spar`),
      pull(() => getMassbuildSales(client, ym), `${ym}:massbuild`),
      pull(() => getGameSales(client, ym), `${ym}:game`),
      pull(() => getMakroSales(client, ym), `${ym}:makro`),
      pull(() => getSrcSales(client, ym), `${ym}:src`),
    ]);
    const rows = [...pnp, ...spar, ...mass, ...game, ...makro, ...src];
    // Nothing came back (all channels errored) — leave unmarked so a later run
    // retries rather than banking an empty month.
    if (!rows.length) continue;

    // Aggregate the month per entity. Anchor is the month-end, so MTD = the full
    // month and PY MTD = the full same-month-last-year.
    interface Agg { value: number; units: number; pyValue: number; pyUnits: number }
    const byChannel = new Map<string, Agg>();
    const byStore = new Map<string, Agg>();
    const byProduct = new Map<string, Agg>();
    const add = (map: Map<string, Agg>, id: string, r: SqlSalesPnpRow) => {
      let a = map.get(id);
      if (!a) map.set(id, (a = { value: 0, units: 0, pyValue: 0, pyUnits: 0 }));
      a.value += num(r["MTD Value"]);
      a.units += num(r["MTD Units"]);
      a.pyValue += num(r["PY MTD Value"]);
      a.pyUnits += num(r["PY MTD Units"]);
    };
    for (const r of rows) {
      const store = storeBySiteCode.get(r.SiteCode);
      const product = productBySku.get(r["Product ID"]);
      const channelId = store
        ? channelIdByName.get(store.channelName)
        : channelIdByName.get(r.Channel);
      if (channelId) add(byChannel, channelId, r);
      if (store) add(byStore, store.id, r);
      if (product) add(byProduct, product.id, r);
    }

    // Bank as the authoritative settled month (full value + full prior-year).
    const bank = (level: string, id: string, a: Agg) => {
      const key = `${level}|${id}`;
      const h = (history[key] ||= {});
      h[ym] = {
        value: a.value,
        units: a.units,
        pyValue: a.pyValue,
        pyUnits: a.pyUnits,
        complete: true,
        pyComplete: true,
      };
    };
    for (const [id, a] of byChannel) bank("channel", id, a);
    for (const [id, a] of byStore) bank("store", id, a);
    for (const [id, a] of byProduct) bank("product", id, a);

    doneMarker[ym] = { at: now.toISOString(), ok: true };
    processed.push(ym);
    // Persist after each month so progress survives a timeout (next run resumes).
    await Promise.all([
      writeJson(monthlyHistoryKey, history),
      writeJson(markerKey, doneMarker),
    ]);
  }

  // Fold the freshly-banked months into the current period's detail rows so the
  // Sales page (which reads detail.json) reflects them without a full sales sync.
  if (processed.length) {
    const detailKey = `${slug}/data/sales/${period}/detail.json`;
    const detail = await readJson<SalesDetailRow[]>(detailKey, []);
    if (detail.length) {
      for (const r of detail) {
        const h = history[`${r.level}|${r.entityId}`];
        if (!h) continue;
        r.months = { ...(r.months || {}) };
        for (const m of processed) if (h[m]) r.months[m] = h[m];
      }
      await writeJson(detailKey, detail);
    }
  }

  return {
    processed,
    skipped,
    pending: toDo.filter((m) => !processed.includes(m)),
    errors,
  };
}
