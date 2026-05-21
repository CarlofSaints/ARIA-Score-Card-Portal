import { NextRequest } from "next/server";
import { requirePermission, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import {
  getCamMappings,
  saveCamMapping,
  deleteCamMapping,
} from "@/lib/camMappingData";

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "manage_cam_mapping");
    const slug = await getTenantSlug();
    const mappings = await getCamMappings(slug);
    return Response.json({ mappings }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requirePermission(req, "manage_cam_mapping");
    const slug = await getTenantSlug();
    const body = await req.json();
    const mapping = await saveCamMapping(slug, body);
    return Response.json({ mapping }, { status: 201, headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requirePermission(req, "manage_cam_mapping");
    const slug = await getTenantSlug();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return Response.json({ error: "id required" }, { status: 400, headers: noCacheHeaders() });
    }
    await deleteCamMapping(slug, id);
    return Response.json({ success: true }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
