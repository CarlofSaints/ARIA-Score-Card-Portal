// One-off: copy app data from the old PUBLIC store to the PRIVATE store.
//   BLOB_READ_WRITE_TOKEN=<public> PRIVATE_BLOB_READ_WRITE_TOKEN=<private> node scripts/migrate-to-private-blob.mjs [--dry-run]
//     full copy; refused if the private store already holds files (add --force to copy anyway)
//   ... --since <ISO>                 catch-up after the deploy: only public files written since <ISO>
//   ... --delete-public [--dry-run]   lists / deletes every public data file (needs --confirm to delete)
// Logos (_platform/logos/) stay public. A private copy that is the same age or
// newer than the public one is never overwritten (the new deploy wrote it).
import { list, put, del } from "@vercel/blob";

const PUB = process.env.BLOB_READ_WRITE_TOKEN;
const PRIV = process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;
if (!PUB || !PRIV || PUB === PRIV) throw new Error("Set BLOB_READ_WRITE_TOKEN (public) and PRIVATE_BLOB_READ_WRITE_TOKEN (private), different stores");
const arg = (f) => process.argv.includes(f);
const dry = arg("--dry-run");
const sinceIdx = process.argv.indexOf("--since");
const since = sinceIdx > 0 ? new Date(process.argv[sinceIdx + 1]) : null;
if (since && isNaN(since)) throw new Error("--since needs an ISO date, e.g. 2026-10-21T12:00:00Z");
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

if (arg("--delete-public")) {
  if (!dry && !arg("--confirm")) throw new Error("--delete-public deletes every public data file: run with --dry-run to list them, then add --confirm");
  for (const b of pub) console.log(`${dry ? "[dry] would delete" : "delete"} ${b.pathname}`);
  if (!dry) for (let i = 0; i < pub.length; i += 100) await del(pub.slice(i, i + 100).map((b) => b.url), { token: PUB });
  console.log(`${dry ? "[dry] would delete" : "deleted"} ${pub.length} public data files`);
  process.exit(0);
}

if (!since && priv.size && !arg("--force")) throw new Error("Private store is not empty: use --since <ISO> for a catch-up, or --force");

let copied = 0, skipped = 0;
for (const b of pub) {
  if (since && new Date(b.uploadedAt) < since) continue;
  const have = priv.get(b.pathname);
  if (have && new Date(have.uploadedAt) >= new Date(b.uploadedAt)) { skipped++; console.log("keep private", b.pathname); continue; }
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
console.log(`${dry ? "[dry] " : ""}copied ${copied}, private already newer ${skipped}`);
