import type { KpiScoringConfig, KpiKey, ScoreBracket } from "./types";
import { readJson, writeJson } from "./blob";
import { getDefaultKpiScoring } from "./modules";

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

function checkBrackets(label: string, brackets: unknown): void {
  if (!Array.isArray(brackets) || brackets.length === 0) {
    throw new Error(`${label} must have at least one points bracket`);
  }
  for (const b of brackets as ScoreBracket[]) {
    if (typeof b.min !== "number" || typeof b.max !== "number" || typeof b.points !== "number") {
      throw new Error(`${label} has an invalid bracket (min/max/points must be numbers)`);
    }
    if (b.max < b.min) throw new Error(`${label} has a bracket where max < min`);
  }
}

// Sales target settings: channel names, 12 non-negative Rand values per year,
// and a valid points table for each channel (and for SKUs if used).
function checkSalesTargets(c: KpiScoringConfig): void {
  if (c.targetCascade !== undefined && c.targetCascade !== "growth" && c.targetCascade !== "target") {
    throw new Error("Invalid store/SKU target setting");
  }
  if (c.skuTargetBrackets !== undefined) checkBrackets("SKU target points", c.skuTargetBrackets);
  if (c.salesTargets === undefined) return;
  if (!Array.isArray(c.salesTargets)) throw new Error("Invalid sales targets");
  const seen = new Set<string>();
  for (const t of c.salesTargets) {
    if (typeof t.channel !== "string" || !t.channel || seen.has(t.channel)) {
      throw new Error("Each sales target needs one unique channel");
    }
    seen.add(t.channel);
    if (!t.targets || typeof t.targets !== "object") throw new Error(`${t.channel}: invalid targets`);
    for (const [year, months] of Object.entries(t.targets)) {
      if (!/^\d{4}$/.test(year) || !Array.isArray(months) || months.length !== 12 ||
          !months.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0)) {
        throw new Error(`${t.channel}: ${year} needs 12 monthly targets of R0 or more`);
      }
    }
    checkBrackets(`${t.channel} target points`, t.brackets);
  }
}

export async function saveKpiScoring(
  tenantSlug: string,
  configs: KpiScoringConfig[]
): Promise<void> {
  for (const c of configs) {
    if (c.key === "sales_growth") checkSalesTargets(c);
    if (!Array.isArray(c.brackets) || c.brackets.length === 0) {
      throw new Error(`KPI "${c.key}" must have at least one points bracket`);
    }
    for (const b of c.brackets) {
      if (
        typeof b.min !== "number" ||
        typeof b.max !== "number" ||
        typeof b.points !== "number"
      ) {
        throw new Error(`KPI "${c.key}" has an invalid bracket (min/max/points must be numbers)`);
      }
      if (b.max < b.min) {
        throw new Error(`KPI "${c.key}" has a bracket where max < min`);
      }
    }
  }
  await writeJson(scoringKey(tenantSlug), configs);
}
