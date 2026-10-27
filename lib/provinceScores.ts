import type { KpiKey, NdDetailRow, SalesData, SalesGrowthMetric, ScorecardStore } from "./types";
import { salesGrowthPercent } from "./scoreEngine";

const PROVINCES: Record<string, string> = {
  gauteng: "Gauteng", gp: "Gauteng", gt: "Gauteng", gau: "Gauteng", tshwane: "Gauteng",
  // Spellings seen in the store master (27 Oct).
  "westen cape": "Western Cape", polokwae: "Limpopo", polokwane: "Limpopo",
  "western cape": "Western Cape", wc: "Western Cape",
  "eastern cape": "Eastern Cape", ec: "Eastern Cape",
  "northern cape": "Northern Cape", nc: "Northern Cape",
  "kwazulu-natal": "KwaZulu-Natal", "kwazulu natal": "KwaZulu-Natal", kzn: "KwaZulu-Natal", "kwa-zulu natal": "KwaZulu-Natal", natal: "KwaZulu-Natal",
  "free state": "Free State", fs: "Free State", ofs: "Free State",
  limpopo: "Limpopo", lp: "Limpopo", lim: "Limpopo", "northern province": "Limpopo",
  mpumalanga: "Mpumalanga", mp: "Mpumalanga", mpu: "Mpumalanga",
  "north west": "North West", "north-west": "North West", nw: "North West",
};

/** One spelling per province ("GP", "gauteng " → "Gauteng"); blank → "Unknown". */
export function provinceName(raw: string | undefined): string {
  const s = (raw ?? "").trim();
  if (!s || /^n\/?a$/i.test(s)) return "Unknown";
  return PROVINCES[s.toLowerCase().replace(/\s+/g, " ")] ?? s;
}

export interface ProvinceGroup {
  id: string; // province, or "channel|province"
  name: string;
  percents: Record<KpiKey, number | null>;
  present: Record<KpiKey, boolean>;
}

/**
 * Roll store-level KPI data up to provinces (by "province") or to channel ×
 * province (by "channel"). Sales and ND add up the underlying figures, so they
 * are exact. OOS averages the store % over EVERY store in a channel that has
 * OOS data (stores with no OOS lines count as 0%, as on the channel scorecard);
 * every store's OOS denominator is the product count, so this is exact.
 * Sales in "Set Rand Value Target" mode: provinces have no target, so they
 * score YTD growth on the growth points table.
 * shortcut: Phantom averages store % the same way, but each store's real
 * denominator is its ranged count (not kept in the snapshot), so it is close,
 * not exact; store per-store counts in the sync if provinces need it exact.
 */
export function provinceGroups(opts: {
  by: "province" | "channel";
  stores: ScorecardStore[]; // after filters
  allStores: ScorecardStore[]; // before filters: which channels carry each KPI
  sales: SalesData[]; // store level
  ndRows: NdDetailRow[]; // ND detail; store-level rows are used
  oos: Record<string, number>; // store id -> %
  phantom: Record<string, number>; // store id -> %
  covered: (kpi: KpiKey, storeId: string) => boolean;
  metric: SalesGrowthMetric;
}): ProvinceGroup[] {
  const salesById = new Map(opts.sales.map((s) => [s.entityId, s]));
  const ndBySite = new Map(opts.ndRows.filter((r) => r.level === "store").map((r) => [r.siteCode, r]));
  const groups = new Map<string, { name: string; stores: ScorecardStore[] }>();
  for (const st of opts.stores) {
    const prov = provinceName(st.region);
    const id = opts.by === "province" ? prov : `${st.channelName}|${prov}`;
    const g = groups.get(id) ?? { name: opts.by === "province" ? prov : `${st.channelName} · ${prov}`, stores: [] };
    g.stores.push(st);
    groups.set(id, g);
  }

  // OOS/Phantom come per channel (PnP has them, SPAR not): a store counts when
  // its channel has that KPI, even if the store itself had no lines (= 0%).
  const channelsWith = (kpi: KpiKey) =>
    new Set(opts.allStores.filter((s) => opts.covered(kpi, s.id)).map((s) => s.channelName));
  const oosChannels = channelsWith("oos");
  const phChannels = channelsWith("phantom_inventory");

  const avg = (vals: number[]) => (vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null);
  const out: ProvinceGroup[] = [];
  for (const [id, g] of groups) {
    const has = (kpi: KpiKey) => g.stores.filter((s) => opts.covered(kpi, s.id));

    // Sales: add the stores' figures, then work out growth on the totals.
    const sum: SalesData = { entityId: id, entityType: "store", period: "", salesValue: 0, salesUnits: 0,
      previousPeriodSalesValue: 0, mtdValue: 0, pyMtdValue: 0, lastMonthValue: 0 };
    for (const s of has("sales_growth")) {
      const d = salesById.get(s.id);
      if (!d) continue;
      sum.salesValue += d.salesValue || 0;
      sum.previousPeriodSalesValue! += d.previousPeriodSalesValue || 0;
      sum.mtdValue! += d.mtdValue || 0;
      sum.pyMtdValue! += d.pyMtdValue || 0;
      sum.lastMonthValue! += d.lastMonthValue || 0;
    }
    const growth = salesGrowthPercent(sum, opts.metric) ?? salesGrowthPercent(sum, "ytd_vs_ytd");

    // ND: distributed / ranged across the stores.
    let dist = 0;
    let ranged = 0;
    for (const s of has("numerical_distribution")) {
      const r = ndBySite.get(s.siteCode || s.id);
      dist += r?.rangedCount || 0;
      ranged += r?.totalCount || 0;
    }

    const oosStores = g.stores.filter((s) => oosChannels.has(s.channelName) && s.id in opts.oos);
    const phStores = g.stores.filter((s) => phChannels.has(s.channelName) && s.id in opts.phantom);
    out.push({
      id,
      name: g.name,
      percents: {
        sales_growth: growth,
        numerical_distribution: ranged > 0 ? Math.round((dist / ranged) * 1000) / 10 : null,
        oos: avg(oosStores.map((s) => opts.oos[s.id])),
        phantom_inventory: avg(phStores.map((s) => opts.phantom[s.id])),
      },
      present: {
        sales_growth: has("sales_growth").length > 0,
        numerical_distribution: ranged > 0,
        oos: oosStores.length > 0,
        phantom_inventory: phStores.length > 0,
      },
    });
  }
  return out;
}
