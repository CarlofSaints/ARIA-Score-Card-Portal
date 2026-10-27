import type { KpiScoringConfig, KpiKey, ScoreBracket } from "./types";
import { readJson, writeJson } from "./blob";
import { getDefaultKpiScoring } from "./modules";
import { AuthError } from "./auth";

function scoringKey(tenantSlug: string): string {
  return `${tenantSlug}/config/kpi-scoring.json`;
}

const KPI_KEYS: KpiKey[] = [
  "sales_growth",
  "phantom_inventory",
  "numerical_distribution",
  "oos",
];

/**
 * Load the per-KPI points-bracket config for a tenant, backfilling any KPI that
 * is missing from a previously-saved config with its default brackets (so newly
 * added KPIs always have a usable default).
 */
export async function getKpiScoring(
  tenantSlug: string
): Promise<KpiScoringConfig[]> {
  const defaults = getDefaultKpiScoring();
  const saved = await readJson<KpiScoringConfig[]>(scoringKey(tenantSlug), defaults);
  const byKey = new Map(saved.map((c) => [c.key, c]));
  return KPI_KEYS.map(
    (k) => byKey.get(k) || defaults.find((d) => d.key === k)!
  );
}

// Bad input → 400 with the reason (AuthError carries a status; a plain Error
// would surface as a generic 500).
const invalid = (msg: string) => new AuthError(msg, 400);

function checkBrackets(label: string, brackets: unknown): void {
  if (!Array.isArray(brackets) || brackets.length === 0) {
    throw invalid(`${label} must have at least one points bracket`);
  }
  for (const b of brackets as (ScoreBracket | null)[]) {
    if (!b || typeof b.min !== "number" || typeof b.max !== "number" || typeof b.points !== "number") {
      throw invalid(`${label} has an invalid bracket (min/max/points must be numbers)`);
    }
    if (b.max < b.min) throw invalid(`${label} has a bracket where max < min`);
  }
}

// Sales target settings (only checked while "Set Rand Value Target" is chosen,
// so a hidden half-done setup never blocks saving other KPIs): unique channel
// names, 12 non-negative Rand values per year, and a points table per channel
// (and for SKUs when stores/SKUs score on the targets).
function checkSalesTargets(c: KpiScoringConfig): void {
  if (c.salesGrowthMetric !== "rand_target") return;
  if (c.targetCascade !== undefined && c.targetCascade !== "growth" && c.targetCascade !== "target") {
    throw invalid("Invalid store/SKU target setting");
  }
  if (c.targetCascade === "target") checkBrackets("SKU target points", c.skuTargetBrackets);
  if (c.salesTargets === undefined) return;
  if (!Array.isArray(c.salesTargets)) throw invalid("Invalid sales targets");
  const seen = new Set<string>();
  for (const t of c.salesTargets) {
    if (!t || typeof t.channel !== "string" || !t.channel || seen.has(t.channel)) {
      throw invalid("Each sales target needs one unique channel");
    }
    seen.add(t.channel);
    if (!t.targets || typeof t.targets !== "object") throw invalid(`${t.channel}: invalid targets`);
    for (const [year, months] of Object.entries(t.targets)) {
      if (!/^\d{4}$/.test(year) || !Array.isArray(months) || months.length !== 12 ||
          !months.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0)) {
        throw invalid(`${t.channel}: ${year} needs 12 monthly targets of R0 or more`);
      }
    }
    checkBrackets(`${t.channel} target points`, t.brackets);
  }
}

export async function saveKpiScoring(
  tenantSlug: string,
  configs: KpiScoringConfig[]
): Promise<void> {
  if (!Array.isArray(configs)) throw invalid("Invalid scoring settings");
  for (const c of configs) {
    if (!c) throw invalid("Invalid scoring settings");
    checkBrackets(`KPI "${c.key}"`, c.brackets);
    if (c.key === "sales_growth") checkSalesTargets(c);
  }
  await writeJson(scoringKey(tenantSlug), configs);
}
