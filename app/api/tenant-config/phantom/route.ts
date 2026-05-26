import { NextRequest } from "next/server";
import { requireRole, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { getTenantConfig } from "@/lib/getTenantConfig";
import { updateTenant } from "@/lib/tenantConfig";

export async function GET(req: NextRequest) {
  try {
    requireRole(req, "admin");
    const slug = await getTenantSlug();
    const config = await getTenantConfig(slug);

    return Response.json(
      { phantomLookbackDays: config?.phantomLookbackDays ?? 60 },
      { headers: noCacheHeaders() }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    requireRole(req, "admin");
    const slug = await getTenantSlug();
    const body = await req.json();
    const days = Math.max(7, Math.min(365, Number(body.phantomLookbackDays) || 60));

    await updateTenant(slug, { phantomLookbackDays: days });

    return Response.json(
      { phantomLookbackDays: days },
      { headers: noCacheHeaders() }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}
