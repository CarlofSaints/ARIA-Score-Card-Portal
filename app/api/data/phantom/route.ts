import { NextRequest } from "next/server";
import { requireLogin, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { readJson } from "@/lib/blob";
import type { PhantomDetailRow } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    requireLogin(req);
    const slug = await getTenantSlug();

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const period =
      searchParams.get("period") ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const rows = await readJson<PhantomDetailRow[]>(
      `${slug}/data/phantom/${period}/detail.json`,
      []
    );

    return Response.json({ rows, period }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
