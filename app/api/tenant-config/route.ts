import { NextRequest } from "next/server";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { getTenantConfig } from "@/lib/getTenantConfig";
import { noCacheHeaders } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    // Try edge config from header first (set by proxy)
    const configHeader = req.headers.get("x-tenant-config");
    if (configHeader) {
      const edge = JSON.parse(configHeader);
      return Response.json(
        {
          slug: edge.slug,
          name: edge.name,
          primaryColor: edge.primaryColor,
          secondaryColor: edge.secondaryColor,
          accentColor: edge.accentColor,
          logoUrl: edge.logoUrl,
          enabledModules: edge.enabledModules || [],
        },
        { headers: noCacheHeaders() }
      );
    }

    // Fallback: load from blob
    const slug = await getTenantSlug();
    const config = await getTenantConfig(slug);
    if (!config) {
      return Response.json(
        {
          slug,
          name: "ARIA Score Card",
          primaryColor: "#3D6273",
          secondaryColor: "#5A8A9F",
          accentColor: "#E04E2A",
          logoUrl: "/aria-logo.png",
          enabledModules: [],
        },
        { headers: noCacheHeaders() }
      );
    }

    return Response.json(
      {
        slug: config.slug,
        name: config.name,
        primaryColor: config.branding.primaryColor,
        secondaryColor: config.branding.secondaryColor,
        accentColor: config.branding.accentColor,
        logoUrl: config.branding.logoUrl,
        enabledModules: config.enabledModules,
      },
      { headers: noCacheHeaders() }
    );
  } catch {
    return Response.json(
      { slug: "", name: "ARIA Score Card", enabledModules: [] },
      { headers: noCacheHeaders() }
    );
  }
}
