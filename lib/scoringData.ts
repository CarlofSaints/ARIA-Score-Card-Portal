import type { KpiScoringConfig, KpiKey } from "./types";
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

export async function saveKpiScoring(
  tenantSlug: string,
  configs: KpiScoringConfig[]
): Promise<void> {
  for (const c of configs) {
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
