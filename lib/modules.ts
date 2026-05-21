import type { ModuleDef, ModuleKey, KpiDef, KpiKey } from "./types";

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
