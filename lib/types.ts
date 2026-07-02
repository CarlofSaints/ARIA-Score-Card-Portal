/* ──────────────────────────────────────────────────────────────
   ARIA Score Card Portal — Shared Types
   ────────────────────────────────────────────────────────────── */

// ── Roles ──

export type UserRole = "super_admin" | "admin" | "cam" | "manager" | "rep";

export const ROLE_HIERARCHY: UserRole[] = [
  "super_admin",
  "admin",
  "cam",
  "manager",
  "rep",
];

// ── Permissions ──

export type PermissionKey =
  | "manage_users"
  | "manage_roles"
  | "manage_clients"
  | "manage_modules"
  | "manage_kpis"
  | "view_cam_scorecard"
  | "view_channel_scorecard"
  | "view_store_scorecard"
  | "view_product_scorecard"
  | "view_dashboard"
  | "view_phantom"
  | "view_oos"
  | "view_nd"
  | "view_sales"
  | "export_data"
  | "manage_cam_mapping";

export interface PermissionDef {
  key: PermissionKey;
  label: string;
  category: "admin" | "view" | "data";
}

export interface RolePermissions {
  role: UserRole;
  permissions: PermissionKey[];
}

// ── Modules ──

export type ModuleKey =
  | "cam_scorecard"
  | "channel_scorecard"
  | "store_scorecard"
  | "product_scorecard";

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  route: string;
  icon: string; // Lucide icon name or SVG path
  description: string;
}

// ── KPIs ──

export type KpiKey =
  | "sales_growth"
  | "phantom_inventory"
  | "numerical_distribution"
  | "oos";

export interface KpiDef {
  key: KpiKey;
  label: string;
  shortLabel: string;
  description: string;
  defaultWeight: number;
}

export interface KpiWeighting {
  key: KpiKey;
  weight: number; // 0–100, all weights should sum to 100
}

// ── KPI scoring (how a KPI's % maps to points) ──
// The KPI weight is the points pool for that KPI. Brackets define how the
// metric % converts to points (0..weight). One config per KPI, applied to every
// scorecard level (channel/store/product/CAM).

// Sales is the only KPI scored on a period-over-period growth metric; the other
// three are point-in-time levels. "tm_vs_lm" needs last-month data that
// GetSales_PNP does not yet return — it is inert (neutral) until the SP is
// extended (pending Mark).
export type SalesGrowthMetric = "ytd_vs_ytd" | "tm_vs_tmly" | "tm_vs_lm";

export interface ScoreBracket {
  min: number; // inclusive lower bound of the metric % (e.g. growth % or KPI %)
  max: number; // inclusive upper bound
  points: number; // points awarded when the metric falls in [min, max]
}

export interface KpiScoringConfig {
  key: KpiKey;
  // Brackets ordered low→high; the first bracket whose [min,max] contains the
  // value wins. For ND, higher % → more points; for Phantom/OOS, lower % → more
  // points (the admin encodes this directly in the bracket points).
  brackets: ScoreBracket[];
  // Sales only: which growth metric the brackets are evaluated against.
  salesGrowthMetric?: SalesGrowthMetric;
}

// ── Tenant Config ──

export interface TenantBranding {
  primaryColor: string; // required HEX
  secondaryColor?: string; // optional HEX
  accentColor?: string; // optional HEX
  logoUrl?: string; // Blob URL to uploaded logo
}

export interface TenantConfig {
  slug: string;
  name: string;
  active: boolean;
  branding: TenantBranding;
  enabledModules: ModuleKey[];
  kpiWeightings: KpiWeighting[];
  domains: string[];
  sqlClientName?: string; // Maps to tblClients.Client in SQL Server
  phantomLookbackDays?: number; // Days to look back for phantom stock detection (default 60)
  ndRollingDays?: number; // Rolling scan window (days) for Numerical Distribution — SP @ScanRange (default 60)
  syncTimes?: string[]; // Local (SAST) hours to auto-sync, e.g. ["08:00","14:00"]
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

// ── Edge-safe tenant (for proxy header) ──

export interface TenantConfigEdge {
  slug: string;
  name: string;
  primaryColor: string;
  secondaryColor?: string;
  accentColor?: string;
  logoUrl?: string;
  domains: string[];
  active: boolean;
  enabledModules: ModuleKey[];
}

// ── Users ──

export interface User {
  id: string;
  name: string;
  email: string;
  password: string; // bcrypt hash
  role: UserRole;
  forcePasswordChange: boolean;
  active: boolean;
  createdAt: string; // ISO
  lastLoginAt?: string; // ISO
}

export interface SuperAdmin {
  id: string;
  name: string;
  email: string;
  password: string; // bcrypt hash
  createdAt: string;
}

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  tenantSlug: string;
  forcePasswordChange?: boolean;
  isSuperAdmin?: boolean;
}

