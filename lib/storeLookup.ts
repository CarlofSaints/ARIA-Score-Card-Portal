/* ──────────────────────────────────────────────────────────────
   Store Dimension Lookup — reads from synced store data
   ────────────────────────────────────────────────────────────── */

import { readJson } from "./blob";
import type { ScorecardStore } from "./types";

/**
 * Load the synced store master and build a Map for O(1) lookup.
 * Keys by multiple identifiers (id, name lowercased) so enrichment
 * can match on either store ID or store name/code from DISPO rows.
 */
export async function getStoreLookup(
  slug: string
): Promise<Map<string, ScorecardStore>> {
  const stores = await readJson<ScorecardStore[]>(
    `${slug}/data/stores.json`,
    []
  );

  const lookup = new Map<string, ScorecardStore>();
  for (const store of stores) {
    // Key by ID (string)
    lookup.set(store.id.toLowerCase().trim(), store);

    // Also key by name (lowercased, trimmed) for name-based matching
    if (store.name) {
      lookup.set(store.name.toLowerCase().trim(), store);
    }
  }

  return lookup;
}
