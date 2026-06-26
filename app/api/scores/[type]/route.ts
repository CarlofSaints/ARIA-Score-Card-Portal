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

    // KPI percentage blobs are stored per level. CAM derives from channel data.
    const lvl = type === "cam" ? "channel" : type;
    const [oosData, ndData, phantomData] = await Promise.all([
      readJson<Record<string, number>>(`${slug}/data/kpi/${period}/oos-${lvl}.json`, {}),
      readJson<Record<string, number>>(`${slug}/data/kpi/${period}/nd-${lvl}.json`, {}),
      readJson<Record<string, number>>(`${slug}/data/kpi/${period}/phantom-${lvl}.json`, {}),
    ]);

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
        const percents: Record<KpiKey, number | null> = {
          sales_growth: salesGrowthPercent(salesById.get(id), metric),
          numerical_distribution: at(ndData, id),
          phantom_inventory: at(phantomData, id),
          oos: at(oosData, id),
        };
        return buildEntityScore({
          entityId: id,
          entityName: name,
          entityType: type,
          period,
          percents,
          weightings,
          scoring,
        });
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
        const ch = m.channelIds;
        const percents: Record<KpiKey, number | null> = {
          sales_growth: avg(
            ch.map((id) => salesGrowthPercent(salesById.get(id), metric))
          ),
          numerical_distribution: avg(ch.map((id) => at(ndData, id))),
          phantom_inventory: avg(ch.map((id) => at(phantomData, id))),
          oos: avg(ch.map((id) => at(oosData, id))),
        };
        return buildEntityScore({
          entityId: m.id,
          entityName: m.camName,
          entityType: "cam",
          period,
          percents,
          weightings,
          scoring,
        });
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
