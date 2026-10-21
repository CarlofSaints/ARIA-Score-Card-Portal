import { NextRequest } from "next/server";
import { requirePermission, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { getTenantConfig } from "@/lib/getTenantConfig";
import { sendWelcomeEmail } from "@/lib/email";
import { getUserById, getUserByEmail, verifyPassword } from "@/lib/userData";

export async function POST(req: NextRequest) {
  try {
    await requirePermission(req, "manage_users");
    const slug = await getTenantSlug();
    const { userId, email, password } = await req.json();

    // Only ever email an existing user of THIS tenant; name/address come from the store.
    const user =
      (typeof userId === "string" && userId ? await getUserById(slug, userId) : null) ??
      (typeof email === "string" && email ? await getUserByEmail(slug, email) : null);
    if (!user) {
      return Response.json(
        { error: "User not found" },
        { status: 404, headers: noCacheHeaders() }
      );
    }
    // Only the password that was just set for this user may be emailed.
    if (typeof password !== "string" || !(await verifyPassword(user, password))) {
      return Response.json(
        { error: "Password does not match this user's current password" },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const config = await getTenantConfig(slug);
    const tenantName = config?.name || "ARIA Score Card";

    await sendWelcomeEmail({
      to: user.email,
      name: user.name,
      tenantName,
      tenantSlug: slug,
      tenantDomains: config?.domains,
      email: user.email,
      password,
      forcePasswordChange: user.forcePasswordChange,
      branding: config?.branding,
      enabledModules: config?.enabledModules,
    });

    return Response.json({ success: true }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
