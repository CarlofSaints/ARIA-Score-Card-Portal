import { put, del, list, get } from "@vercel/blob";

// App data (users, tenants, KPIs, reset tokens…) lives in a PRIVATE store:
// nothing in it is reachable by URL, every read goes through the SDK with the
// token. Only logos stay in the old public store (writeBlob), because the
// login page and emails load them straight from their URL.
const token = () => {
  const t = process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;
  if (!t) throw new Error("PRIVATE_BLOB_READ_WRITE_TOKEN is not set");
  return t;
};

// A network failure or 5xx from the store: worth retrying (auth maps it to 503).
export class StoreUnavailableError extends Error {}

// The fallback is ONLY for a file that does not exist yet. Any other failure
// (no token, network, bad JSON) throws, so a read-modify-write can never save a
// near-empty copy over the real data.
export async function readJson<T>(key: string, fallback: T): Promise<T> {
  const t = token(); // a missing token is a config error, not transient
  let result;
  try {
    result = await get(key, { access: "private", useCache: false, token: t });
  } catch (err) {
    // shortcut: the SDK only reports the HTTP status in its message; revisit if it adds a status field.
    if (err instanceof TypeError || /: 5\d\d\b/.test(String((err as Error)?.message))) {
      throw new StoreUnavailableError(`Store unavailable reading ${key}`, { cause: err });
    }
    throw err;
  }
  if (!result) return fallback;
  if (result.statusCode !== 200) throw new Error(`Unexpected status ${result.statusCode} reading ${key}`);
  return JSON.parse(await new Response(result.stream).text()) as T;
}

export async function writeJson<T>(key: string, data: T): Promise<void> {
  await put(key, JSON.stringify(data, null, 2), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 0,
    token: token(),
  });
}

export async function deleteBlob(key: string): Promise<void> {
  try {
    const { blobs } = await list({ prefix: key, limit: 1, token: token() });
    const match = blobs.find((b) => b.pathname === key);
    if (match) await del(match.url, { token: token() });
  } catch {
    // ignore — key may not exist
  }
}

// List the immediate child folder names under a prefix (e.g. the "YYYY-MM"
// period folders under "<slug>/data/kpi/"). Walks pagination so it doesn't miss
// folders when a period holds many blobs.
export async function listChildFolders(prefix: string): Promise<string[]> {
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const r = await list({ prefix, cursor, limit: 1000, token: token() });
    for (const b of r.blobs) {
      const seg = b.pathname.slice(prefix.length).split("/")[0];
      if (seg) seen.add(seg);
    }
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return [...seen];
}

// Logos only: public on purpose (login page + emails). Never use for data.
export async function writeBlob(
  key: string,
  data: Buffer | string,
  contentType: string
): Promise<string> {
  const blob = await put(key, data, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
  });
  return blob.url;
}
