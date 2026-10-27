import type { EntityScore, KpiKey } from "./types";

// Drill-down: a scorecard KPI score links to that KPI's detail page, already
// filtered to the row that was clicked. The detail pages read these params on
// load (readDrillParams) and show them as removable filters.

export interface DrillParams {
  level?: string; // channel | store | product | detail
  channel?: string;
  store?: string; // site code (= store id)
  product?: string; // SKU (= product id)
  province?: string;
  kam?: string; // KAM user id
  period?: string; // YYYY-MM; absent = current month
}

const PAGE: Record<KpiKey, string> = {
  sales_growth: "/sales",
  numerical_distribution: "/nd",
  oos: "/oos",
  phantom_inventory: "/phantom-store",
};

/** Detail-page link for one KPI cell of a scorecard row, or null when there is nowhere useful to go. */
export function drillHref(kpi: KpiKey, type: EntityScore["entityType"], entityId: string, period?: string): string | null {
  const nd = kpi === "numerical_distribution";
  let p: DrillParams;
  if (type === "channel") p = { channel: entityId, level: "store" };
  // ND keeps no store × SKU lines, so a store/product lands on its own ND row.
  else if (type === "store") p = { store: entityId, level: nd ? "store" : "detail" };
  else if (type === "product") p = { product: entityId, level: nd ? "product" : "detail" };
  else if (type === "cam") p = { kam: entityId, level: "channel" };
  else if (type === "province") {
    // Only OOS + Phantom rows carry a province.
    if (kpi !== "oos" && kpi !== "phantom_inventory") return null;
    const [a, b] = entityId.includes("|") ? entityId.split("|") : [undefined, entityId];
    p = { province: b, channel: a, level: "store" };
  } else return null;
  if (period) p.period = period;
  const qs = new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => !!e[1]));
  return `${PAGE[kpi]}?${qs}`;
}

/** Drill params from the current URL (read once on load, client side only). */
export function readDrillParams(): DrillParams {
  if (typeof window === "undefined") return {};
  const q = new URLSearchParams(window.location.search);
  const get = (k: keyof DrillParams) => q.get(k) || undefined;
  return {
    level: get("level"), channel: get("channel"), store: get("store"), product: get("product"),
    province: get("province"), kam: get("kam"), period: get("period"),
  };
}
