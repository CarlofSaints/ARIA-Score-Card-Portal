import { NextRequest } from "next/server";
import { requireLogin, requirePermission, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { readJson } from "@/lib/blob";
import { getKpiWeightings } from "@/lib/kpiData";
import { getKpiScoring } from "@/lib/scoringData";
import { buildEntityScore, pointsForValue, rankScores, salesGrowthPercent } from "@/lib/scoreEngine";
import { scoreSalesTargets, type SalesHistory } from "@/lib/salesTargets";
import { provinceGroups, provinceName, storeShown } from "@/lib/provinceScores";
import { getTenantConfig } from "@/lib/getTenantConfig";
import type {
  ScorecardChannel,
  ScorecardStore,
  ScorecardProduct,
  SalesData,
  EntityScore,
  CamMapping,
  KpiKey,
  SalesGrowthMetric,
  PermissionKey,
  NdDetailRow,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type ScoreType = "cam" | "channel" | "store" | "product" | "province";

// Same permission each scorecard page's PermissionGate uses.
const VIEW_PERMS: Record<ScoreType, PermissionKey> = {
  cam: "view_cam_scorecard",
  // Province scores are rolled up from store data, so they share its permission.
  province: "view_store_scorecard",
  channel: "view_channel_scorecard",
  store: "view_store_scorecard",
  product: "view_product_scorecard",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params;
    if (!Object.hasOwn(VIEW_PERMS, type)) {
      await requireLogin(req);
      return Response.json(
        { error: "Invalid score type" },
        { status: 400, headers: noCacheHeaders() }
      );
    }
    await requirePermission(req, VIEW_PERMS[type as ScoreType]);
    const slug = await getTenantSlug();

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const period =
      searchParams.get("period") ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Optional KAM filter (channel/store/product scorecards only). CamMapping
    // stores channel/brand NAMES; an empty owned-list means "no restriction on
    // that dimension" — same rule as the detail pages' useKamFilter.
    const camId = searchParams.get("cam");
    let camMapping: CamMapping | null = null;
    if (camId && camId !== "all" && type !== "cam") {
      const mappings = await readJson<CamMapping[]>(`${slug}/cam-mappings.json`, []);
      camMapping = mappings.find((m) => m.camUserId === camId) || null;
    }
    // Optional channel filter (store scorecard): channel NAME, like the KAM filter.
    const channelQ = type === "store" ? searchParams.get("channel") : null;

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

    // KPI percentage blobs are stored per level. KAM derives from channel data.
    const lvl = type === "cam" ? "channel" : type === "province" ? "store" : type;
    type CoverSet = { channels: string[]; stores: string[]; products: string[] };
    type Coverage = { sales?: CoverSet; nd?: CoverSet; oos?: CoverSet; phantom?: CoverSet };
    const [oosData, ndData, phantomData, coverage] = await Promise.all([
      readJson<Record<string, number>>(`${slug}/data/kpi/${period}/oos-${lvl}.json`, {}),
      readJson<Record<string, number>>(`${slug}/data/kpi/${period}/nd-${lvl}.json`, {}),
      readJson<Record<string, number>>(`${slug}/data/kpi/${period}/phantom-${lvl}.json`, {}),
      readJson<Coverage>(`${slug}/data/kpi/${period}/coverage.json`, {}),
    ]);

    // Per-KPI coverage. Different channels carry different KPIs (PnP has all
    // four; SPAR has only Sales + ND). KAM gates on channel coverage. If no
    // per-KPI coverage is recorded yet (pre-resync), treat everything as present
    // so behaviour is unchanged until the next sync writes the new coverage.
    const entityField: keyof CoverSet =
      type === "product" ? "products" : type === "store" || type === "province" ? "stores" : "channels";
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

    // "Set Rand Value Target" scoring for Sales at one level, or null when that
    // level scores growth. Channel ids = channel names.
    const salesCfg = scoring.find((s) => s.key === "sales_growth");
    const salesTargetsFor = async (
      level: "channel" | "store" | "product",
      ids: string[],
      ytd?: Map<string, number>,
      stores?: ScorecardStore[]
    ) => {
      if (metric !== "rand_target" || !salesCfg) return null;
      if (level !== "channel" && salesCfg.targetCascade !== "target") return null;
      const [history, channels] = await Promise.all([
        readJson<SalesHistory>(`${slug}/data/sales/monthly-history.json`, {}),
        level === "product" ? readJson<ScorecardChannel[]>(`${slug}/data/channels.json`, []) : Promise.resolve([]),
      ]);
      return scoreSalesTargets({
        cfg: salesCfg, level, period, history, ids, ytd, stores,
        channelIds: channels.map((c) => c.id),
      });
    };

    let scores: EntityScore[] = [];
    let options: { provinces: string[]; subChannels: string[] } | undefined;

    if (type === "province") {
      // Province grid (?by=province) or channel × province grid (?by=channel).
      // Filters repeat: &ch=PnP&ch=SPAR, &prov=Gauteng, &sub=CORP.
      const [allStores, storeSales, ndRows, tenantCfg] = await Promise.all([
        readJson<ScorecardStore[]>(`${slug}/data/stores.json`, []),
        readJson<SalesData[]>(`${slug}/data/sales/${period}/stores.json`, []),
        readJson<NdDetailRow[]>(`${slug}/data/nd/${period}/detail.json`, []),
        getTenantConfig(slug),
      ]);
      // Admin's country/province lists (Control Centre): stores elsewhere are left out entirely.
      const stores = allStores.filter((s) => storeShown(s, tenantCfg));
      const ch = searchParams.getAll("ch");
      const prov = searchParams.getAll("prov");
      const sub = searchParams.getAll("sub");
      const pool = stores.filter(
        (st) =>
          (!camMapping || !camMapping.channelIds.length || camMapping.channelIds.includes(st.channelName)) &&
          (!ch.length || ch.includes(st.channelName)) &&
          (!sub.length || sub.includes(st.subChannel ?? "")) &&
          (!prov.length || prov.includes(provinceName(st.region)))
      );
      options = {
        provinces: Array.from(new Set(stores.map((s) => provinceName(s.region)))).sort(),
        subChannels: Array.from(new Set(stores.map((s) => s.subChannel).filter((s): s is string => !!s))).sort(),
      };
      scores = provinceGroups({
        by: searchParams.get("by") === "channel" ? "channel" : "province",
        stores: pool,
        allStores: stores,
        sales: storeSales,
        ndRows,
        oos: oosData,
        phantom: phantomData,
        covered: (kpi, id) => presentFor(kpi, id),
        metric,
      }).map((g) => {
        const score = buildEntityScore({
          entityId: g.id,
          entityName: g.name,
          entityType: "province",
          period,
          percents: g.percents,
          weightings,
          scoring,
          present: g.present,
        });
        score.hasData = KPI_KEYS.some((k) => g.present[k]);
        return score;
      });
    } else if (type === "channel" || type === "store" || type === "product") {
      const entityFile =
        type === "channel" ? "channels" : type === "store" ? "stores" : "products";
      const [entities, sales, tenantCfg] = await Promise.all([
        readJson<(ScorecardChannel | ScorecardStore | ScorecardProduct)[]>(
          `${slug}/data/${type === "channel" ? "channels" : type === "store" ? "stores" : "products"}.json`,
          []
        ),
        readJson<SalesData[]>(`${slug}/data/sales/${period}/${entityFile}.json`, []),
        type === "store" ? getTenantConfig(slug) : Promise.resolve(null),
      ]);
      const salesById = new Map(sales.map((s) => [s.entityId, s]));

      // Sales vs Rand target (null = this level scores growth as before).
      const targetScores = await salesTargetsFor(
        type,
        entities.map((e) => e.id),
        new Map(sales.map((s) => [s.entityId, s.salesValue || 0])),
        type === "store" ? (entities as ScorecardStore[]) : undefined
      );

      // A KAM owns channels (channel/store grain) and brands (product grain).
      const belongs = (e: ScorecardChannel | ScorecardStore | ScorecardProduct): boolean => {
        if (!camMapping) return true;
        if (type === "product") {
          const brand = (e as ScorecardProduct).brand;
          return !camMapping.brandIds.length || camMapping.brandIds.includes(brand);
        }
        const ch = type === "channel" ? (e as ScorecardChannel).name : (e as ScorecardStore).channelName;
        return !camMapping.channelIds.length || camMapping.channelIds.includes(ch);
      };

      const inScope = entities.filter(
        (e) =>
          belongs(e) &&
          (!channelQ || channelQ === "all" || (e as ScorecardStore).channelName === channelQ) &&
          // Store rows follow the Control Centre country/province lists (rows only:
          // target shares above still use the whole channel).
          (type !== "store" || storeShown(e as ScorecardStore, tenantCfg))
      );

      // ND is row-driven off the ranging list, so an entity with no ranged SKUs
      // gets no ND% at all. Flag it "not ranged" only when ND did sync for it:
      // a store whose channel has other stores with ND, or any product once ND ran.
      // DCs are never in the ranging pull, so they stay a plain "—".
      const isDc = (e: ScorecardChannel | ScorecardStore | ScorecardProduct) =>
        (e as ScorecardStore).subChannel?.toUpperCase().startsWith("DC") ?? false;
      const ndStoreChannels = new Set(
        type === "store"
          ? (entities as ScorecardStore[]).filter((s) => cov.numerical_distribution.has(s.id)).map((s) => s.channelName)
          : []
      );
      const ndNotRanged = (e: ScorecardChannel | ScorecardStore | ScorecardProduct) =>
        coverageKnown &&
        !cov.numerical_distribution.has(e.id) &&
        !isDc(e) &&
        (type === "product"
          ? cov.numerical_distribution.size > 0
          : type === "store" && ndStoreChannels.has((e as ScorecardStore).channelName));

      scores = inScope.map((e) => {
        const id = e.id;
        const name = "name" in e ? e.name : id;
        const target = targetScores?.get(id);
        const present: Record<KpiKey, boolean> = {
          // In target mode an entity without a target shows "—" for Sales.
          sales_growth: presentFor("sales_growth", id) && (!targetScores || !!target),
          numerical_distribution: presentFor("numerical_distribution", id),
          phantom_inventory: presentFor("phantom_inventory", id),
          oos: presentFor("oos", id),
        };
        const percents: Record<KpiKey, number | null> = {
          sales_growth: !present.sales_growth ? null : target ? target.percent : growth(salesById.get(id)),
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
          brackets: target ? { sales_growth: target.brackets } : undefined,
        });
        score.hasData = KPI_KEYS.some((k) => present[k]);
        if (ndNotRanged(e)) {
          const nd = score.kpiScores.find((k) => k.kpiKey === "numerical_distribution");
          if (nd?.na) nd.notRanged = true;
        }
        return score;
      });
    } else {
      // KAM = average of the assigned channels' metrics.
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

      // Target mode: each channel scores on its own target + points table; the
      // KAM gets the average of those channel points (and of the % achieved).
      const channelTargets = await salesTargetsFor(
        "channel",
        Array.from(new Set(mappings.flatMap((m) => m.channelIds)))
      );
      const salesWeight = weightings.find((w) => w.key === "sales_growth")?.weight ?? 0;

      scores = mappings.map((m) => {
        // Per KPI, average only over the KAM's channels that have THAT KPI's
        // data. So a KAM over PnP+SPAR gets OOS from PnP only, while Sales/ND
        // average both. Empty channels never dilute (the Jaryd fix), and a KPI
        // no mapped channel has becomes "—" (its points redistribute).
        const chFor = (kpi: KpiKey) =>
          m.channelIds.filter((id) => presentFor(kpi, id) && (kpi !== "sales_growth" || !channelTargets || channelTargets.has(id)));
        const salesTargetsOf = chFor("sales_growth").map((id) => channelTargets?.get(id)).filter((t) => !!t);
        const present: Record<KpiKey, boolean> = {
          sales_growth: chFor("sales_growth").length > 0,
          numerical_distribution: chFor("numerical_distribution").length > 0,
          phantom_inventory: chFor("phantom_inventory").length > 0,
          oos: chFor("oos").length > 0,
        };
        const percents: Record<KpiKey, number | null> = {
          sales_growth: !present.sales_growth
            ? null
            : channelTargets
              ? avg(salesTargetsOf.map((t) => t.percent))
              : avg(chFor("sales_growth").map((id) => growth(salesById.get(id)))),
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
          points:
            channelTargets && salesTargetsOf.length
              ? { sales_growth: avg(salesTargetsOf.map((t) => pointsForValue(t.percent, t.brackets, salesWeight)))! }
              : undefined,
        });
        score.hasData = KPI_KEYS.some((k) => present[k]);
        return score;
      });
    }

    const ranked = rankScores(scores);
    return Response.json(
      { scores: ranked, period, options },
      { headers: noCacheHeaders() }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}
