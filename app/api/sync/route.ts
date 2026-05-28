import { NextRequest } from "next/server";
import { requireRole, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { getTenantConfig } from "@/lib/getTenantConfig";
import { writeJson, readJson } from "@/lib/blob";
import {
  getClientChannels,
  getClientStores,
  getClientProducts,
  getClientBrands,
  getYtdSalesByChannel,
  getYtdSalesByStore,
  getYtdSalesByProduct,
  getOosDetail,
  getPhantomDetail,
} from "@/lib/sqlProxy";
import type {
  ScorecardChannel,
  ScorecardStore,
  ScorecardProduct,
  SalesData,
} from "@/lib/types";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    requireRole(req, "admin");
    const slug = await getTenantSlug();
    const config = await getTenantConfig(slug);

    if (!config?.sqlClientName) {
      return Response.json(
        { error: "No SQL client mapped for this tenant. Set it in Super Admin > Edit Client." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const client = config.sqlClientName;
    const lookbackDays = config.phantomLookbackDays ?? 60;
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // ── Batch 1: Core data (channels, stores, products) ──
    const [channelsRes, storesRes, productsRes] =
      await Promise.all([
        getClientChannels(client),
        getClientStores(client),
        getClientProducts(client),
      ]);

    // Transform channels
    const channels: ScorecardChannel[] = channelsRes.data.map((ch) => ({
      id: String(ch.ChannelDataID),
      name: ch.Channel,
    }));

    // Transform stores
    const stores: ScorecardStore[] = storesRes.data.map((st) => ({
      id: String(st.SiteID),
      name: st.SiteName,
      channelId: st.Channel,
      channelName: st.Channel,
      region: st.Province || undefined,
    }));

    // Transform products
    const products: ScorecardProduct[] = productsRes.data.map((p) => ({
      id: String(p.ID),
      name: p["Product Description"] || p["Client Product ID"],
      sku: p["Client Product ID"],
      brand: p["Product Brand"] || "Unknown",
      category: p["Product Category"] || undefined,
    }));

    // ── Batch 2: Sales, OOS, Phantom, Brands ──
    const [
      salesChannelRes,
      salesStoreRes,
      salesProductRes,
      oosRes,
      phantomRes,
      brandsRes,
    ] = await Promise.all([
      getYtdSalesByChannel(client).catch(() => ({ data: [], count: 0 })),
      getYtdSalesByStore(client).catch(() => ({ data: [], count: 0 })),
      getYtdSalesByProduct(client).catch(() => ({ data: [], count: 0 })),
      getOosDetail(client).catch(() => ({ data: [], count: 0 })),
      getPhantomDetail(client, lookbackDays).catch(() => ({ data: [], count: 0 })),
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

    // ── Aggregate OOS: count OOS items per entity, divide by total items ──
    const oosRows = oosRes.data;
    // OOS by channel: (OOS product-store combos in channel) / (total product-store combos in channel)
    // We use total active products * stores per channel as denominator
    const channelStoreCounts: Record<string, Set<string>> = {};
    const channelProductCounts: Record<string, Set<string>> = {};
    for (const st of stores) {
      const key = st.channelName;
      if (!channelStoreCounts[key]) channelStoreCounts[key] = new Set();
      channelStoreCounts[key].add(st.id);
    }
    // Count OOS per channel/store/product
    const oosCountByChannel: Record<string, number> = {};
    const oosTotalByChannel: Record<string, number> = {};
    const oosCountByStore: Record<string, number> = {};
    const oosTotalByStore: Record<string, number> = {};
    const oosCountByProduct: Record<string, number> = {};
    const oosTotalByProduct: Record<string, number> = {};

    // Build total ranged combos from ND data for better denominators
    // For OOS %, use: OOS count / total active product-store combos
    for (const row of oosRows) {
      // By channel
      const ch = channels.find((c) => c.name === row.Channel);
      if (ch) {
        oosCountByChannel[ch.id] = (oosCountByChannel[ch.id] || 0) + 1;
      }
      // By store
      const storeId = String(row.SiteID);
      oosCountByStore[storeId] = (oosCountByStore[storeId] || 0) + 1;
      // By product
      const prod = products.find((p) => p.sku === row.SKU);
      if (prod) {
        oosCountByProduct[prod.id] = (oosCountByProduct[prod.id] || 0) + 1;
      }
    }

    // Build denominators: total active products per channel/store, total stores per product
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

    // Calculate OOS % maps
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

    // ── Aggregate Phantom: same pattern ──
    const phantomRows = phantomRes.data;
    const phantomCountByChannel: Record<string, number> = {};
    const phantomCountByStore: Record<string, number> = {};
    const phantomCountByProduct: Record<string, number> = {};

    for (const row of phantomRows) {
      const ch = channels.find((c) => c.name === row.Channel);
      if (ch) {
        phantomCountByChannel[ch.id] = (phantomCountByChannel[ch.id] || 0) + 1;
      }
      const storeId = String(row.SiteID);
      phantomCountByStore[storeId] = (phantomCountByStore[storeId] || 0) + 1;
      const prod = products.find((p) => p.sku === row.SKU);
      if (prod) {
        phantomCountByProduct[prod.id] = (phantomCountByProduct[prod.id] || 0) + 1;
      }
    }

    const phantomByChannel: Record<string, number> = {};
    for (const ch of channels) {
      const count = phantomCountByChannel[ch.id] || 0;
      const total = oosTotalByChannel[ch.id] || 1; // same denominator
      phantomByChannel[ch.id] = Math.round((count / total) * 1000) / 10;
    }

    const phantomByStore: Record<string, number> = {};
    for (const st of stores) {
      const count = phantomCountByStore[st.id] || 0;
      const total = oosTotalByStore[st.id] || 1;
      phantomByStore[st.id] = Math.round((count / total) * 1000) / 10;
    }

    const phantomByProduct: Record<string, number> = {};
    for (const p of products) {
      const count = phantomCountByProduct[p.id] || 0;
      const total = oosTotalByProduct[p.id] || 1;
      phantomByProduct[p.id] = Math.round((count / total) * 1000) / 10;
    }

    // Extract brand list
    const brands: string[] = brandsRes.data.map((b) => b.Brand);

    // ── Write everything to blob ──
    await Promise.all([
      // Core
      writeJson(`${slug}/data/channels.json`, channels),
      writeJson(`${slug}/data/stores.json`, stores),
      writeJson(`${slug}/data/products.json`, products),
      // Sales
      writeJson(`${slug}/data/sales/${period}/channels.json`, salesChannels),
      writeJson(`${slug}/data/sales/${period}/stores.json`, salesStores),
      writeJson(`${slug}/data/sales/${period}/products.json`, salesProducts),
      // OOS
      writeJson(`${slug}/data/kpi/${period}/oos-channel.json`, oosByChannel),
      writeJson(`${slug}/data/kpi/${period}/oos-store.json`, oosByStore),
      writeJson(`${slug}/data/kpi/${period}/oos-product.json`, oosByProduct),
      // Phantom
      writeJson(`${slug}/data/kpi/${period}/phantom-channel.json`, phantomByChannel),
      writeJson(`${slug}/data/kpi/${period}/phantom-store.json`, phantomByStore),
      writeJson(`${slug}/data/kpi/${period}/phantom-product.json`, phantomByProduct),
      // Brands
      writeJson(`${slug}/data/brands.json`, brands),
      // Raw detail (for future drill-down)
      writeJson(`${slug}/data/oos/${period}/detail.json`, oosRows),
      writeJson(`${slug}/data/phantom/${period}/detail.json`, phantomRows),
    ]);

    // Save sync metadata
    const syncMeta = await readJson<Record<string, unknown>>(`${slug}/data/sync-meta.json`, {});
    syncMeta.lastSync = now.toISOString();
    syncMeta.lastPeriod = period;
    syncMeta.channelCount = channels.length;
    syncMeta.storeCount = stores.length;
    syncMeta.productCount = products.length;
    syncMeta.brandCount = brands.length;
    syncMeta.salesChannelCount = salesChannels.length;
    syncMeta.salesStoreCount = salesStores.length;
    syncMeta.salesProductCount = salesProducts.length;
    syncMeta.oosDetailCount = oosRows.length;
    syncMeta.phantomDetailCount = phantomRows.length;
    syncMeta.sqlClient = client;
    await writeJson(`${slug}/data/sync-meta.json`, syncMeta);

    return Response.json(
      {
        success: true,
        period,
        counts: {
          channels: channels.length,
          stores: stores.length,
          products: products.length,
          brands: brands.length,
          salesChannels: salesChannels.length,
          salesStores: salesStores.length,
          salesProducts: salesProducts.length,
          oosDetail: oosRows.length,
          phantomDetail: phantomRows.length,
        },
      },
      { headers: noCacheHeaders() }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}

// GET returns sync status
export async function GET(req: NextRequest) {
  try {
    requireRole(req, "admin");
    const slug = await getTenantSlug();
    const syncMeta = await readJson<Record<string, unknown>>(`${slug}/data/sync-meta.json`, {});

    return Response.json(syncMeta, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
