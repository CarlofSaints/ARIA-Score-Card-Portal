import { NextRequest } from "next/server";
import { requireRole, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { listProxyQueries } from "@/lib/sqlProxy";

export const dynamic = "force-dynamic";

// Super-admin only. Returns the names of queries actually registered on the SQL
// proxy so the /sql-reference page can flag drift vs lib/sqlRegistry.ts.
// Calls the proxy server-side so the API key never reaches the browser.
export async function GET(req: NextRequest) {
  try {
    requireRole(req, "super_admin");
    try {
      const names = await listProxyQueries();
      return Response.json({ names, ok: true }, { headers: noCacheHeaders() });
    } catch (e) {
      // Proxy unreachable / misconfigured — report gracefully so the page can
      // say "couldn't check" rather than erroring out.
      const error = e instanceof Error ? e.message : "Failed to reach SQL proxy";
      return Response.json({ names: [], ok: false, error }, { headers: noCacheHeaders() });
    }
  } catch (err) {
    return handleAuthError(err);
  }
}
