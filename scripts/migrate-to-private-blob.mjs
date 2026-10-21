// One-off: copy app data from the old PUBLIC store to the PRIVATE store.
//   BLOB_READ_WRITE_TOKEN=<public> PRIVATE_BLOB_READ_WRITE_TOKEN=<private> node scripts/migrate-to-private-blob.mjs [--dry-run]
//   ... node scripts/migrate-to-private-blob.mjs --delete-public   (after the new deploy is live + checked)
// Logos (_platform/logos/) stay public. A file is copied only when the private
// store lacks it or holds an older copy, so it is safe to run again after the
// deploy to pick up writes the old deploy made in between.
import { list, put, del } from "@vercel/blob";

const PUB = process.env.BLOB_READ_WRITE_TOKEN;
const PRIV = process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;
if (!PUB || !PRIV || PUB === PRIV) throw new Error("Set BLOB_READ_WRITE_TOKEN (public) and PRIVATE_BLOB_READ_WRITE_TOKEN (private), different stores");
const dry = process.argv.includes("--dry-run");
const deletePublic = process.argv.includes("--delete-public");
const KEEP_PUBLIC = (p) => p.startsWith("_platform/logos/");

async function all(token) {
  const out = [];
  let cursor;
  do {
    const r = await list({ token, cursor, limit: 1000 });
    out.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

const pub = (await all(PUB)).filter((b) => !KEEP_PUBLIC(b.pathname));
const priv = new Map((await all(PRIV)).map((b) => [b.pathname, b]));
console.log(`public data files: ${pub.length}, private files: ${priv.size}`);

if (deletePublic) {
  // Only delete what the private store provably holds (same or newer copy).
  const safe = pub.filter((b) => priv.has(b.pathname) && new Date(priv.get(b.pathname).uploadedAt) >= new Date(b.uploadedAt));
  const missing = pub.length - safe.length;
  if (missing) throw new Error(`${missing} public file(s) not yet in the private store: run the copy again first`);
  console.log(`${dry ? "[dry] would delete" : "deleting"} ${safe.length} public data files`);
  if (!dry) for (let i = 0; i < safe.length; i += 100) await del(safe.slice(i, i + 100).map((b) => b.url), { token: PUB });
  process.exit(0);
}

let copied = 0, skipped = 0;
for (const b of pub) {
  const have = priv.get(b.pathname);
  if (have && new Date(have.uploadedAt) >= new Date(b.uploadedAt)) { skipped++; continue; }
  if (dry) { console.log("[dry] copy", b.pathname); copied++; continue; }
  const res = await fetch(`${b.url}?_=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`read ${b.pathname}: HTTP ${res.status}`);
  await put(b.pathname, Buffer.from(await res.arrayBuffer()), {
    access: "private", addRandomSuffix: false, allowOverwrite: true,
    contentType: res.headers.get("content-type") || "application/octet-stream",
    cacheControlMaxAge: 0, token: PRIV,
  });
  copied++;
}
console.log(`${dry ? "[dry] " : ""}copied ${copied}, already current ${skipped}`);
