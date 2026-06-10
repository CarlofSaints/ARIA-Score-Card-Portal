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
  rawValue: number; // actual metric value
  score: number; // weighted score contribution
  maxScore: number; // maximum possible weighted score
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
}

// ── Sales / Targets ──

export interface SalesData {
  entityId: string;
  entityType: "channel" | "store" | "product";
  period: string; // "YYYY-MM"
  salesValue: number;
  salesUnits: number;
  previousPeriodSalesValue?: number;
  previousPeriodSalesUnits?: number;
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
