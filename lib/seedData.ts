import type {
  ScorecardChannel,
  ScorecardStore,
  ScorecardProduct,
  SalesData,
} from "./types";
import { writeJson } from "./blob";
import { v4 as uuid } from "uuid";

const CHANNEL_NAMES = [
  "Pick n Pay",
  "Checkers",
  "Shoprite",
  "Spar",
  "Woolworths",
  "Game",
  "Makro",
  "Clicks",
];

const REGIONS = [
  "Gauteng",
  "Western Cape",
  "KwaZulu-Natal",
  "Eastern Cape",
  "Free State",
];

const BRANDS = ["Brand A", "Brand B", "Brand C"];
const CATEGORIES = ["Electronics", "Appliances", "Home Care", "Personal Care"];

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateChannels(): ScorecardChannel[] {
  return CHANNEL_NAMES.map((name) => ({
    id: uuid(),
    name,
  }));
}

export function generateStores(channels: ScorecardChannel[]): ScorecardStore[] {
  const stores: ScorecardStore[] = [];
  for (const ch of channels) {
    const count = rand(3, 8);
    for (let i = 1; i <= count; i++) {
      const region = pickRandom(REGIONS);
      stores.push({
        id: uuid(),
        name: `${ch.name} ${region} #${i}`,
        channelId: ch.id,
        channelName: ch.name,
        region,
      });
    }
  }
  return stores;
}

export function generateProducts(): ScorecardProduct[] {
  const products: ScorecardProduct[] = [];
  const names = [
    "Widget Pro",
    "Widget Lite",
    "Gizmo X",
    "Gizmo Y",
    "UltraClean 500",
    "UltraClean 250",
    "PowerMax 3000",
    "PowerMax 1500",
    "SmartHome Hub",
    "SmartHome Mini",
  ];

  for (const name of names) {
    products.push({
      id: uuid(),
      name,
      sku: `SKU-${rand(10000, 99999)}`,
      brand: pickRandom(BRANDS),
      category: pickRandom(CATEGORIES),
    });
  }
  return products;
}

export function generateSalesData(
  entityIds: string[],
  entityType: SalesData["entityType"],
  period: string
): SalesData[] {
  return entityIds.map((id) => {
    const target = rand(50000, 500000);
    const salesValue = rand(
      Math.floor(target * 0.5),
      Math.floor(target * 1.3)
    );
    const prevValue = rand(
      Math.floor(target * 0.6),
      Math.floor(target * 1.1)
    );

    return {
      entityId: id,
      entityType,
      period,
      salesValue,
      salesUnits: rand(100, 5000),
      previousPeriodSalesValue: prevValue,
      previousPeriodSalesUnits: rand(80, 4500),
      target,
    };
  });
}

export async function seedTenantData(tenantSlug: string): Promise<{
  channels: number;
  stores: number;
  products: number;
}> {
  const channels = generateChannels();
  const stores = generateStores(channels);
  const products = generateProducts();

  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const channelSales = generateSalesData(
    channels.map((c) => c.id),
    "channel",
    period
  );
  const storeSales = generateSalesData(
    stores.map((s) => s.id),
    "store",
    period
  );
  const productSales = generateSalesData(
    products.map((p) => p.id),
    "product",
    period
  );

  await Promise.all([
    writeJson(`${tenantSlug}/data/channels.json`, channels),
    writeJson(`${tenantSlug}/data/stores.json`, stores),
    writeJson(`${tenantSlug}/data/products.json`, products),
    writeJson(`${tenantSlug}/data/sales/${period}/channels.json`, channelSales),
    writeJson(`${tenantSlug}/data/sales/${period}/stores.json`, storeSales),
    writeJson(`${tenantSlug}/data/sales/${period}/products.json`, productSales),
  ]);

  return {
    channels: channels.length,
    stores: stores.length,
    products: products.length,
  };
}
