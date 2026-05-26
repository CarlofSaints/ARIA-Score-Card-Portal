import { NextRequest } from "next/server";
import { requireLogin, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { readJson } from "@/lib/blob";
import type { ScorecardChannel } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    requireLogin(req);
    const slug = await getTenantSlug();
    const channels = await readJson<ScorecardChannel[]>(`${slug}/data/channels.json`, []);
    return Response.json({ channels }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
