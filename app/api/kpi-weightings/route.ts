import { NextRequest } from "next/server";
import { requirePermission, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { getKpiWeightings, saveKpiWeightings } from "@/lib/kpiData";

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "manage_kpis");
    const slug = await getTenantSlug();
    const weightings = await getKpiWeightings(slug);
    return Response.json({ weightings }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requirePermission(req, "manage_kpis");
    const slug = await getTenantSlug();
    const { weightings } = await req.json();
    await saveKpiWeightings(slug, weightings);
    return Response.json({ success: true }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
