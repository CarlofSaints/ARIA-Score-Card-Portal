import type { TenantConfig } from "./types";
import { readJson, writeJson } from "./blob";
import { getDefaultKpiWeightings } from "./modules";

const TENANTS_KEY = "_platform/tenants.json";

export async function getAllTenants(): Promise<TenantConfig[]> {
  return readJson<TenantConfig[]>(TENANTS_KEY, []);
}

export async function getTenantBySlug(slug: string): Promise<TenantConfig | null> {
  const tenants = await getAllTenants();
  return tenants.find((t) => t.slug === slug) ?? null;
}

export async function createTenant(
  config: Omit<TenantConfig, "createdAt" | "updatedAt">
): Promise<TenantConfig> {
  const tenants = await getAllTenants();
  if (tenants.some((t) => t.slug === config.slug)) {
    throw new Error(`Tenant "${config.slug}" already exists`);
  }

  const now = new Date().toISOString();
  const tenant: TenantConfig = {
    ...config,
    kpiWeightings:
      config.kpiWeightings.length > 0
        ? config.kpiWeightings
        : getDefaultKpiWeightings(),
    createdAt: now,
    updatedAt: now,
  };

  tenants.push(tenant);
  await writeJson(TENANTS_KEY, tenants);
  return tenant;
}

export async function updateTenant(
  slug: string,
  updates: Partial<Omit<TenantConfig, "slug" | "createdAt">>
): Promise<TenantConfig> {
  const tenants = await getAllTenants();
  const idx = tenants.findIndex((t) => t.slug === slug);
  if (idx === -1) throw new Error(`Tenant "${slug}" not found`);

  tenants[idx] = {
    ...tenants[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await writeJson(TENANTS_KEY, tenants);
  return tenants[idx];
}

export async function deleteTenant(slug: string): Promise<void> {
  const tenants = await getAllTenants();
  const filtered = tenants.filter((t) => t.slug !== slug);
  if (filtered.length === tenants.length) {
    throw new Error(`Tenant "${slug}" not found`);
  }
  await writeJson(TENANTS_KEY, filtered);
}
