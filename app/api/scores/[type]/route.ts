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

    // Load OOS and Phantom data from blob
    const oosKey = type === "cam" ? "channel" : type;
    const phantomKey = type === "cam" ? "channel" : type;
    const oosData = await readJson<Record<string, number>>(
      `${slug}/data/kpi/${period}/oos-${oosKey}.json`,
      {}
    );
    const phantomData = await readJson<Record<string, number>>(
      `${slug}/data/kpi/${period}/phantom-${phantomKey}.json`,
      {}
    );

    let scores: EntityScore[] = [];

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
        const oosPercent = oosData[ch.id] ?? 50;
        const phantomPercent = phantomData[ch.id] ?? 50;

        const salesPerf = sd ? calcSalesPerformance(sd) : 50;
        const kpiValues: { key: KpiKey; value: number; percent: number }[] = [
          { key: "sales_growth", value: salesPerf, percent: salesPerf },
          { key: "phantom_inventory", value: 100 - phantomPercent, percent: phantomPercent },
          { key: "numerical_distribution", value: 50, percent: 50 },
          { key: "oos", value: 100 - oosPercent, percent: oosPercent },
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
        const oosPercent = oosData[st.id] ?? 50;
        const phantomPercent = phantomData[st.id] ?? 50;

        const salesPerf = sd ? calcSalesPerformance(sd) : 50;
        const kpiValues: { key: KpiKey; value: number; percent: number }[] = [
          { key: "sales_growth", value: salesPerf, percent: salesPerf },
          { key: "phantom_inventory", value: 100 - phantomPercent, percent: phantomPercent },
          { key: "numerical_distribution", value: 50, percent: 50 },
          { key: "oos", value: 100 - oosPercent, percent: oosPercent },
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
        const oosPercent = oosData[p.id] ?? 50;
        const phantomPercent = phantomData[p.id] ?? 50;

        const salesPerf = sd ? calcSalesPerformance(sd) : 50;
        const kpiValues: { key: KpiKey; value: number; percent: number }[] = [
          { key: "sales_growth", value: salesPerf, percent: salesPerf },
          { key: "phantom_inventory", value: 100 - phantomPercent, percent: phantomPercent },
          { key: "numerical_distribution", value: 50, percent: 50 },
          { key: "oos", value: 100 - oosPercent, percent: oosPercent },
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
      const sales = await readJson<SalesData[]>(
        `${slug}/data/sales/${period}/channels.json`,
        []
      );

      scores = mappings.map((m) => {
        // CAM Sales = average sales performance of assigned channels
        const camSalesValues = m.channelIds
          .map((chId) => sales.find((s) => s.entityId === chId))
          .filter((s): s is SalesData => !!s)
          .map((s) => calcSalesPerformance(s));
        const camSales = camSalesValues.length > 0
          ? camSalesValues.reduce((a, b) => a + b, 0) / camSalesValues.length
          : 50;

        // CAM OOS = average of assigned channels
        const camOosValues = m.channelIds
          .map((chId) => oosData[chId])
          .filter((v): v is number => v !== undefined);
        const camOos = camOosValues.length > 0
          ? camOosValues.reduce((a, b) => a + b, 0) / camOosValues.length
          : 50;

        // CAM Phantom = average of assigned channels
        const camPhantomValues = m.channelIds
          .map((chId) => phantomData[chId])
          .filter((v): v is number => v !== undefined);
        const camPhantom = camPhantomValues.length > 0
          ? camPhantomValues.reduce((a, b) => a + b, 0) / camPhantomValues.length
          : 50;

        const kpiValues: { key: KpiKey; value: number; percent: number }[] = [
          { key: "sales_growth", value: camSales, percent: camSales },
          { key: "phantom_inventory", value: 100 - camPhantom, percent: camPhantom },
          { key: "numerical_distribution", value: 50, percent: 50 },
          { key: "oos", value: 100 - camOos, percent: camOos },
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
