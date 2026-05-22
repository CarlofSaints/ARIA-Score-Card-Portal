import { NextRequest } from "next/server";
import { requirePermission, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { getTenantConfig } from "@/lib/getTenantConfig";
import { sendWelcomeEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    await requirePermission(req, "manage_users");
    const slug = await getTenantSlug();
    const { email, name, password, forcePasswordChange } = await req.json();

    const config = await getTenantConfig(slug);
    const tenantName = config?.name || "ARIA Score Card";
    const domain = config?.domains?.[0];
    const siteUrl = domain
      ? `https://${domain}`
      : process.env.NEXT_PUBLIC_SITE_URL || "";

    await sendWelcomeEmail({
      to: email,
      name,
      tenantName,
      siteUrl,
      email,
      password,
      forcePasswordChange: forcePasswordChange ?? false,
      branding: config?.branding,
      enabledModules: config?.enabledModules,
    });

    return Response.json({ success: true }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
