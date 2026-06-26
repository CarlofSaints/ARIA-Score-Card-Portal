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
    name: "client_product_links",
    label: "Client Product Links",
    category: "Core master data",
    kind: "query",
    status: "live",
    purpose:
      "Channel-article → product link mapping for a client (excludes REMOVE/INCORRECT VENDOR). Used to join fact rows to products.",
    server: POOL1,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "EXEC GetDataForPowerBI_ProductLinks @client = @client",
    usedBy: "Sales/OOS/phantom joins (fact ChannelArticleID → Product ID)",
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
    status: "building",
    purpose: "Year-to-date value/units + same-period-last-year (SPLY) per channel. Deployed against tblFactData (currently empty → returns 0); Mark finalising against the real source.",
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
    status: "building",
    purpose: "YTD + SPLY value/units per store. Deployed against tblFactData (currently empty → returns 0); Mark finalising against the real source.",
    server: POOL1,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "SELECT f.SiteID, f.SiteCode, s.SiteName, s.Channel,\n  SUM(CASE WHEN YEAR(f.[Date])=YEAR(GETDATE()) THEN f.ValueSales ELSE 0 END) AS YTD_Value,\n  SUM(CASE WHEN YEAR(f.[Date])=YEAR(GETDATE()) THEN f.UnitSales ELSE 0 END) AS YTD_Units,\n  SUM(CASE WHEN YEAR(f.[Date])=YEAR(GETDATE())-1 AND MONTH(f.[Date])<=MONTH(GETDATE()) THEN f.ValueSales ELSE 0 END) AS SPLY_Value,\n  SUM(CASE WHEN YEAR(f.[Date])=YEAR(GETDATE())-1 AND MONTH(f.[Date])<=MONTH(GETDATE()) THEN f.UnitSales ELSE 0 END) AS SPLY_Units\nFROM tblFactData f\nINNER JOIN tblSites s ON s.SiteCode=f.SiteCode\nWHERE f.ClientID=(SELECT TOP 1 ClientID FROM tblClients WHERE Client=@client) AND f.IsDeleted=0\nGROUP BY f.SiteID, f.SiteCode, s.SiteName, s.Channel",
    usedBy: "Sync → sales/<period>/stores.json; Sales page, Store scorecard",
  },
  {
    name: "ytd_sales_by_product",
    label: "YTD Sales by Product",
    category: "Sales",
    kind: "query",
    status: "building",
    purpose: "YTD + SPLY value/units per active product (joined via tblProductLinks). Deployed against tblFactData (currently empty → returns 0); Mark finalising against the real source.",
    server: POOL1,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "SELECT p.ID AS ProductID, p.[Client Product ID] AS SKU, p.[Product Description], p.[Product Brand],\n  SUM(CASE WHEN YEAR(f.[Date])=YEAR(GETDATE()) THEN f.ValueSales ELSE 0 END) AS YTD_Value,\n  SUM(CASE WHEN YEAR(f.[Date])=YEAR(GETDATE()) THEN f.UnitSales ELSE 0 END) AS YTD_Units,\n  SUM(CASE WHEN YEAR(f.[Date])=YEAR(GETDATE())-1 AND MONTH(f.[Date])<=MONTH(GETDATE()) THEN f.ValueSales ELSE 0 END) AS SPLY_Value,\n  SUM(CASE WHEN YEAR(f.[Date])=YEAR(GETDATE())-1 AND MONTH(f.[Date])<=MONTH(GETDATE()) THEN f.UnitSales ELSE 0 END) AS SPLY_Units\nFROM tblFactData f\nINNER JOIN tblProductLinks pl ON pl.ChannelArticleID=f.ChannelArticleID AND pl.Client=@client\nINNER JOIN tblProducts p ON p.[Client Product ID]=pl.[Product ID] AND p.Client=@client\nWHERE f.ClientID=(SELECT TOP 1 ClientID FROM tblClients WHERE Client=@client) AND f.IsDeleted=0 AND p.[Product Status]='ACTIVE'\nGROUP BY p.ID, p.[Client Product ID], p.[Product Description], p.[Product Brand]",
    usedBy: "Sync → sales/<period>/products.json; Sales page, Product scorecard",
  },
  {
    name: "sales_pnp",
    label: "Sales — PnP (Stored Procedure)",
    category: "Sales",
    kind: "stored_procedure",
    status: "live",
    purpose:
      "PnP sales: one row per site-SKU with YTD and MTD value/units plus prior-year (PY) comparatives. SPLY = PY YTD. The SP computes its own windows (returns YTDStartDate/MTDStartDate/MaxDate per row); the sync aggregates to channel/store/product. Note: the *Units columns come back as strings. Runs on the secondary (phantom) server. This is the live sales source (the ytd_sales_by_* queries above read the empty tblFactData and are superseded for PnP).",
    server: POOL2,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "EXEC [GetDataForCustomDev_PNP_Sales] @ClientName = @client\n-- returns: MaxDate, YTDStartDate, MTDStartDate, SiteCode, SiteName, Channel, SubChannel,\n-- Province, ChannelArticle, [Product ID], [Product Description], [Product Brand], [Product Status],\n-- [Channel Product Status], [Ranging Status], [YTD Units], [YTD Value], [PY YTD Units], [PY YTD Value],\n-- [MTD Units], [MTD Value], [PMTD Units], [PMTD Value] (PMTD = last month / LM), [PY MTD Units], [PY MTD Value]",
    usedBy:
      "Sync → sales/<period>/{channels,stores,products,detail}.json; Sales page, scorecards",
  },
  {
    name: "sales_spar",
    label: "Sales — SPAR (Stored Procedure)",
    category: "Sales",
    kind: "stored_procedure",
    status: "live",
    purpose:
      "SPAR sales: same column set as the PnP sales SP (YTD/MTD/PMTD/PY-MTD), Channel = SPAR. Runs on the PRIMARY (.234) server — NOT the phantom server. Heavy (~100s, 100k+ rows). Merged with PnP sales in the sync.",
    server: POOL1,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "EXEC [GetDataForCustomDev_SPAR_Sales] @ClientName = @client",
    usedBy: "Sync → sales/<period>/* (merged with PnP); Sales page, scorecards",
  },
  {
    name: "sales_massbuild",
    label: "Sales — MASSBUILD/Builders (Stored Procedure)",
    category: "Sales",
    kind: "stored_procedure",
    status: "building",
    purpose:
      "MASSBUILD (Builders) sales — same columns as PnP sales (Channel = MASSBUILD). Runs on pool2 (.2). Sales-only channel (no ND/OOS/Phantom → points redistribute onto Sales). ⚠ needs GRANT EXECUTE for the proxy login (Mark).",
    server: POOL2,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "EXEC [dbo].[GetDataForCustomDev_MASSBUILD_Sales] @ClientName = @client",
    usedBy: "Sync → sales/<period>/* (merged); Sales page, scorecards",
  },
  {
    name: "sales_game",
    label: "Sales — GAME (Stored Procedure)",
    category: "Sales",
    kind: "stored_procedure",
    status: "building",
    purpose:
      "GAME sales — same columns as PnP sales (Channel = GAME). Runs on pool2 (.2). Sales-only channel. ⚠ needs GRANT EXECUTE for the proxy login (Mark).",
    server: POOL2,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "EXEC [dbo].[GetDataForCustomDev_GAME_Sales] @ClientName = @client",
    usedBy: "Sync → sales/<period>/* (merged); Sales page, scorecards",
  },
  {
    name: "sales_makro",
    label: "Sales — MAKRO (Stored Procedure)",
    category: "Sales",
    kind: "stored_procedure",
    status: "building",
    purpose:
      "MAKRO sales — same columns as PnP sales (Channel = MAKRO). Runs on pool2 (.2). Sales-only channel. ⚠ needs GRANT EXECUTE for the proxy login (Mark).",
    server: POOL2,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "EXEC [dbo].[GetDataForCustomDev_MAKRO_Sales] @ClientName = @client",
    usedBy: "Sync → sales/<period>/* (merged); Sales page, scorecards",
  },

  // ── Numerical Distribution ─────────────────────────────────────────
  {
    name: "nd_by_channel",
    label: "ND by Channel",
    category: "Numerical Distribution",
    kind: "query",
    status: "building",
    purpose: "Numerical distribution % per channel (ranged stores / total stores). Deployed against tblRangingData; Mark finalising against the real source.",
    server: POOL1,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "SELECT s.Channel,\n  COUNT(DISTINCT CASE WHEN r.RangeIndicator='TRUE' THEN r.SiteCode END) AS rangedStores,\n  COUNT(DISTINCT r.SiteCode) AS totalStores,\n  CASE WHEN COUNT(DISTINCT r.SiteCode)=0 THEN 0\n       ELSE CAST(COUNT(DISTINCT CASE WHEN r.RangeIndicator='TRUE' THEN r.SiteCode END) AS FLOAT)/COUNT(DISTINCT r.SiteCode)*100 END AS ndPercent\nFROM tblRangingData r\nINNER JOIN tblSites s ON s.SiteCode = r.SiteCode\nWHERE r.Client=@client\nGROUP BY s.Channel ORDER BY s.Channel",
    usedBy: "Sync → nd/<period>/detail.json; ND page, scorecards",
  },
  {
    name: "nd_by_store",
    label: "ND by Store",
    category: "Numerical Distribution",
    kind: "query",
    status: "building",
    purpose: "Numerical distribution % per store (ranged products / total products). Deployed against tblRangingData; Mark finalising against the real source.",
    server: POOL1,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "SELECT r.SiteCode, s.SiteName, s.Channel,\n  COUNT(DISTINCT CASE WHEN r.RangeIndicator='TRUE' THEN r.ProductID END) AS rangedProducts,\n  COUNT(DISTINCT r.ProductID) AS totalProducts,\n  CASE WHEN COUNT(DISTINCT r.ProductID)=0 THEN 0\n       ELSE CAST(COUNT(DISTINCT CASE WHEN r.RangeIndicator='TRUE' THEN r.ProductID END) AS FLOAT)/COUNT(DISTINCT r.ProductID)*100 END AS ndPercent\nFROM tblRangingData r\nINNER JOIN tblSites s ON s.SiteCode = r.SiteCode\nWHERE r.Client=@client\nGROUP BY r.SiteCode, s.SiteName, s.Channel ORDER BY s.Channel, s.SiteName",
    usedBy: "Sync → nd/<period>/detail.json; ND page, Store scorecard",
  },
  {
    name: "nd_by_product",
    label: "ND by Product",
    category: "Numerical Distribution",
    kind: "query",
    status: "building",
    purpose: "Numerical distribution % per product (stores ranged / total stores). Deployed against tblRangingData; Mark finalising against the real source.",
    server: POOL1,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "SELECT r.ProductID, p.[Product Description], p.[Product Brand],\n  COUNT(DISTINCT CASE WHEN r.RangeIndicator='TRUE' THEN r.SiteCode END) AS rangedStores,\n  COUNT(DISTINCT r.SiteCode) AS totalStores,\n  CASE WHEN COUNT(DISTINCT r.SiteCode)=0 THEN 0\n       ELSE CAST(COUNT(DISTINCT CASE WHEN r.RangeIndicator='TRUE' THEN r.SiteCode END) AS FLOAT)/COUNT(DISTINCT r.SiteCode)*100 END AS ndPercent\nFROM tblRangingData r\nINNER JOIN tblProducts p ON p.[Client Product ID]=r.ProductID AND p.Client=r.Client\nWHERE r.Client=@client\nGROUP BY r.ProductID, p.[Product Description], p.[Product Brand]",
    usedBy: "Sync → nd/<period>/detail.json; ND page, Product scorecard",
  },
  {
    name: "nd_pnp",
    label: "Numerical Distribution — PnP (Stored Procedure)",
    category: "Numerical Distribution",
    kind: "stored_procedure",
    status: "live",
    purpose:
      "PnP numerical distribution: per site-SKU rows the SP considers distributed within the scan window. Returns code/master fields (SiteCode, Channel, Product ID, Brand …); the sync computes ND% (distributed / ranged) by channel/store/product against the uploaded ranging file. Runs on the secondary (phantom) server.",
    server: POOL2,
    database: DB,
    params: [
      { name: "client", description: "Client name, e.g. HENKEL" },
      { name: "scanRange", description: "Rolling window in days — Control Centre → Numerical Distribution Settings (default 60)" },
    ],
    sql: "EXEC [dbo].[GetDataForCustomDev_PNP_NumericalDistribution] @ClientName = @client, @ScanRange = @scanRange\n-- returns ALL ranged site-SKUs with a [Numerical Distributed] flag (1/0) + SOH, UnitSales.\n-- ND% = distributed / ranged, computed per entity in the sync (self-contained, no range file).",
    usedBy: "Sync → nd/<period>/detail.json + kpi/<period>/nd-*.json; ND page, scorecards",
  },
  {
    name: "nd_spar",
    label: "Numerical Distribution — SPAR (Stored Procedure)",
    category: "Numerical Distribution",
    kind: "stored_procedure",
    status: "building",
    purpose:
      "SPAR numerical distribution, mirrors the PnP ND SP (Numerical Distributed flag). Runs on the PRIMARY (.234) server. ⚠ BLOCKED: proxy login needs GRANT EXECUTE on GetDataForCustomDev_SPAR_NumericalDistribution (Mark). Merged with PnP ND in the sync once granted.",
    server: POOL1,
    database: DB,
    params: [
      { name: "client", description: "Client name, e.g. HENKEL" },
      { name: "scanRange", description: "Rolling window in days (default 60)" },
    ],
    sql: "EXEC [dbo].[GetDataForCustomDev_SPAR_NumericalDistribution] @ClientName = @client, @ScanRange = @scanRange",
    usedBy: "Sync → nd/<period>/* (merged with PnP); ND page, scorecards",
  },

  // ── Out of Stocks ──────────────────────────────────────────────────
  {
    name: "oos_detail",
    label: "OOS Detail",
    category: "Out of Stocks",
    kind: "query",
    status: "building",
    purpose:
      "Per site-SKU latest SOH ≤ 1 (active status). Deployed against tblFactData (currently empty → returns 0 rows); Mark finalising against the real source.",
    server: POOL1,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "WITH LatestSOH AS (\n  SELECT f.SiteID, f.SiteCode, f.ChannelArticleID, f.ArticleSiteStatusCode, f.SOH, f.[Date] AS LatestDate,\n    ROW_NUMBER() OVER (PARTITION BY f.SiteID, f.ChannelArticleID ORDER BY f.[Date] DESC) AS rn\n  FROM tblFactData f\n  WHERE f.ClientID=(SELECT TOP 1 ClientID FROM tblClients WHERE Client=@client) AND f.IsDeleted=0)\nSELECT l.SiteID, l.SiteCode, s.SiteName, s.Channel, s.SubChannel,\n  p.ID AS ProductID, p.[Client Product ID] AS SKU, p.[Product Description], p.[Product Brand], l.SOH, l.LatestDate\nFROM LatestSOH l\nINNER JOIN tblSites s ON s.SiteCode=l.SiteCode\nINNER JOIN tblProductLinks pl ON pl.ChannelArticleID=l.ChannelArticleID AND pl.Client=@client\nINNER JOIN tblProducts p ON p.[Client Product ID]=pl.[Product ID] AND p.Client=@client\nWHERE l.rn=1 AND l.SOH<=1 AND l.ArticleSiteStatusCode='A' AND p.[Product Status]='ACTIVE'",
    usedBy: "Sync → oos/<period>/detail.json; OOS page, scorecards",
  },
  {
    name: "oos_pnp",
    label: "Out of Stock — PnP (Stored Procedure)",
    category: "Out of Stocks",
    kind: "stored_procedure",
    status: "live",
    purpose:
      "PnP out-of-stock list: per site-SKU rows the SP flags as out of stock. Returns code/master fields (SiteCode, Channel, Product ID, Brand …); the sync enriches names/brand from the master. Runs on the secondary (phantom) server.",
    server: POOL2,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "EXEC [GetDataForCustomDev_PNP_OutOfStock] @client\n-- returns OOS site-SKUs incl. Date, [Site Article Status], LatestSOH (currently unused by the OOS page).",
    usedBy: "Sync → oos/<period>/detail.json + kpi/<period>/oos-*.json; OOS page, scorecards",
  },
  {
    name: "oos_massbuild",
    label: "Out of Stock — MASSBUILD/Builders (Stored Procedure)",
    category: "Out of Stocks",
    kind: "stored_procedure",
    status: "building",
    purpose:
      "MASSBUILD (Builders) out-of-stock, same row shape as PnP OOS (Channel = MASSBUILD). Runs on pool2 (.2). ⚠ the SP reads database DataOrbisSAMS — the proxy login (ClaudeCodeCarl) needs ACCESS to DataOrbisSAMS (not just EXECUTE on the SP). Merged with PnP OOS in the sync.",
    server: POOL2,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "EXEC [dbo].[GetDataForCustomDev_MASSBUILD_OutOfStock] @ClientName = @client",
    usedBy: "Sync → oos/<period>/* (merged); OOS page, scorecards",
  },
  {
    name: "oos_game",
    label: "Out of Stock — GAME (Stored Procedure)",
    category: "Out of Stocks",
    kind: "stored_procedure",
    status: "building",
    purpose:
      "GAME out-of-stock, same row shape as PnP OOS (Channel = GAME). Runs on pool2 (.2). ⚠ reads DataOrbisSAMS — proxy login needs access to that database. Merged with PnP OOS in the sync.",
    server: POOL2,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "EXEC [dbo].[GetDataForCustomDev_GAME_OutOfStock] @ClientName = @client",
    usedBy: "Sync → oos/<period>/* (merged); OOS page, scorecards",
  },
  {
    name: "oos_makro",
    label: "Out of Stock — MAKRO (Stored Procedure)",
    category: "Out of Stocks",
    kind: "stored_procedure",
    status: "building",
    purpose:
      "MAKRO out-of-stock, same row shape as PnP OOS (Channel = MAKRO). Runs on pool2 (.2). ⚠ reads DataOrbisSAMS — proxy login needs access to that database. Merged with PnP OOS in the sync.",
    server: POOL2,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "EXEC [dbo].[GetDataForCustomDev_MAKRO_OutOfStock] @ClientName = @client",
    usedBy: "Sync → oos/<period>/* (merged); OOS page, scorecards",
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
    sql: "EXEC [dbo].[GetDataForCustomDev_PNP_PhantomStock] @ClientName = @client, @PhantomDays = @phantomDays",
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
    params: [{ name: "table", description: "Table name" }, { name: "limit", description: "Max rows (default 20, cap 100)" }],
    sql: "SELECT TOP (@limit) * FROM [<table>]",
    usedBy: "Dev / diagnostics only",
  },
  {
    name: "fact_data_check",
    label: "Fact Data Check (diagnostic)",
    category: "Utility / diagnostics",
    kind: "query",
    status: "live",
    purpose: "Row count + min/max date + distinct clients on tblFactData. Used while debugging why sales/OOS were empty (tblFactData has 0 rows).",
    server: POOL1,
    database: DB,
    params: [],
    sql: "SELECT COUNT(*) AS totalRows, MIN([Date]) AS minDate, MAX([Date]) AS maxDate, COUNT(DISTINCT ClientID) AS distinctClients\nFROM tblFactData",
    usedBy: "Dev / diagnostics only",
  },
  {
    name: "fact_data_henkel",
    label: "Fact Data for Client (diagnostic)",
    category: "Utility / diagnostics",
    kind: "query",
    status: "live",
    purpose: "Row count + date range + distinct channels/sites on tblFactData for one client.",
    server: POOL1,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "SELECT COUNT(*) AS totalRows, MIN(f.[Date]) AS minDate, MAX(f.[Date]) AS maxDate, COUNT(DISTINCT f.ChannelDataID) AS distinctChannels, COUNT(DISTINCT f.SiteID) AS distinctSites\nFROM tblFactData f\nWHERE f.ClientID = (SELECT TOP 1 ClientID FROM tblClients WHERE Client=@client) AND f.IsDeleted=0",
    usedBy: "Dev / diagnostics only",
  },
  {
    name: "describe_product_links",
    label: "Describe Product Links (diagnostic)",
    category: "Utility / diagnostics",
    kind: "query",
    status: "live",
    purpose: "Sample 5-row join across tblFactData → tblProductLinks → tblProducts to verify the link path.",
    server: POOL1,
    database: DB,
    params: [{ name: "client", description: "Client name, e.g. HENKEL" }],
    sql: "SELECT TOP 5 f.ID, f.[Date], f.ValueSales, f.UnitSales, f.SOH, pl.[Product ID], p.[Client Product ID], p.[Product Description]\nFROM tblFactData f\nINNER JOIN tblProductLinks pl ON pl.ChannelArticleID = f.ChannelArticleID AND pl.Client=@client\nINNER JOIN tblProducts p ON p.[Client Product ID] = pl.[Product ID] AND p.Client=@client",
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
