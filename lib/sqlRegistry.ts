/* ──────────────────────────────────────────────────────────────
   SQL Registry — human-readable catalogue of every named query and
   stored procedure the portal calls through the Railway SQL proxy.

   This is a curated reference for the super-admin "SQL Reference" page.
   It is documentation only — it does NOT execute anything. When a query
   or SP changes on the proxy (aria-sql-proxy/src/routes/query.ts), update
   the matching entry here so the catalogue stays accurate.
   ────────────────────────────────────────────────────────────── */

export type SqlEntryKind = "query" | "stored_procedure";
export type SqlEntryStatus = "live" | "building" | "planned";

export interface SqlRegistryEntry {
  /** Named-query key sent to the proxy ({ query: "<name>" }). */
  name: string;
  /** Friendly label for display. */
  label: string;
  /** Module/grouping for the page. */
  category:
    | "Core master data"
    | "Sales"
    | "Numerical Distribution"
    | "Out of Stocks"
    | "Phantom Stock"
    | "Utility / diagnostics";
  kind: SqlEntryKind;
  status: SqlEntryStatus;
  /** What it returns / why the portal calls it. */
  purpose: string;
  /** SQL server the proxy routes this query to. */
  server: string;
  database: string;
  /** Parameters the proxy expects (name → meaning). */
  params: { name: string; description: string }[];
  /** The SQL / EXEC the proxy runs (representative — source of truth is the proxy). */
  sql: string;
  /** Where the result is consumed in the portal. */
  usedBy: string;
}

const POOL1 = "156.38.153.234 (primary)";
const POOL2 = "129.232.128.2 (phantom server)";
const DB = "ClientMaster";