// ── Password Reset ──

export interface PasswordResetToken {
  token: string;
  email: string;
  tenantSlug: string;
  expiresAt: string; // ISO
  used: boolean;
}

// ── CAM Mapping ──

export interface CamMapping {
  id: string;
  camUserId: string; // references a User (role "cam")
  camName: string; // denormalised from the user for display
  camEmail?: string; // deprecated — CAM is now chosen from the user list
  channelIds: string[];
  brandIds: string[];
}

// ── Scorecard Entities (from SQL in Phase 2, mock in Phase 1) ──

export interface ScorecardChannel {
  id: string;
  name: string;
}

export interface ScorecardStore {
  id: string;
  name: string;
  channelId: string;
  channelName: string;
  subChannel?: string; // CORP/HYPER/FRANCHISE/DC/DC-ONLINE… (from store master SubChannel)
  region?: string;
  siteCode?: string; // SQL SiteCode (e.g. "PNP-HC14") — used to map SP rows keyed by SiteCode
}

export interface ScorecardProduct {
  id: string;
  name: string;
  sku: string;
  brand: string;
  category?: string;
}

// ── Score Data ──

export interface KpiScore {
  kpiKey: KpiKey;
  rawValue: number; // 0–100 performance value used for scoring (health-oriented)
  percent?: number; // actual business metric % for display (e.g. phantom % = 12.8)
  score: number; // weighted score contribution (after any redistribution)
  maxScore: number; // maximum possible weighted score (effective weight)
  na?: boolean; // true = this KPI has no data for this entity (show "—", excluded; its points were redistributed)
}

export interface EntityScore {
  entityId: string;
  entityName: string;
  entityType: "cam" | "channel" | "store" | "product";
  period: string; // "YYYY-MM"
  kpiScores: KpiScore[];
  totalScore: number;
  maxPossibleScore: number;
  rank?: number;
  hasData?: boolean; // false = entity has no source data yet (show "—", not 0)
}

// ── Sales / Targets ──

export interface SalesData {
  entityId: string;
  entityType: "channel" | "store" | "product";
  period: string; // "YYYY-MM"
  salesValue: number; // YTD value
  salesUnits: number; // YTD units
  previousPeriodSalesValue?: number; // PY YTD value (SPLY)
  previousPeriodSalesUnits?: number; // PY YTD units
  mtdValue?: number; // this-month-to-date value
  mtdUnits?: number; // this-month-to-date units
  pyMtdValue?: number; // prior-year same-month-to-date value (TMLY)
  pyMtdUnits?: number; // prior-year same-month-to-date units
  lastMonthValue?: number; // previous calendar month value (LM) — pending SP support
  lastMonthUnits?: number; // previous calendar month units — pending SP support
  target?: number;
}

// ── SQL Data Types (from proxy queries) ──

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

export interface SqlBrand {
  Brand: string;
}

// Rows returned by the GetPhantomStock_PNP stored procedure (PnP channel).
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

// ── Phantom Stock (enriched detail for the phantom store page) ──
// Built during sync from the GetPhantomStock_PNP SP (code fields only),
// enriched with names/channel/brand/province from the store & product master.
export interface PhantomDetailRow {
  siteCode: string;
  storeName: string;
  channelName: string;
  subChannel: string; // from SP SubChannel (CORP/HYPER/FRANCHISE/DC); "" if absent
  province: string;
  productId: string;
  productName: string;
  brand: string;
  channelArticle: string;
  siteArticleStatus: string;
  ranged: boolean | null; // from SP "Ranging Status"; null when unknown
  soh: number;
  date: string; // snapshot date (ISO)
  dateLastSold: string | null; // from SP "Date Last Sold"; null if absent
}

