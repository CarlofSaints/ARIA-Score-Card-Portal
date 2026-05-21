import type { CamMapping } from "./types";
import { readJson, writeJson } from "./blob";
import { v4 as uuid } from "uuid";

function camKey(tenantSlug: string): string {
  return `${tenantSlug}/cam-mappings.json`;
}

export async function getCamMappings(
  tenantSlug: string
): Promise<CamMapping[]> {
  return readJson<CamMapping[]>(camKey(tenantSlug), []);
}

export async function saveCamMapping(
  tenantSlug: string,
  mapping: Omit<CamMapping, "id">
): Promise<CamMapping> {
  const mappings = await getCamMappings(tenantSlug);
  const existing = mappings.findIndex(
    (m) => m.camUserId === mapping.camUserId
  );

  const entry: CamMapping = { id: existing >= 0 ? mappings[existing].id : uuid(), ...mapping };

  if (existing >= 0) {
    mappings[existing] = entry;
  } else {
    mappings.push(entry);
  }

  await writeJson(camKey(tenantSlug), mappings);
  return entry;
}

export async function deleteCamMapping(
  tenantSlug: string,
  mappingId: string
): Promise<void> {
  const mappings = await getCamMappings(tenantSlug);
  await writeJson(
    camKey(tenantSlug),
    mappings.filter((m) => m.id !== mappingId)
  );
}
