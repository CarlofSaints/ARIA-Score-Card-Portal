import { NextRequest, NextResponse } from "next/server";

interface TenantConfigEdge {
  slug: string;
  name: string;
  primaryColor: string;
  secondaryColor?: string;
  accentColor?: string;
  logoUrl?: string;
  domains: string[];
  active: boolean;
  enabledModules: string[];
}

function loadTenantsFromEnv(): TenantConfigEdge[] {
  const raw = process.env.PLATFORM_TENANTS_JSON;
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Super-admin paths bypass tenant resolution
  if (
    pathname.startsWith("/super-admin") ||
    pathname.startsWith("/api/super-admin")
  ) {
    return NextResponse.next();
  }

  // Platform-level API routes
  if (pathname.startsWith("/api/platform/")) {
    return NextResponse.next();
  }

  const hostname = req.headers.get("host") || "";
  const host = hostname.toLowerCase().replace(/:\d+$/, "");

  // 1. Platform domain → redirect to super-admin portal
  const platformDomain = process.env.PLATFORM_DOMAIN?.toLowerCase();
  if (platformDomain && host === platformDomain) {
    return NextResponse.redirect(new URL("/super-admin/login", req.url));
  }

  const tenants = loadTenantsFromEnv();
  const devSlug = process.env.DEV_TENANT_SLUG;

  // 2. Match hostname to a configured tenant
  const tenant = tenants.find(
    (t) => t.active && t.domains.some((d) => d.toLowerCase() === host)
  );

  if (tenant) {
    const headers = new Headers(req.headers);
    headers.set("x-tenant-slug", tenant.slug);
    headers.set("x-tenant-config", JSON.stringify(tenant));
    return NextResponse.next({ request: { headers } });
  }

  // 3. DEV_TENANT_SLUG fallback (local dev, Vercel preview, main domain)
  if (devSlug) {
    const fallbackTenant = tenants.find(
      (t) => t.slug === devSlug && t.active
    );
    const headers = new Headers(req.headers);
    headers.set("x-tenant-slug", devSlug);
    if (fallbackTenant) {
      headers.set("x-tenant-config", JSON.stringify(fallbackTenant));
    }
    return NextResponse.next({ request: { headers } });
  }

  // 4. Vercel preview URLs → route to first active tenant
  const isVercelDomain =
    host.endsWith(".vercel.app") || host.endsWith(".vercel.sh");
  if (isVercelDomain && tenants.length > 0) {
    const fallback = tenants.find((t) => t.active);
    if (fallback) {
      const headers = new Headers(req.headers);
      headers.set("x-tenant-slug", fallback.slug);
      headers.set("x-tenant-config", JSON.stringify(fallback));
      return NextResponse.next({ request: { headers } });
    }
  }

  // No tenant → 404
  return new NextResponse(
    "Tenant not found. Set DEV_TENANT_SLUG env var or configure PLATFORM_TENANTS_JSON.",
    { status: 404 }
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)$).*)",
  ],
};
