import { NextRequest } from "next/server";
import { requireRole, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { getTenantConfig } from "@/lib/getTenantConfig";
import { writeJson, readJson } from "@/lib/blob";
import {
  getClientChannels,
  getClientStores,
  getClientProducts,
  getNdByChannel,
  getNdByStore,
  getNdByProduct,
} from "@/lib/sqlProxy";
import type { ScorecardChannel, ScorecardStore, ScorecardProduct } from "@/lib/types";

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
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Fetch all data from SQL in parallel
    const [channelsRes, storesRes, productsRes, ndChannelRes, ndStoreRes, ndProductRes] =
      await Promise.all([
        getClientChannels(client),
        getClientStores(client),
        getClientProducts(client),
        getNdByChannel(client),
        getNdByStore(client),
        getNdByProduct(client),
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
      channelId: st.Channel, // matches channel name, will resolve via channels
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

    // Build ND lookup maps (entityId → ndPercent 0-100)
    const ndByChannel: Record<string, number> = {};
    for (const row of ndChannelRes.data) {
      // Find matching channel by name
      const ch = channels.find((c) => c.name === row.Channel);
      if (ch) ndByChannel[ch.id] = Math.round(row.ndPercent * 10) / 10;
    }

    const ndByStore: Record<string, number> = {};
    for (const row of ndStoreRes.data) {
      // Find matching store by SiteCode
      const st = stores.find((s) => s.id === String(storesRes.data.find((x) => x.SiteCode === row.SiteCode)?.SiteID));
      if (st) ndByStore[st.id] = Math.round(row.ndPercent * 10) / 10;
    }

    const ndByProduct: Record<string, number> = {};
    for (const row of ndProductRes.data) {
      // Find matching product by ProductID (Client Product ID)
      const p = products.find((x) => x.sku === row.ProductID);
      if (p) ndByProduct[p.id] = Math.round(row.ndPercent * 10) / 10;
    }

    // Write to blob storage
    await Promise.all([
      writeJson(`${slug}/data/channels.json`, channels),
      writeJson(`${slug}/data/stores.json`, stores),
      writeJson(`${slug}/data/products.json`, products),
      writeJson(`${slug}/data/kpi/${period}/nd-channel.json`, ndByChannel),
      writeJson(`${slug}/data/kpi/${period}/nd-store.json`, ndByStore),
      writeJson(`${slug}/data/kpi/${period}/nd-product.json`, ndByProduct),
    ]);

    // Save sync metadata
    const syncMeta = await readJson<Record<string, unknown>>(`${slug}/data/sync-meta.json`, {});
    syncMeta.lastSync = now.toISOString();
    syncMeta.lastPeriod = period;
    syncMeta.channelCount = channels.length;
    syncMeta.storeCount = stores.length;
    syncMeta.productCount = products.length;
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
          ndChannelEntries: Object.keys(ndByChannel).length,
          ndStoreEntries: Object.keys(ndByStore).length,
          ndProductEntries: Object.keys(ndByProduct).length,
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
