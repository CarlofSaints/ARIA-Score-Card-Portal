import type { KpiScoringConfig, SalesData, ScoreBracket, ScorecardStore } from "./types";
import { targetAchievement, targetFraction } from "./scoreEngine";

export interface TargetResult {
  percent: number; // % of target achieved (100 = on target)
  brackets: ScoreBracket[];
}

/** Month's Rand target for a channel, or null when none is set (or it is R0). */
export function channelTarget(cfg: KpiScoringConfig, channel: string, period: string): number | null {
  const [y, m] = period.split("-");
  const t = cfg.salesTargets?.find((s) => s.channel === channel)?.targets[y]?.[Number(m) - 1];
  return t && t > 0 ? t : null;
}

/** Calendar month after "YYYY-MM". */
export function nextPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/**
 * Score Sales against monthly Rand targets for one scorecard level. Returns
 * null when this level does not use targets (stores/SKUs left on growth, or
 * SKUs while some selling channel has no target), so the caller scores growth.
 * Entities missing from the returned map have no target: Sales shows "—".
 *
 * Month actual = the month's sales: the next month's snapshot carries the full
 * month (pfmValue); otherwise the month's own month-to-date figure. The current
 * month's target is pro-rated to the days so far.
 */
export function scoreSalesTargets(opts: {
  cfg: KpiScoringConfig;
  level: "channel" | "store" | "product";
  period: string;
  now: Date;
  sales: SalesData[]; // this level, this period
  nextSales: SalesData[]; // this level, next period (may be empty)
  stores?: ScorecardStore[]; // store level: for each store's channel
  channelSales?: SalesData[]; // product level: which channels sold this month
}): Map<string, TargetResult> | null {
  const { cfg, level, period } = opts;
  if (cfg.salesGrowthMetric !== "rand_target") return null;
  if (level !== "channel" && cfg.targetCascade !== "target") return null;

  const fraction = targetFraction(period, opts.now);
  const next = new Map(opts.nextSales.map((s) => [s.entityId, s.pfmValue]));
  const actual = (s: SalesData) => next.get(s.entityId) ?? s.mtdValue ?? 0;
  const bracketsOf = (channel: string) => cfg.salesTargets?.find((t) => t.channel === channel)?.brackets ?? [];
  const out = new Map<string, TargetResult>();

  if (level === "channel") {
    for (const s of opts.sales) {
      const pct = targetAchievement(actual(s), channelTarget(cfg, s.entityId, period), fraction);
      if (pct !== null) out.set(s.entityId, { percent: pct, brackets: bracketsOf(s.entityId) });
    }
    return out;
  }

  if (level === "store") {
    // A store's share of its channel target = its share of the channel's YTD sales.
    const channelOf = new Map((opts.stores ?? []).map((st) => [st.id, st.channelName]));
    const ytdByChannel = new Map<string, number>();
    for (const s of opts.sales) {
      const ch = channelOf.get(s.entityId);
      if (ch) ytdByChannel.set(ch, (ytdByChannel.get(ch) ?? 0) + (s.salesValue || 0));
    }
    for (const s of opts.sales) {
      const ch = channelOf.get(s.entityId);
      const chTarget = ch ? channelTarget(cfg, ch, period) : null;
      const chYtd = ch ? ytdByChannel.get(ch) ?? 0 : 0;
      if (!ch || !chTarget || chYtd <= 0 || !(s.salesValue > 0)) continue;
      const pct = targetAchievement(actual(s), chTarget * (s.salesValue / chYtd), fraction);
      if (pct !== null) out.set(s.entityId, { percent: pct, brackets: bracketsOf(ch) });
    }
    return out;
  }

  // SKUs: their share of ALL sales times the total of the channel targets. Only
  // fair when every channel that sold this month has a target, else SKUs would
  // be measured against part of the target but all of the sales.
  const selling = (opts.channelSales ?? []).filter((c) => (c.mtdValue ?? 0) > 0);
  const targets = selling.map((c) => channelTarget(cfg, c.entityId, period));
  if (!selling.length || targets.some((t) => t === null)) return null;
  const total = targets.reduce((a: number, t) => a + (t ?? 0), 0);
  const allYtd = opts.sales.reduce((a, s) => a + (s.salesValue || 0), 0);
  if (allYtd <= 0) return out;
  for (const s of opts.sales) {
    if (!(s.salesValue > 0)) continue;
    const pct = targetAchievement(actual(s), total * (s.salesValue / allYtd), fraction);
    if (pct !== null) out.set(s.entityId, { percent: pct, brackets: cfg.skuTargetBrackets ?? [] });
  }
  return out;
}
