import { NextRequest } from "next/server";
import { requireLogin, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { getCamMappings } from "@/lib/camMappingData";

export const dynamic = "force-dynamic";

// KAM roster for the cross-page KAM filter. Read-only: just each KAM's name and
// the channel/brand NAMES they own (CamMapping stores names, not ids). Any
// logged-in tenant user may read it — KAM names already show on the scorecards —
// while editing stays behind manage_cam_mapping on /api/cam-mappings.
export async function GET(req: NextRequest) {
  try {
    await requireLogin(req);
    const slug = await getTenantSlug();
    const mappings = await getCamMappings(slug);
    const kams = mappings.map((m) => ({
      id: m.camUserId,
      name: m.camName,
      channels: m.channelIds,
      brands: m.brandIds,
    }));
    return Response.json({ kams }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
