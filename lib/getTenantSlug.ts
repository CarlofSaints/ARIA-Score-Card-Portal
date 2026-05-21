import { headers } from "next/headers";

export async function getTenantSlug(): Promise<string> {
  const h = await headers();
  const slug = h.get("x-tenant-slug");
  if (slug) return slug;

  const devSlug = process.env.DEV_TENANT_SLUG;
  if (devSlug) return devSlug;

  throw new Error("No tenant slug resolved. Set DEV_TENANT_SLUG or configure proxy.");
}
