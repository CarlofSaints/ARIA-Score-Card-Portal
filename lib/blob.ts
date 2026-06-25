import { put, del, list } from "@vercel/blob";

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const { blobs } = await list({ prefix: key, limit: 1 });
    const match = blobs.find((b) => b.pathname === key);
    if (!match) return fallback;

    // Public blob URLs are served through an edge cache. When we overwrite a
    // mutable JSON blob (users, cam-mappings, config, …) the same URL keeps
    // serving the pre-overwrite copy until the edge cache is evicted — which is
    // why a freshly-created user/mapping can take several refreshes to appear.
    // `{cache:'no-store'}` only bypasses the local fetch cache, so we also append
    // a unique query string to force the edge to revalidate against the origin.
    const bust = `${match.url.includes("?") ? "&" : "?"}_=${Date.now()}`;
    const res = await fetch(`${match.url}${bust}`, { cache: "no-store" });
    if (!res.ok) return fallback;
    const text = await res.text();
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson<T>(key: string, data: T): Promise<void> {
  await put(key, JSON.stringify(data, null, 2), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    // Mutable app state must not be edge-cached for a year (the SDK default).
    // 0 → the stored object carries a no-cache header so reads stay fresh even
    // without the query-string buster above.
    cacheControlMaxAge: 0,
  });
}

export async function deleteBlob(key: string): Promise<void> {
  try {
    const { blobs } = await list({ prefix: key, limit: 1 });
    const match = blobs.find((b) => b.pathname === key);
    if (match) await del(match.url);
  } catch {
    // ignore — key may not exist
  }
}

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
