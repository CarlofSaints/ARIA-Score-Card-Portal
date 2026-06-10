import type {
  KpiWeighting,
  KpiScore,
  EntityScore,
  SalesData,
  KpiKey,
} from "./types";

/**
 * Calculate a single KPI score for an entity.
 * rawValue = 0..100 representing performance percentage.
 * weight = the KPI weight from the client's config.
 * score = (rawValue / 100) * weight, capped at weight.
 */
export function calcKpiScore(
  kpiKey: KpiKey,
  rawValue: number,
  weight: number,
  percent?: number
): KpiScore {
  const capped = Math.max(0, Math.min(100, rawValue));
  const score = Math.round((capped / 100) * weight * 10) / 10;
  return {
    kpiKey,
    rawValue: capped,
    percent,
    score: Math.min(score, weight),
    maxScore: weight,
  };
}

/**
 * Calculate entity total score from all KPI scores.
 */
export function calcEntityScore(params: {
  entityId: string;
  entityName: string;
  entityType: EntityScore["entityType"];
  period: string;
  kpiValues: { key: KpiKey; value: number; percent?: number }[]; // value 0–100
  weightings: KpiWeighting[];
}): EntityScore {
  const kpiScores: KpiScore[] = params.kpiValues.map((kv) => {
    const w = params.weightings.find((w) => w.key === kv.key);
    return calcKpiScore(kv.key, kv.value, w?.weight ?? 0, kv.percent);
  });

  const totalScore = kpiScores.reduce((sum, k) => sum + k.score, 0);
  const maxPossibleScore = kpiScores.reduce((sum, k) => sum + k.maxScore, 0);

  return {
    entityId: params.entityId,
    entityName: params.entityName,
    entityType: params.entityType,
    period: params.period,
    kpiScores,
    totalScore: Math.round(totalScore * 10) / 10,
    maxPossibleScore,
  };
}

/**
 * Calculate sales KPI performance (0–100).
 * Uses variance to target if target exists, or YoY growth.
 */
export function calcSalesPerformance(data: SalesData): number {
  if (data.target && data.target > 0) {
    return Math.min(100, (data.salesValue / data.target) * 100);
  }
  if (data.previousPeriodSalesValue && data.previousPeriodSalesValue > 0) {
    const growth =
      ((data.salesValue - data.previousPeriodSalesValue) /
        data.previousPeriodSalesValue) *
      100;
    // Map -100..+100 growth to 0..100 score
    return Math.max(0, Math.min(100, 50 + growth / 2));
  }
  return 50; // no comparison data → neutral score
}

/**
 * Rank entities by totalScore (descending).
 */
export function rankScores(scores: EntityScore[]): EntityScore[] {
  const sorted = [...scores].sort((a, b) => b.totalScore - a.totalScore);
  return sorted.map((s, i) => ({ ...s, rank: i + 1 }));
}
