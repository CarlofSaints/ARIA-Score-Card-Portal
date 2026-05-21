import { NextRequest } from "next/server";
import { requireLogin, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { writeBlob } from "@/lib/blob";
import { updateTenant } from "@/lib/tenantConfig";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = requireLogin(req);
    if (!session.isSuperAdmin) {
      return Response.json({ error: "Super admin only" }, { status: 403, headers: noCacheHeaders() });
    }

    const { slug } = await params;
    const formData = await req.formData();
    const file = formData.get("logo") as File | null;

    if (!file) {
      return Response.json({ error: "No file uploaded" }, { status: 400, headers: noCacheHeaders() });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop() || "png";
    const key = `_platform/logos/${slug}.${ext}`;

    const url = await writeBlob(key, bytes, file.type);

    // Update tenant config with logo URL
    await updateTenant(slug, {
      branding: { primaryColor: "", logoUrl: url }, // primaryColor will be merged
    });

    return Response.json({ url }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
