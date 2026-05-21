import { NextRequest } from "next/server";
import { requireLogin, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getAllTenants, createTenant } from "@/lib/tenantConfig";
import { createUser } from "@/lib/userData";
import { sendWelcomeEmail } from "@/lib/email";
import type { TenantConfig } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const session = requireLogin(req);
    if (!session.isSuperAdmin) {
      return Response.json({ error: "Super admin only" }, { status: 403, headers: noCacheHeaders() });
    }
    const tenants = await getAllTenants();
    return Response.json({ tenants }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireLogin(req);
    if (!session.isSuperAdmin) {
      return Response.json({ error: "Super admin only" }, { status: 403, headers: noCacheHeaders() });
    }

    const body = await req.json();
    const {
      slug,
      name,
      branding,
      enabledModules,
      kpiWeightings,
      domains,
      initialAdmin,
      sendEmail,
    } = body;

    if (!slug || !name) {
      return Response.json(
        { error: "slug and name are required" },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return Response.json(
        { error: "Slug must contain only lowercase letters, numbers, and hyphens" },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const tenantData: Omit<TenantConfig, "createdAt" | "updatedAt"> = {
      slug,
      name,
      active: true,
      branding: {
        primaryColor: branding?.primaryColor || "#3D6273",
        secondaryColor: branding?.secondaryColor || undefined,
        accentColor: branding?.accentColor || undefined,
        logoUrl: branding?.logoUrl || undefined,
      },
      enabledModules: enabledModules || [],
      kpiWeightings: kpiWeightings || [],
      domains: domains || [],
    };

    const tenant = await createTenant(tenantData);

    // Create initial admin user if provided
    if (initialAdmin?.email && initialAdmin?.name && initialAdmin?.password) {
      const user = await createUser(slug, {
        name: initialAdmin.name,
        email: initialAdmin.email,
        password: initialAdmin.password,
        role: "admin",
        forcePasswordChange: initialAdmin.forcePasswordChange ?? true,
      });

      // Send welcome email if requested
      if (sendEmail) {
        try {
          const siteUrl = domains?.[0]
            ? `https://${domains[0]}`
            : process.env.NEXT_PUBLIC_SITE_URL || "";
          await sendWelcomeEmail({
            to: user.email,
            name: user.name,
            tenantName: name,
            siteUrl,
            email: user.email,
            password: initialAdmin.password,
            forcePasswordChange: initialAdmin.forcePasswordChange ?? true,
          });
        } catch (emailErr) {
          console.error("Welcome email failed:", emailErr);
        }
      }
    }

    return Response.json({ tenant }, { status: 201, headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
