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

// ── Typed helpers for scorecard queries ──────────────────────────────────────

export interface SqlClient {
  ClientID: number;
  Client: string;
  "KAM Name": string | null;
  "KAM Email": string | null;
  Status: string;
}

export interface SqlChannel {
  Channel: string;
  ChannelDataID: number;
}

export interface SqlStore {
  SiteID: number;
  SiteCode: string;
  SiteName: string;
  Channel: string;
  Province: string | null;
  TownCity: string | null;
}

export interface SqlProduct {
  ID: number;
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