export const SQL_REGISTRY: SqlRegistryEntry[] = [
  // ── Core master data ───────────────────────────────────────────────
  {
    name: "list_clients",
    label: "List Clients",
    category: "Core master data",
    kind: "query",
    status: "live",
    purpose:
      "All OuterJoin clients (45) used to populate the SQL-client dropdown when creating/editing a tenant in Super Admin.",
    server: POOL1,
    database: DB,
    params: [],
    sql: "SELECT ClientID, Client, [KAM Name], [KAM Email], Status\nFROM tblClients\nORDER BY Client",
    usedBy: "Super Admin → New/Edit Client (SQL-client picker)",
  },
  {
    name: "client_channels",
    label: "Client Channels",
    category: "Core master data",
    kind: "query",
    status: "live",
    purpose: "Distinct retail channels for a client (GAME, MAKRO, MASSBUILD, PNP, SPAR …).",
    server: POOL1,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "EXEC GetClientRetailChannels @client = @client",
    usedBy: "Sync → channels.json; Channel & CAM scorecards",
  },
  {
    name: "client_stores",
    label: "Client Stores / Sites",
    category: "Core master data",
    kind: "query",
    status: "live",
    purpose:
      "All sites for a client (SiteID code, Site Name, Channel, SubChannel, Province). SiteID is the code string (e.g. PNP-HC14).",
    server: POOL1,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "EXEC GetClientRetailSites @client = @client",
    usedBy: "Sync → stores.json; Store scorecard, Phantom/OOS enrichment",
  },
  {
    name: "client_products",
    label: "Client Products",
    category: "Core master data",
    kind: "query",
    status: "live",
    purpose:
      "Product master keyed by Client Product ID (Brand, Category, Description, Status).",
    server: POOL1,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "EXEC GetDataForPowerBI_Products @client = @client",
    usedBy: "Sync → products.json; Product scorecard, Phantom/OOS enrichment",
  },
  {
    name: "client_brands",
    label: "Client Brands",
    category: "Core master data",
    kind: "query",
    status: "live",
    purpose: "Distinct active brands for a client — feeds CAM-mapping brand multiselect.",
    server: POOL1,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql:
      "SELECT DISTINCT [Product Brand] AS Brand\nFROM tblProducts\nWHERE Client = @client AND [Product Status] = 'ACTIVE' AND [Product Brand] IS NOT NULL\nORDER BY [Product Brand]",
    usedBy: "Sync → brands.json; CAM Mapping",
  },

  // ── Sales ──────────────────────────────────────────────────────────
  {
    name: "ytd_sales_by_channel",
    label: "YTD Sales by Channel",
    category: "Sales",
    kind: "query",
    status: "live",
    purpose: "Year-to-date value/units + same-period-last-year (SPLY) per channel, for sales-growth scoring.",
    server: POOL1,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql:
      "SELECT cd.Channel, cd.ChannelDataID,\n  SUM(CASE WHEN YEAR(f.Date)=YEAR(GETDATE()) THEN f.ValueSales ELSE 0 END) AS YTD_Value,\n  SUM(CASE WHEN YEAR(f.Date)=YEAR(GETDATE()) THEN f.UnitSales ELSE 0 END) AS YTD_Units,\n  SUM(CASE WHEN YEAR(f.Date)=YEAR(GETDATE())-1 AND MONTH(f.Date)<=MONTH(GETDATE()) THEN f.ValueSales ELSE 0 END) AS SPLY_Value,\n  SUM(CASE WHEN YEAR(f.Date)=YEAR(GETDATE())-1 AND MONTH(f.Date)<=MONTH(GETDATE()) THEN f.UnitSales ELSE 0 END) AS SPLY_Units\nFROM tblFactData f\nINNER JOIN tblChannelData cd ON cd.ChannelDataID = f.ChannelDataID\nWHERE f.ClientID = (SELECT ClientID FROM tblClients WHERE Client=@client) AND f.IsDeleted=0\nGROUP BY cd.Channel, cd.ChannelDataID\nORDER BY cd.Channel",
    usedBy: "Sync → sales/<period>/channels.json; Sales page, scorecards",
  },
  {
    name: "ytd_sales_by_store",
    label: "YTD Sales by Store",
    category: "Sales",
    kind: "query",
    status: "live",
    purpose: "Same as YTD-by-channel, grouped by SiteID/SiteCode/SiteName.",
    server: POOL1,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "-- Same shape as ytd_sales_by_channel, GROUP BY SiteID, SiteCode, SiteName, Channel",
    usedBy: "Sync → sales/<period>/stores.json; Sales page, Store scorecard",
  },
  {
    name: "ytd_sales_by_product",
    label: "YTD Sales by Product",
    category: "Sales",
    kind: "query",
    status: "live",
    purpose: "Same as YTD-by-channel, grouped by product (active products only).",
    server: POOL1,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "-- Same shape as ytd_sales_by_channel, GROUP BY ProductID, SKU, [Product Description], [Product Brand]",
    usedBy: "Sync → sales/<period>/products.json; Sales page, Product scorecard",
  },

  // ── Numerical Distribution ─────────────────────────────────────────
  {
    name: "nd_by_channel",
    label: "ND by Channel",
    category: "Numerical Distribution",
    kind: "query",
    status: "building",
    purpose: "Numerical distribution % per channel (ranged site-SKU coverage). Being finalised by Mark.",
    server: POOL1,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "-- Definition in progress (Mark). Expected cols: Channel, rangedStores, totalStores, ndPercent",
    usedBy: "Sync → nd/<period>/detail.json; ND page, scorecards",
  },
  {
    name: "nd_by_store",
    label: "ND by Store",
    category: "Numerical Distribution",
    kind: "query",
    status: "building",
    purpose: "Numerical distribution % per store. Being finalised by Mark.",
    server: POOL1,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "-- Definition in progress (Mark). Expected cols: SiteCode, SiteName, rangedProducts, totalProducts, ndPercent",
    usedBy: "Sync → nd/<period>/detail.json; ND page, Store scorecard",
  },
  {
    name: "nd_by_product",
    label: "ND by Product",
    category: "Numerical Distribution",
    kind: "query",
    status: "building",
    purpose: "Numerical distribution % per product. Being finalised by Mark.",
    server: POOL1,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "-- Definition in progress (Mark). Expected cols: ProductID, [Product Description], rangedStores, totalStores, ndPercent",
    usedBy: "Sync → nd/<period>/detail.json; ND page, Product scorecard",
  },

  // ── Out of Stocks ──────────────────────────────────────────────────
  {
    name: "oos_detail",
    label: "OOS Detail",
    category: "Out of Stocks",
    kind: "query",
    status: "building",
    purpose:
      "Per site-SKU out-of-stock detail (SOH at/below zero on the latest snapshot). Being finalised by Mark.",
    server: POOL1,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "-- Definition in progress (Mark). Expected cols: SiteID, SiteCode, SiteName, Channel, SubChannel, ProductID, SKU, [Product Description], [Product Brand], SOH, LatestDate",
    usedBy: "Sync → oos/<period>/detail.json; OOS page, scorecards",
  },

  // ── Phantom Stock ──────────────────────────────────────────────────
  {
    name: "phantom_stock_pnp",
    label: "Phantom Stock — PnP (Stored Procedure)",
    category: "Phantom Stock",
    kind: "stored_procedure",
    status: "live",
    purpose:
      "PnP phantom stock: items with stock-on-hand but no sales/movement over the lookback window. Runs on the secondary (phantom) server.",
    server: POOL2,
    database: DB,
    params: [
      { name: "client", description: "Client name, e.g. HENKEL" },
      { name: "phantomDays", description: "Lookback window in days (Control Centre → Phantom Settings; default 60)" },
    ],
    sql: "EXEC [dbo].[GetPhantomStock_PNP] @ClientName = @client, @PhantomDays = @phantomDays",
    usedBy: "Sync → phantom/<period>/detail.json; Phantom Stock page",
  },
  {
    name: "phantom_detail",
    label: "Phantom Detail (generic)",
    category: "Phantom Stock",
    kind: "query",
    status: "planned",
    purpose:
      "Generic multi-channel phantom detail (other channels get their own SPs later — GAME, MAKRO, SPAR, MASSBUILD).",
    server: POOL1,
    database: DB,
    params: [
      { name: "client", description: "Client name, e.g. HENKEL" },
      { name: "lookbackDays", description: "Lookback window in days" },
    ],
    sql: "-- Planned. One SP per channel, mirroring GetPhantomStock_PNP.",
    usedBy: "Future: Phantom page (non-PnP channels)",
  },

  // ── Utility / diagnostics ──────────────────────────────────────────
  {
    name: "list_tables",
    label: "List Tables",
    category: "Utility / diagnostics",
    kind: "query",
    status: "live",
    purpose: "Lists tables in the database — schema exploration during development.",
    server: POOL1,
    database: DB,
    params: [],
    sql: "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME",
    usedBy: "Dev / diagnostics only",
  },
  {
    name: "describe_table",
    label: "Describe Table",
    category: "Utility / diagnostics",
    kind: "query",
    status: "live",
    purpose: "Column names/types for a table — schema exploration.",
    server: POOL1,
    database: DB,
    params: [{ name: "table", description: "Table name" }],
    sql: "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=@table ORDER BY ORDINAL_POSITION",
    usedBy: "Dev / diagnostics only",
  },
  {
    name: "select_top",
    label: "Select Top N",
    category: "Utility / diagnostics",
    kind: "query",
    status: "live",
    purpose: "First N rows of a table — quick data inspection.",
    server: POOL1,
    database: DB,
    params: [{ name: "table", description: "Table name" }],
    sql: "SELECT TOP 50 * FROM <table>",
    usedBy: "Dev / diagnostics only",
  },
];

export const SQL_CATEGORIES = [
  "Core master data",
  "Sales",
  "Numerical Distribution",
  "Out of Stocks",
  "Phantom Stock",
  "Utility / diagnostics",
] as const;
