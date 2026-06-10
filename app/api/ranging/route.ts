import { NextRequest } from "next/server";
import zlib from "zlib";
import { requireRole, requireLogin, handleAuthError, noCacheHeaders } from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { readJson, writeJson, deleteBlob } from "@/lib/blob";
import type { RangingChannelData, RangingIndexEntry } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const INDEX_KEY = (slug: string) => `${slug}/data/ranging/index.json`;
const CHANNEL_KEY = (slug: string, channel: string) =>
  `${slug}/data/ranging/${channel}.json`;

// GET — list loaded ranging channels (lightweight index, no pairs)
export async function GET(req: NextRequest) {
  try {
    requireLogin(req);
    const slug = await getTenantSlug();
    const index = await readJson<RangingIndexEntry[]>(INDEX_KEY(slug), []);
    return Response.json({ channels: index }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}

// POST — store one channel's ranging data. Body is gzipped JSON of
// { channel, total, byStore, byProduct, pairs, rowsScanned, sourceFile }.
export async function POST(req: NextRequest) {
  try {
    requireRole(req, "admin");
    const slug = await getTenantSlug();

    const buf = Buffer.from(await req.arrayBuffer());
    const isGzip = (req.headers.get("content-type") || "").includes("gzip");
    const jsonText = isGzip ? zlib.gunzipSync(buf).toString("utf-8") : buf.toString("utf-8");
    const payload = JSON.parse(jsonText) as Partial<RangingChannelData>;

    const channel = String(payload.channel || "").trim().toUpperCase();
    if (!channel) {
      return Response.json(
        { error: "Missing channel" },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const record: RangingChannelData = {
      channel,
      total: payload.total ?? (payload.pairs?.length ?? 0),
      byStore: payload.byStore ?? {},
      byProduct: payload.byProduct ?? {},
      pairs: payload.pairs ?? [],
      rowsScanned: payload.rowsScanned ?? 0,
      sourceFile: payload.sourceFile,
      uploadedAt: new Date().toISOString(),
    };

    await writeJson(CHANNEL_KEY(slug, channel), record);

    // Update the index
    const index = await readJson<RangingIndexEntry[]>(INDEX_KEY(slug), []);
    const entry: RangingIndexEntry = {
      channel,
      total: record.total,
      stores: Object.keys(record.byStore).length,
      products: Object.keys(record.byProduct).length,
      rowsScanned: record.rowsScanned,
      sourceFile: record.sourceFile,
      uploadedAt: record.uploadedAt,
    };
    const next = index.filter((e) => e.channel !== channel);
    next.push(entry);
    next.sort((a, b) => a.channel.localeCompare(b.channel));
    await writeJson(INDEX_KEY(slug), next);

    return Response.json({ success: true, channel: entry }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}

// DELETE — remove a channel's ranging data (?channel=PNP)
export async function DELETE(req: NextRequest) {
  try {
    requireRole(req, "admin");
    const slug = await getTenantSlug();
    const channel = (new URL(req.url).searchParams.get("channel") || "")
      .trim()
      .toUpperCase();
    if (!channel) {
      return Response.json(
        { error: "Missing channel" },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    await deleteBlob(CHANNEL_KEY(slug, channel));
    const index = await readJson<RangingIndexEntry[]>(INDEX_KEY(slug), []);
    await writeJson(
      INDEX_KEY(slug),
      index.filter((e) => e.channel !== channel)
    );

    return Response.json({ success: true }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
