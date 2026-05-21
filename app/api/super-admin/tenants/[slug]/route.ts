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
    const session = requireLogin(req);
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
    const session = requireLogin(req);
    if (!session.isSuperAdmin) {
      return Response.json({ error: "Super admin only" }, { status: 403, headers: noCacheHeaders() });
    }

    const { slug } = await params;
    const body = await req.json();
    const tenant = await updateTenant(slug, body);
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
    const session = requireLogin(req);
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
