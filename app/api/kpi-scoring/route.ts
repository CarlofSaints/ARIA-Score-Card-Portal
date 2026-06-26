import { NextRequest } from "next/server";
import { requirePermission, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { getKpiScoring, saveKpiScoring } from "@/lib/scoringData";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "manage_kpis");
    const slug = await getTenantSlug();
    const scoring = await getKpiScoring(slug);
    return Response.json({ scoring }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requirePermission(req, "manage_kpis");
    const slug = await getTenantSlug();
    const { scoring } = await req.json();
    await saveKpiScoring(slug, scoring);
    return Response.json({ success: true }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
