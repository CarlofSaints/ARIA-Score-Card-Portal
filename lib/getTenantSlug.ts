import { headers } from "next/headers";
import { tenantProofValid } from "./tenantProof";

export async function getTenantSlug(): Promise<string> {
  const h = await headers();
  const slug = h.get("x-tenant-slug");
  if (slug && tenantProofValid(slug, h.get("x-tenant-proof"))) return slug;

  const devSlug = process.env.DEV_TENANT_SLUG;
  if (devSlug) return devSlug;

  throw new Error("No tenant slug resolved. Set DEV_TENANT_SLUG or configure proxy.");
}
