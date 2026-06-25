/* ──────────────────────────────────────────────────────────────
   SQL Proxy Client — calls the Railway-hosted proxy
   ────────────────────────────────────────────────────────────── */

const PROXY_URL = process.env.SQL_PROXY_URL || "";
const PROXY_KEY = process.env.SQL_PROXY_API_KEY || "";

export interface ProxyResponse<T = Record<string, unknown>> {
  data: T[];
  count: number;
}

export async function sqlQuery<T = Record<string, unknown>>(
  query: string,
  params: Record<string, unknown> = {}
): Promise<ProxyResponse<T>> {
  if (!PROXY_URL || !PROXY_KEY) {
    throw new Error("SQL_PROXY_URL or SQL_PROXY_API_KEY not configured");
  }

  const res = await fetch(`${PROXY_URL}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": PROXY_KEY,
    },
    body: JSON.stringify({ query, params }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SQL proxy error (${res.status}): ${body}`);
  }

  return res.json() as Promise<ProxyResponse<T>>;
}

/**
 * Lists the named queries currently registered on the proxy (GET /query).
 * Used by the SQL Reference drift detector to flag when lib/sqlRegistry.ts is
 * out of sync with what's actually deployed.
 */
export async function listProxyQueries(): Promise<string[]> {
  if (!PROXY_URL || !PROXY_KEY) {
    throw new Error("SQL_PROXY_URL or SQL_PROXY_API_KEY not configured");
  }
  const res = await fetch(`${PROXY_URL}/query`, {
    headers: { "x-api-key": PROXY_KEY },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SQL proxy error (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { queries?: { name: string }[] };
  return Array.isArray(json.queries) ? json.queries.map((q) => q.name) : [];
}

// ── Typed helpers for scorecard queries ──────────────────────────────────────

export interface SqlClient {
  ClientID: number;
  Client: string;
  "KAM Name": string | null;
  "KAM Email": string | null;
  Status: string;
}

// Actual columns returned by GetClientRetailChannels (Channel name only).
export interface SqlChannel {
  Channel: string;
}

// Actual columns returned by GetClientRetailSites. SiteID is the site code
// string (e.g. "PNP-HC14"); the display name is "Site Name" (with a space).
export interface SqlStore {
  SiteID: string;
  "Site Name": string;
  Channel: string;
  SubChannel: string | null;
  Province: string | null;
  Status?: string | null;
  Country?: string | null;
  "Site Tags"?: string | null;
}

// Actual columns returned by GetDataForPowerBI_Products. The product key is
// "Client Product ID" (there is no numeric ID column).
export interface SqlProduct {
  "Client Product ID": string;
  "Product Brand": string | null;
  "Product Category": string | null;
  "Product Sub Category": string | null;
  "Product Description": string | null;
  "Product Status": string | null;
}

export interface SqlNdRow {
  Channel?: string;
  SiteCode?: string;
  SiteName?: string;
  ProductID?: string;
  "Product Description"?: string;
  "Product Brand"?: string;
  rangedStores?: number;
  rangedProducts?: number;
  totalStores?: number;
  totalProducts?: number;
  ndPercent: number;
}

export async function listClients() {
  return sqlQuery<SqlClient>("list_clients");
}

export async function getClientChannels(client: string) {
  return sqlQuery<SqlChannel>("client_channels", { client });
}

export async function getClientStores(client: string) {
  return sqlQuery<SqlStore>("client_stores", { client });
}

export async function getClientProducts(client: string) {
  return sqlQuery<SqlProduct>("client_products", { client });
}

export async function getNdByChannel(client: string) {
  return sqlQuery<SqlNdRow>("nd_by_channel", { client });
}

export async function getNdByStore(client: string) {
  return sqlQuery<SqlNdRow>("nd_by_store", { client });
}

export async function getNdByProduct(client: string) {
  return sqlQuery<SqlNdRow>("nd_by_product", { client });
}

// ── Sales, OOS, Phantom helpers ─────────────────────────────────────────────

export interface SqlSalesRow {
  Channel?: string;
  ChannelDataID?: number;
  SiteID?: number;
  SiteCode?: string;
  SiteName?: string;
  ProductID?: number;
  SKU?: string;
  "Product Description"?: string;
  "Product Brand"?: string;
  YTD_Value: number;
  YTD_Units: number;
  SPLY_Value: number;
  SPLY_Units: number;
}

export interface SqlOosDetailRow {
  SiteID: number;
  SiteCode: string;
  SiteName: string;
  Channel: string;
  SubChannel: string | null;
  ProductID: number;
  SKU: string;
  "Product Description": string;
  "Product Brand": string;
  SOH: number;
  LatestDate: string;
}

export interface SqlPhantomDetailRow {
  SiteID: number;
  SiteCode: string;
  SiteName: string;
  Channel: string;
  SubChannel: string | null;
  ProductID: number;
  SKU: string;
  "Product Description": string;
  "Product Brand": string;
  SOH_Now: number;
  SOH_Past: number;
  PeriodSales: number;
}

export interface SqlBrandRow {
  Brand: string;
}

export async function getClientBrands(client: string) {
  return sqlQuery<SqlBrandRow>("client_brands", { client });
}

export async function getYtdSalesByChannel(client: string) {
  return sqlQuery<SqlSalesRow>("ytd_sales_by_channel", { client });
}

export async function getYtdSalesByStore(client: string) {
  return sqlQuery<SqlSalesRow>("ytd_sales_by_store", { client });
}

export async function getYtdSalesByProduct(client: string) {
  return sqlQuery<SqlSalesRow>("ytd_sales_by_product", { client });
}

export async function getOosDetail(client: string) {
  return sqlQuery<SqlOosDetailRow>("oos_detail", { client });
}

export async function getPhantomDetail(client: string, lookbackDays = 60) {
  return sqlQuery<SqlPhantomDetailRow>("phantom_detail", { client, lookbackDays });
}

// Rows returned by the GetPhantomStock_PNP stored procedure (PnP channel only).
export interface SqlPhantomStockPnpRow {
  Date: string;
  "Date Last Sold": string | null;
  SiteCode: string;
  SiteName: string;
  Channel: string;
  SubChannel: string | null;
  Province: string | null;
  ChannelArticle: string;
  "Product ID": string;
  "Product Description": string;
  "Product Status": string | null;
  "Channel Product Status": string | null;
  "Site Article Status": string | null;
  "Ranging Status": string | null;
  LatestSOH: number;
}

export async function getPhantomStockPnp(client: string, phantomDays = 60) {
  return sqlQuery<SqlPhantomStockPnpRow>("phantom_stock_pnp", { client, phantomDays });
}
