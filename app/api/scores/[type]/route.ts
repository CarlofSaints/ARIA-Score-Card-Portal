import { NextRequest } from "next/server";
import { requireLogin, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { readJson } from "@/lib/blob";
import { getKpiWeightings } from "@/lib/kpiData";
import { calcEntityScore, rankScores, calcSalesPerformance } from "@/lib/scoreEngine";
import type {
  ScorecardChannel,
  ScorecardStore,
  ScorecardProduct,
  SalesData,
  EntityScore,
  CamMapping,
  KpiKey,
} from "@/lib/types";

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

    let scores: EntityScore[] = [];

    // Load ND data from blob (populated by /api/sync)
    const ndKey = type === "cam" ? "channel" : type;
    const ndData = await readJson<Record<string, number>>(
      `${slug}/data/kpi/${period}/nd-${ndKey}.json`,
      {}
    );

    if (type === "channel") {
      const channels = await readJson<ScorecardChannel[]>(
        `${slug}/data/channels.json`,
        []
      );
      const sales = await readJson<SalesData[]>(
        `${slug}/data/sales/${period}/channels.json`,
        []
      );

      scores = channels.map((ch) => {
        const sd = sales.find((s) => s.entityId === ch.id);
        const ndValue = ndData[ch.id] ?? Math.random() * 100;
        const kpiValues: { key: KpiKey; value: number }[] = [
          { key: "sales_growth", value: sd ? calcSalesPerformance(sd) : 50 },
          { key: "phantom_inventory", value: Math.random() * 100 },
          { key: "numerical_distribution", value: ndValue },
          { key: "oos", value: Math.random() * 100 },
        ];

        return calcEntityScore({
          entityId: ch.id,
          entityName: ch.name,
          entityType: "channel",
          period,
          kpiValues,
          weightings,
        });
      });
    } else if (type === "store") {
      const stores = await readJson<ScorecardStore[]>(
        `${slug}/data/stores.json`,
        []
      );
      const sales = await readJson<SalesData[]>(
        `${slug}/data/sales/${period}/stores.json`,
        []
      );

      scores = stores.map((st) => {
        const sd = sales.find((s) => s.entityId === st.id);
        const ndValue = ndData[st.id] ?? Math.random() * 100;
        const kpiValues: { key: KpiKey; value: number }[] = [
          { key: "sales_growth", value: sd ? calcSalesPerformance(sd) : 50 },
          { key: "phantom_inventory", value: Math.random() * 100 },
          { key: "numerical_distribution", value: ndValue },
          { key: "oos", value: Math.random() * 100 },
        ];

        return calcEntityScore({
          entityId: st.id,
          entityName: st.name,
          entityType: "store",
          period,
          kpiValues,
          weightings,
        });
      });
    } else if (type === "product") {
      const products = await readJson<ScorecardProduct[]>(
        `${slug}/data/products.json`,
        []
      );
      const sales = await readJson<SalesData[]>(
        `${slug}/data/sales/${period}/products.json`,
        []
      );

      scores = products.map((p) => {
        const sd = sales.find((s) => s.entityId === p.id);
        const ndValue = ndData[p.id] ?? Math.random() * 100;
        const kpiValues: { key: KpiKey; value: number }[] = [
          { key: "sales_growth", value: sd ? calcSalesPerformance(sd) : 50 },
          { key: "phantom_inventory", value: Math.random() * 100 },
          { key: "numerical_distribution", value: ndValue },
          { key: "oos", value: Math.random() * 100 },
        ];

        return calcEntityScore({
          entityId: p.id,
          entityName: p.name,
          entityType: "product",
          period,
          kpiValues,
          weightings,
        });
      });
    } else if (type === "cam") {
      const mappings = await readJson<CamMapping[]>(
        `${slug}/cam-mappings.json`,
        []
      );

      scores = mappings.map((m) => {
        // CAM ND = average ND of their assigned channels
        const camChannelNds = m.channelIds
          .map((chId) => ndData[chId])
          .filter((v): v is number => v !== undefined);
        const camNd = camChannelNds.length > 0
          ? camChannelNds.reduce((a, b) => a + b, 0) / camChannelNds.length
          : Math.random() * 100;

        const kpiValues: { key: KpiKey; value: number }[] = [
          { key: "sales_growth", value: Math.random() * 100 },
          { key: "phantom_inventory", value: Math.random() * 100 },
          { key: "numerical_distribution", value: camNd },
          { key: "oos", value: Math.random() * 100 },
        ];

        return calcEntityScore({
          entityId: m.id,
          entityName: m.camName,
          entityType: "cam",
          period,
          kpiValues,
          weightings,
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
