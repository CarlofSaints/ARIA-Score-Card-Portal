import { NextRequest } from "next/server";
import { requireLogin, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { readJson } from "@/lib/blob";
import type { PhantomDetailRow } from "@/lib/types";

export const dynamic = "force-dynamic";

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

    // The lookback window (@PhantomDays) actually used for the last sync, so the
    // Phantom page can show which period the displayed data reflects.
    const syncMeta = await readJson<{ phantomDays?: number }>(
      `${slug}/data/sync-meta.json`,
      {}
    );
    const phantomDays = syncMeta.phantomDays ?? null;

    return Response.json({ rows, period, phantomDays }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
