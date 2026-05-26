import { NextRequest } from "next/server";
import { requireLogin, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { readJson } from "@/lib/blob";

export async function GET(req: NextRequest) {
  try {
    requireLogin(req);
    const slug = await getTenantSlug();
    const brands = await readJson<string[]>(`${slug}/data/brands.json`, []);
    return Response.json({ brands }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
