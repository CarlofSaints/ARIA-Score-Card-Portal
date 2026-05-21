import type { KpiWeighting } from "./types";
import { readJson, writeJson } from "./blob";
import { getDefaultKpiWeightings } from "./modules";

function kpiKey(tenantSlug: string): string {
  return `${tenantSlug}/config/kpi-weightings.json`;
}

export async function getKpiWeightings(
  tenantSlug: string
): Promise<KpiWeighting[]> {
  return readJson<KpiWeighting[]>(kpiKey(tenantSlug), getDefaultKpiWeightings());
}

export async function saveKpiWeightings(
  tenantSlug: string,
  weightings: KpiWeighting[]
): Promise<void> {
  // Validate total sums to 100
  const total = weightings.reduce((sum, w) => sum + w.weight, 0);
  if (total !== 100) {
    throw new Error(`KPI weights must sum to 100 (currently ${total})`);
  }
  await writeJson(kpiKey(tenantSlug), weightings);
}
