import { NextRequest } from "next/server";
import { requireLogin, handleAuthError, noCacheHeaders } from "@/lib/auth";
import {
  getTenantBySlug,
  updateTenant,
  deleteTenant,
} from "@/lib/tenantConfig";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await requireLogin(req);
    if (!session.isSuperAdmin) {
      return Response.json({ error: "Super admin only" }, { status: 403, headers: noCacheHeaders() });
    }

    const { slug } = await params;
    const tenant = await getTenantBySlug(slug);
    if (!tenant) {
      return Response.json({ error: "Tenant not found" }, { status: 404, headers: noCacheHeaders() });
    }

    return Response.json({ tenant }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await requireLogin(req);
    if (!session.isSuperAdmin) {
      return Response.json({ error: "Super admin only" }, { status: 403, headers: noCacheHeaders() });
    }

    const { slug } = await params;
    const body = await req.json();
    // Strip identity/immutable fields so a raw body can't repoint the record's
    // key or forge its creation date (updateTenant spreads updates as-is).
    const { slug: _s, id: _i, createdAt: _c, ...updates } = body ?? {};
    const tenant = await updateTenant(slug, updates);
    return Response.json({ tenant }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await requireLogin(req);
    if (!session.isSuperAdmin) {
      return Response.json({ error: "Super admin only" }, { status: 403, headers: noCacheHeaders() });
    }

    const { slug } = await params;
    await deleteTenant(slug);
    return Response.json({ success: true }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