// ── OOS / ND / Sales detail rows ──
// Enriched rows for the OOS, Numerical Distribution and Sales detail pages.
// Mirror the PhantomDetailRow pattern: the sync transforms raw SQL/SP rows
// into these shapes and writes them to `${slug}/data/{oos|nd|sales}/${period}/detail.json`.
// Until Mark's queries are wired the blobs are empty and the pages show an
// empty-state — no other change is needed to "plug in" the data.

export interface OosDetailRow {
  siteCode: string;
  storeName: string;
  channelName: string;
  subChannel: string; // CORP/HYPER/FRANCHISE/DC; "" if absent
  province: string;
  productId: string;
  productName: string;
  brand: string;
  soh: number;
  date: string; // latest snapshot date (ISO); "" if absent
}

export interface NdDetailRow {
  level: "channel" | "store" | "product";
  channelName: string;
  subChannel: string; // store-level sub-channel (DC/DC-ONLINE/CORP…); "" for channel/product level
  siteCode: string; // "" for channel/product level
  storeName: string; // "" for channel/product level
  productId: string; // "" for channel/store level
  productName: string; // "" for channel/store level
  brand: string;
  rangedCount: number; // numerator (ranged site-SKU combos present)
  totalCount: number; // denominator (ranged site-SKU combos expected)
  ndPercent: number; // rangedCount / totalCount * 100
}

// Sales for one calendar month, resolved from the SP's relative windows: the
// channel's MaxDate-month comes from MTD (and carries a prior-year comparator),
// the month before it comes from PMTD (no PY available).
export interface MonthSales {
  value: number;
  units: number;
  pyValue: number; // prior-year same month (only known for the MTD month; else 0)
  pyUnits: number;
}

export interface SalesDetailRow {
  level: "channel" | "store" | "product";
  entityId: string;
  channelName: string;
  subChannel: string; // store-level sub-channel; "" for channel/product level
  siteCode: string; // "" for channel/product level
  storeName: string; // "" for channel/product level
  productId: string; // "" for channel/store level
  productName: string; // "" for channel/store level
  brand: string;
  ytdValue: number;
  ytdUnits: number;
  splyValue: number; // PY YTD value (same-period-last-year)
  splyUnits: number;
  growthPercent: number; // (ytdValue - splyValue) / splyValue * 100
  mtdValue: number; // this-month-to-date value
  mtdUnits: number;
  pyMtdValue: number; // prior-year same-month-to-date value
  pyMtdUnits: number;
  mtdGrowthPercent: number; // (mtdValue - pyMtdValue) / pyMtdValue * 100
  // Data-as-of date for this entity (the SP MaxDate). Channels can differ, which
  // is why the same calendar month is MTD for one channel and PMTD for another.
  maxDate?: string; // YYYY-MM-DD
  // Absolute calendar-month sales, keyed "YYYY-MM". Lets the Sales page show a
  // specific month regardless of each channel's data freshness.
  months?: Record<string, MonthSales>;
}

// ── Ranging (denominator source — uploaded Range Management workbook) ──
// One record per channel (RANGE_<CHANNEL> sheet). "Ranged" = RangeIndicator true.
export interface RangingChannelData {
  channel: string; // e.g. "PNP" (from sheet RANGE_PNP)
  total: number; // total ranged (true) site-SKU combos
  byStore: Record<string, number>; // SiteCode -> ranged count
  byProduct: Record<string, number>; // ProductID -> ranged count
  pairs: string[]; // "SiteCode|ProductID" for every ranged=true combo
  rowsScanned: number; // total rows in the sheet (true + false)
  sourceFile?: string;
  uploadedAt: string; // ISO
}

// Lightweight index entry (no pairs) for listing loaded ranging on the UI.
export interface RangingIndexEntry {
  channel: string;
  total: number;
  stores: number;
  products: number;
  rowsScanned: number;
  sourceFile?: string;
  uploadedAt: string;
}

// ── Activity Log ──

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  details?: string;
}
