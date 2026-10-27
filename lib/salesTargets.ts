import type { KpiScoringConfig, MonthSales, ScoreBracket, ScorecardStore } from "./types";
import { targetAchievement } from "./scoreEngine";

export interface TargetResult {
  percent: number; // % of target achieved (100 = on target)
  brackets: ScoreBracket[];
}

// data/sales/monthly-history.json: "<level>|<entityId>" -> "YYYY-MM" -> month.
export type SalesHistory = Record<string, Record<string, MonthSales>>;

/** Month's Rand target for a channel, or null when none is set (or it is R0). */
export function channelTarget(cfg: KpiScoringConfig, channel: string, period: string): number | null {
  const [y, m] = period.split("-");
  const t = cfg.salesTargets?.find((s) => s.channel === channel)?.targets[y]?.[Number(m) - 1];
  return t && t > 0 ? t : null;
}

/**
 * Score Sales against monthly Rand targets for one scorecard level. Returns
 * null when this level does not use targets (stores/SKUs left on growth, or
 * SKUs while some selling channel has no target), so the caller scores growth.
 * Entities missing from the returned map show "—" for Sales.
 *
 * Month figures come from monthly-history, which is keyed by CALENDAR month (the
 * period snapshots are keyed by sync date, so they can hold last month's figures
 * for a day or two). A settled month is scored on its full value against the
 * full target; the live month on its to-date value against the target pro-rated
 * to its "data as of" day. A month with no sales data yet scores nobody.
 */
export function scoreSalesTargets(opts: {
  cfg: KpiScoringConfig;
  level: "channel" | "store" | "product";
  period: string;
  history: SalesHistory;
  ids: string[]; // the level's entity ids
  ytd?: Map<string, number>; // store/product level: YTD sales (sets each one's share)
  stores?: ScorecardStore[]; // store level: each store's channel
  channelIds?: string[]; // product level: all channels
}): Map<string, TargetResult> | null {
  const { cfg, level, period, history } = opts;
  if (cfg.salesGrowthMetric !== "rand_target") return null;
  if (level !== "channel" && cfg.targetCascade !== "target") return null;

  const [y, m] = period.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const month = (lvl: string, id: string) => history[`${lvl}|${id}`]?.[period];
  // Month's sales so far and the share of the month they cover.
  const reading = (lvl: string, id: string): { actual: number; fraction: number } | null => {
    const ms = month(lvl, id);
    if (!ms) return null;
    if (ms.complete !== false) return { actual: ms.value || 0, fraction: 1 };
    const asOf = ms.asOf?.startsWith(period) ? Number(ms.asOf.slice(8, 10)) : days;
    return { actual: ms.partialValue ?? ms.value ?? 0, fraction: Math.min(1, Math.max(1, asOf) / days) };
  };

  const out = new Map<string, TargetResult>();
  // No sales data for this month at all (e.g. 1st of the month, data still to
  // last month): score nobody rather than everyone at 0%.
  if (!opts.ids.some((id) => month(level, id))) return out;
  const bracketsOf = (channel: string) => cfg.salesTargets?.find((t) => t.channel === channel)?.brackets ?? [];
  const ytd = (id: string) => opts.ytd?.get(id) ?? 0;
  const score = (id: string, lvl: string, target: number | null, brackets: ScoreBracket[]) => {
    const r = reading(lvl, id);
    const pct = targetAchievement(r?.actual ?? 0, target, r?.fraction ?? 1);
    if (pct !== null) out.set(id, { percent: pct, brackets });
  };

  if (level === "channel") {
    for (const id of opts.ids) score(id, "channel", channelTarget(cfg, id, period), bracketsOf(id));
    return out;
  }

  if (level === "store") {
    // A store's share of its channel target = its share of the channel's YTD sales.
    const channelOf = new Map((opts.stores ?? []).map((st) => [st.id, st.channelName]));
    const storeYtd = new Map(opts.ids.map((id) => [id, ytd(id)]));
    const chYtd = new Map<string, number>();
    for (const [id, v] of storeYtd) {
      const ch = channelOf.get(id);
      if (ch) chYtd.set(ch, (chYtd.get(ch) ?? 0) + v);
    }
    for (const id of opts.ids) {
      const ch = channelOf.get(id);
      const t = ch ? channelTarget(cfg, ch, period) : null;
      const total = ch ? chYtd.get(ch) ?? 0 : 0;
      const share = storeYtd.get(id) ?? 0;
      if (ch && t && total > 0 && share > 0) score(id, "store", t * (share / total), bracketsOf(ch));
    }
    return out;
  }

  // SKUs: all channel targets × the SKU's share of all YTD sales. Only fair when
  // every channel that sold this month has a target, else SKUs would be measured
  // against part of the target but all of the sales.
  const channels = opts.channelIds ?? [];
  const selling = channels.filter((c) => (reading("channel", c)?.actual ?? 0) > 0);
  if (!selling.length || selling.some((c) => channelTarget(cfg, c, period) === null)) return null;
  const total = channels.reduce((a, c) => a + (channelTarget(cfg, c, period) ?? 0), 0);
  const skuYtd = new Map(opts.ids.map((id) => [id, ytd(id)]));
  const all = [...skuYtd.values()].reduce((a, v) => a + v, 0);
  if (all <= 0) return out;
  for (const id of opts.ids) {
    const share = skuYtd.get(id) ?? 0;
    if (share > 0) score(id, "product", total * (share / all), cfg.skuTargetBrackets ?? []);
  }
  return out;
}
