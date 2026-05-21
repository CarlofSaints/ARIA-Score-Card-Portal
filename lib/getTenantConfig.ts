import { headers } from "next/headers";
import type { TenantConfig, TenantConfigEdge } from "./types";
import { readJson } from "./blob";

export async function getTenantConfigFromHeader(): Promise<TenantConfigEdge | null> {
  const h = await headers();
  const raw = h.get("x-tenant-config");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TenantConfigEdge;
  } catch {
    return null;
  }
}

export async function getTenantConfig(slug: string): Promise<TenantConfig | null> {
  const tenants = await readJson<TenantConfig[]>("_platform/tenants.json", []);
  return tenants.find((t) => t.slug === slug) ?? null;
}
