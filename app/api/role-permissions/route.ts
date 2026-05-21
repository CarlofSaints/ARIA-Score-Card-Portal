import { NextRequest } from "next/server";
import { requirePermission, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { getRolePermissions, saveRolePermissions } from "@/lib/roleData";

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "manage_roles");
    const slug = await getTenantSlug();
    const perms = await getRolePermissions(slug);
    return Response.json({ rolePermissions: perms }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requirePermission(req, "manage_roles");
    const slug = await getTenantSlug();
    const { rolePermissions } = await req.json();

    if (!Array.isArray(rolePermissions)) {
      return Response.json({ error: "rolePermissions array required" }, { status: 400, headers: noCacheHeaders() });
    }

    await saveRolePermissions(slug, rolePermissions);
    return Response.json({ success: true }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
