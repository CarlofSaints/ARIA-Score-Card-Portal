import type {
  KpiWeighting,
  KpiScore,
  EntityScore,
  SalesData,
  KpiKey,
  ScoreBracket,
  KpiScoringConfig,
  SalesGrowthMetric,
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

// ── Bracket-based scoring (current model) ────────────────────────────────────

/**
 * Award points for a metric value using the KPI's configured brackets. The
 * first bracket whose [min, max] contains the value wins (brackets are stored
 * low→high). Points are clamped to [0, weight] so a KPI can never contribute
 * more than its weight (the points pool). Returns 0 when no bracket matches.
 */
export function pointsForValue(
  value: number,
  brackets: ScoreBracket[],
  weight: number
): number {
  for (const b of brackets) {
    if (value >= b.min && value <= b.max) {
      return Math.max(0, Math.min(b.points, weight));
    }
  }
  return 0;
}

/**
 * Compute the sales growth % for the selected metric, or null when the prior
 * value is missing/zero (no meaningful growth → caller scores it 0).
 *  - ytd_vs_ytd : YTD vs PY YTD
 *  - tm_vs_tmly : MTD vs PY MTD (this month vs same month last year)
 *  - tm_vs_lm   : MTD vs last calendar month — inert until GetSales_PNP returns LM
 */
export function salesGrowthPercent(
  sd: SalesData | undefined,
  metric: SalesGrowthMetric
): number | null {
  if (!sd) return null;
  const pct = (cur: number | undefined, prev: number | undefined): number | null =>
    prev && prev > 0 ? Math.round((((cur ?? 0) - prev) / prev) * 1000) / 10 : null;
  if (metric === "tm_vs_tmly") return pct(sd.mtdValue, sd.pyMtdValue);
  if (metric === "tm_vs_lm") return pct(sd.mtdValue, sd.lastMonthValue);
  return pct(sd.salesValue, sd.previousPeriodSalesValue);
}

/**
 * Build an entity's full score from its KPI metric percentages and the tenant's
 * weightings + bracket config.
 *
 * `percents` carries the display metric for each KPI (sales = growth %,
 * ND/Phantom/OOS = the level %). `present` says whether the entity has data for
 * each KPI (e.g. SPAR has Sales + ND but no OOS/Phantom). KPIs that are NOT
 * present are marked `na` (shown as "—"); their points are REDISTRIBUTED over
 * the present KPIs in proportion to the present KPIs' own weights, so the entity
 * is still scored out of the full pool (100). This is the "split the delta over
 * the other KPIs by the same proportion" behaviour.
 */
export function buildEntityScore(params: {
  entityId: string;
  entityName: string;
  entityType: EntityScore["entityType"];
  period: string;
  percents: Record<KpiKey, number | null>;
  weightings: KpiWeighting[];
  scoring: KpiScoringConfig[];
  present?: Record<KpiKey, boolean>;
}): EntityScore {
  const keys: KpiKey[] = [
    "sales_growth",
    "phantom_inventory",
    "numerical_distribution",
    "oos",
  ];
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const weightOf = (k: KpiKey) => params.weightings.find((w) => w.key === k)?.weight ?? 0;
  const isPresent = (k: KpiKey) => params.present?.[k] ?? true;

  // Scale present KPIs up so they share the whole pool (redistributes the
  // weights of the absent KPIs in proportion to the present ones' weights).
  const totalWeight = keys.reduce((s, k) => s + weightOf(k), 0);
  const presentWeight = keys.filter(isPresent).reduce((s, k) => s + weightOf(k), 0);
  const scale = presentWeight > 0 ? totalWeight / presentWeight : 1;

  const kpiScores: KpiScore[] = keys.map((key) => {
    const weight = weightOf(key);
    if (!isPresent(key)) {
      return { kpiKey: key, rawValue: 0, percent: undefined, score: 0, maxScore: 0, na: true };
    }
    const brackets = params.scoring.find((s) => s.key === key)?.brackets ?? [];
    const percent = params.percents[key];
    const rawPoints = percent === null ? 0 : pointsForValue(percent, brackets, weight);
    const score = r1(rawPoints * scale);
    const maxScore = r1(weight * scale);
    return {
      kpiKey: key,
      rawValue: maxScore > 0 ? r1((score / maxScore) * 100) : 0,
      percent: percent === null ? undefined : percent,
      score,
      maxScore,
    };
  });

  const totalScore = kpiScores.reduce((sum, k) => sum + k.score, 0);
  const maxPossibleScore = kpiScores.reduce((sum, k) => sum + k.maxScore, 0);

  return {
    entityId: params.entityId,
    entityName: params.entityName,
    entityType: params.entityType,
    period: params.period,
    kpiScores,
    totalScore: r1(totalScore),
    maxPossibleScore: r1(maxPossibleScore),
  };
}

/**
 * Rank entities by totalScore (descending).
 */
export function rankScores(scores: EntityScore[]): EntityScore[] {
  const sorted = [...scores].sort((a, b) => b.totalScore - a.totalScore);
  return sorted.map((s, i) => ({ ...s, rank: i + 1 }));
}
