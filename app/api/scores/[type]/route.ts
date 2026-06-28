import { NextRequest } from "next/server";
import { requireLogin, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { readJson } from "@/lib/blob";
import { getKpiWeightings } from "@/lib/kpiData";
import { getKpiScoring } from "@/lib/scoringData";
import { buildEntityScore, rankScores, salesGrowthPercent } from "@/lib/scoreEngine";
import type {
  ScorecardChannel,
  ScorecardStore,
  ScorecardProduct,
  SalesData,
  EntityScore,
  CamMapping,
  KpiKey,
  SalesGrowthMetric,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type ScoreType = "cam" | "channel" | "store" | "product";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    requireLogin(req);
    const slug = await getTenantSlug();
    const { type } = await params;

    const validTypes: ScoreType[] = ["cam", "channel", "store", "product"];
    if (!validTypes.includes(type as ScoreType)) {
      return Response.json(
        { error: "Invalid score type" },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const period =
      searchParams.get("period") ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const weightings = await getKpiWeightings(slug);
    const scoring = await getKpiScoring(slug);
    const metric: SalesGrowthMetric =
      scoring.find((s) => s.key === "sales_growth")?.salesGrowthMetric ??
      "ytd_vs_ytd";

    // Sales growth for the configured metric, falling back to YTD-vs-YTD when the
    // chosen month-metric has no prior-period baseline (e.g. a new channel with
    // no same-month-last-year sales → ÷0 → null). Returns null only if YTD also
    // has no baseline.
    const growth = (sd: SalesData | undefined): number | null => {
      const primary = salesGrowthPercent(sd, metric);
      if (primary !== null || metric === "ytd_vs_ytd") return primary;
      return salesGrowthPercent(sd, "ytd_vs_ytd");
    };

    // KPI percentage blobs are stored per level. CAM derives from channel data.
    const lvl = type === "cam" ? "channel" : type;
    type CoverSet = { channels: string[]; stores: string[]; products: string[] };
    type Coverage = { sales?: CoverSet; nd?: CoverSet; oos?: CoverSet; phantom?: CoverSet };
    const [oosData, ndData, phantomData, coverage] = await Promise.all([
      readJson<Record<string, number>>(`${slug}/data/kpi/${period}/oos-${lvl}.json`, {}),
      readJson<Record<string, number>>(`${slug}/data/kpi/${period}/nd-${lvl}.json`, {}),
      readJson<Record<string, number>>(`${slug}/data/kpi/${period}/phantom-${lvl}.json`, {}),
      readJson<Coverage>(`${slug}/data/kpi/${period}/coverage.json`, {}),
    ]);

    // Per-KPI coverage. Different channels carry different KPIs (PnP has all
    // four; SPAR has only Sales + ND). CAM gates on channel coverage. If no
    // per-KPI coverage is recorded yet (pre-resync), treat everything as present
    // so behaviour is unchanged until the next sync writes the new coverage.
    const entityField: keyof CoverSet =
      type === "product" ? "products" : type === "store" ? "stores" : "channels";
    const covSet = (src?: CoverSet) => new Set(src?.[entityField] ?? []);
    const cov: Record<KpiKey, Set<string>> = {
      sales_growth: covSet(coverage.sales),
      numerical_distribution: covSet(coverage.nd),
      oos: covSet(coverage.oos),
      phantom_inventory: covSet(coverage.phantom),
    };
    const coverageKnown = (Object.values(cov) as Set<string>[]).some((s) => s.size > 0);
    const presentFor = (kpi: KpiKey, id: string) => !coverageKnown || cov[kpi].has(id);
    const KPI_KEYS: KpiKey[] = [
      "sales_growth",
      "numerical_distribution",
      "phantom_inventory",
      "oos",
    ];

    const at = (rec: Record<string, number>, id: string): number | null =>
      id in rec ? rec[id] : null;

    let scores: EntityScore[] = [];

    if (type === "channel" || type === "store" || type === "product") {
      const entityFile =
        type === "channel" ? "channels" : type === "store" ? "stores" : "products";
      const [entities, sales] = await Promise.all([
        readJson<(ScorecardChannel | ScorecardStore | ScorecardProduct)[]>(
          `${slug}/data/${type === "channel" ? "channels" : type === "store" ? "stores" : "products"}.json`,
          []
        ),
        readJson<SalesData[]>(`${slug}/data/sales/${period}/${entityFile}.json`, []),
      ]);
      const salesById = new Map(sales.map((s) => [s.entityId, s]));

      scores = entities.map((e) => {
        const id = e.id;
        const name = "name" in e ? e.name : id;
        const present: Record<KpiKey, boolean> = {
          sales_growth: presentFor("sales_growth", id),
          numerical_distribution: presentFor("numerical_distribution", id),
          phantom_inventory: presentFor("phantom_inventory", id),
          oos: presentFor("oos", id),
        };
        const percents: Record<KpiKey, number | null> = {
          sales_growth: present.sales_growth ? growth(salesById.get(id)) : null,
          numerical_distribution: present.numerical_distribution ? at(ndData, id) : null,
          phantom_inventory: present.phantom_inventory ? at(phantomData, id) : null,
          oos: present.oos ? at(oosData, id) : null,
        };
        const score = buildEntityScore({
          entityId: id,
          entityName: name,
          entityType: type,
          period,
          percents,
          weightings,
          scoring,
          present,
        });
        score.hasData = KPI_KEYS.some((k) => present[k]);
        return score;
      });
    } else {
      // CAM = average of the assigned channels' metrics.
      const mappings = await readJson<CamMapping[]>(`${slug}/cam-mappings.json`, []);
      const sales = await readJson<SalesData[]>(
        `${slug}/data/sales/${period}/channels.json`,
        []
      );
      const salesById = new Map(sales.map((s) => [s.entityId, s]));

      const avg = (vals: (number | null)[]): number | null => {
        const nums = vals.filter((v): v is number => v !== null);
        return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      };

      scores = mappings.map((m) => {
        // Per KPI, average only over the CAM's channels that have THAT KPI's
        // data. So a CAM over PnP+SPAR gets OOS from PnP only, while Sales/ND
        // average both. Empty channels never dilute (the Jaryd fix), and a KPI
        // no mapped channel has becomes "—" (its points redistribute).
        const chFor = (kpi: KpiKey) =>
          m.channelIds.filter((id) => presentFor(kpi, id));
        const present: Record<KpiKey, boolean> = {
          sales_growth: chFor("sales_growth").length > 0,
          numerical_distribution: chFor("numerical_distribution").length > 0,
          phantom_inventory: chFor("phantom_inventory").length > 0,
          oos: chFor("oos").length > 0,
        };
        const percents: Record<KpiKey, number | null> = {
          sales_growth: present.sales_growth
            ? avg(chFor("sales_growth").map((id) => growth(salesById.get(id))))
            : null,
          numerical_distribution: present.numerical_distribution
            ? avg(chFor("numerical_distribution").map((id) => at(ndData, id)))
            : null,
          phantom_inventory: present.phantom_inventory
            ? avg(chFor("phantom_inventory").map((id) => at(phantomData, id)))
            : null,
          oos: present.oos ? avg(chFor("oos").map((id) => at(oosData, id))) : null,
        };
        const score = buildEntityScore({
          entityId: m.id,
          entityName: m.camName,
          entityType: "cam",
          period,
          percents,
          weightings,
          scoring,
          present,
        });
        score.hasData = KPI_KEYS.some((k) => present[k]);
        return score;
      });
    }

    const ranked = rankScores(scores);
    return Response.json(
      { scores: ranked, period },
      { headers: noCacheHeaders() }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}
