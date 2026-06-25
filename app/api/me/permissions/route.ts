import { NextRequest } from "next/server";
import { requireLogin, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { getRolePermissions } from "@/lib/roleData";
import { ALL_PERMISSIONS } from "@/lib/roles";
import type { PermissionKey } from "@/lib/types";

export const dynamic = "force-dynamic";

// Returns the effective permission set for the current session's role so the
// client can gate navigation and pages. Super admins always get everything.
export async function GET(req: NextRequest) {
  try {
    const session = requireLogin(req);

    if (session.role === "super_admin") {
      return Response.json(
        { role: session.role, permissions: ALL_PERMISSIONS.map((p) => p.key) },
        { headers: noCacheHeaders() }
      );
    }

    const slug = await getTenantSlug();
    const rolePerms = await getRolePermissions(slug);
    const entry = rolePerms.find((rp) => rp.role === session.role);
    const permissions: PermissionKey[] = entry ? entry.permissions : [];

    return Response.json(
      { role: session.role, permissions },
      { headers: noCacheHeaders() }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}
