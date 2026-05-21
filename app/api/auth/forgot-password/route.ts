import { NextRequest } from "next/server";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { getTenantConfig } from "@/lib/getTenantConfig";
import { getUserByEmail } from "@/lib/userData";
import { createResetToken } from "@/lib/passwordReset";
import { sendPasswordResetEmail } from "@/lib/email";
import { noCacheHeaders } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) {
      return Response.json(
        { error: "Email is required" },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const slug = await getTenantSlug();
    const user = await getUserByEmail(slug, email);

    // Always return success to prevent email enumeration
    if (!user) {
      return Response.json(
        { success: true, message: "If that email exists, a reset link has been sent." },
        { headers: noCacheHeaders() }
      );
    }

    const token = await createResetToken(email, slug);
    const config = await getTenantConfig(slug);
    const tenantName = config?.name || "ARIA Score Card";

    // Build reset URL
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
    const resetUrl = `${siteUrl}/reset-password?token=${token}`;

    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl,
      tenantName,
    });

    return Response.json(
      { success: true, message: "If that email exists, a reset link has been sent." },
      { headers: noCacheHeaders() }
    );
  } catch (err) {
    console.error("Forgot password error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
