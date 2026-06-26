import type { ModuleDef, ModuleKey, KpiDef, KpiKey, KpiScoringConfig } from "./types";

export const MODULE_DEFS: ModuleDef[] = [
  {
    key: "cam_scorecard",
    label: "CAM Score Card",
    route: "/cam-scorecard",
    icon: "Users",
    description: "Scores CAMs across their assigned channels and brands",
  },
  {
    key: "channel_scorecard",
    label: "Channel Score Card",
    route: "/channel-scorecard",
    icon: "Store",
    description: "Scores retail channels",
  },
  {
    key: "store_scorecard",
    label: "Store Score Card",
    route: "/store-scorecard",
    icon: "MapPin",
    description: "Scores individual stores",
  },
  {
    key: "product_scorecard",
    label: "Product Score Card",
    route: "/product-scorecard",
    icon: "Package",
    description: "Scores products and SKUs",
  },
];

export function getModuleDef(key: ModuleKey): ModuleDef | undefined {
  return MODULE_DEFS.find((m) => m.key === key);
}

export const KPI_DEFS: KpiDef[] = [
  {
    key: "sales_growth",
    label: "Sales & Sales Growth",
    shortLabel: "Sales",
    description: "Sales performance vs targets and period-on-period growth",
    defaultWeight: 40,
  },
  {
    key: "phantom_inventory",
    label: "Phantom Inventory",
    shortLabel: "Phantom",
    description: "Identification and resolution of phantom stock discrepancies",
    defaultWeight: 20,
  },
  {
    key: "numerical_distribution",
    label: "Numerical Distribution",
    shortLabel: "ND",
    description: "Breadth of product availability across stores",
    defaultWeight: 25,
  },
  {
    key: "oos",
    label: "Out of Stocks",
    shortLabel: "OOS",
    description: "Out-of-stock frequency and resolution speed",
    defaultWeight: 15,
  },
];

export function getKpiDef(key: KpiKey): KpiDef | undefined {
  return KPI_DEFS.find((k) => k.key === key);
}

export function getDefaultKpiWeightings() {
  return KPI_DEFS.map((k) => ({ key: k.key, weight: k.defaultWeight }));
}

// Default points brackets per KPI. The top bracket's points should match the
// KPI's default weight (the points pool). Sales is growth-based (default metric
// YTD vs YTD) where higher growth → more points; ND higher % → more points;
// Phantom/OOS lower % → more points. The admin tunes these in Control Centre.
export function getDefaultKpiScoring(): KpiScoringConfig[] {
  return [
    {
      key: "sales_growth",
      salesGrowthMetric: "ytd_vs_ytd",
      brackets: [
        { min: -1000, max: 0, points: 0 },
        { min: 0, max: 10, points: 10 },
        { min: 10, max: 30, points: 25 },
        { min: 30, max: 1000, points: 40 },
      ],
    },
    {
      key: "numerical_distribution",
      brackets: [
        { min: 0, max: 50, points: 0 },
        { min: 50, max: 70, points: 10 },
        { min: 70, max: 90, points: 18 },
        { min: 90, max: 1000, points: 25 },
      ],
    },
    {
      key: "phantom_inventory",
      brackets: [
        { min: 0, max: 5, points: 20 },
        { min: 5, max: 10, points: 12 },
        { min: 10, max: 20, points: 6 },
        { min: 20, max: 100, points: 0 },
      ],
    },
    {
      key: "oos",
      brackets: [
        { min: 0, max: 5, points: 15 },
        { min: 5, max: 10, points: 9 },
        { min: 10, max: 20, points: 4 },
        { min: 20, max: 100, points: 0 },
      ],
    },
  ];
}
