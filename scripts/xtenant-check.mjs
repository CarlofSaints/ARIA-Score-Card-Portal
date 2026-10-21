// Local cross-tenant / session check. Touches NO live storage: it serves an
// in-memory fake storage API and starts `next dev` pointed at it.
//   node scripts/xtenant-check.mjs        (exit code 1 on any failure)
import http from "node:http";
import { writeFileSync, mkdtempSync } from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SECRET = "local-test-secret-0123456789abcdef";
const STORE_PORT = 4998;
const APP_PORT = 3999;

// ── fake storage (read-only data; writes are accepted and ignored) ──
const now = new Date().toISOString();
const user = (id, role, active = true) => ({
  id, name: id, email: `${id}@x.test`, password: "x", role,
  forcePasswordChange: false, active, createdAt: now,
});
const data = {
  "tenant-a/users.json": [user("a-admin", "admin"), user("a-rep", "rep"), user("a-cam", "cam"), user("a-off", "admin", false),
    { ...user("a-pw", "admin"), passwordChangedAt: "2026-10-21T10:00:00.000Z" }],
  "tenant-b/users.json": [user("b-admin", "admin")],
  "tenant-c/users.json": "__FAIL_500__", // store read error
  "tenant-d/users.json": "__CORRUPT__", // corrupt file
  "_platform/super-admins.json": [{ id: "sa1", name: "SA", email: "sa@x.test", password: "x", createdAt: now },
    { id: "sa-pw", name: "SA2", email: "sa2@x.test", password: "x", createdAt: now, passwordChangedAt: "2026-10-21T10:00:00.000Z" }],
};
const store = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  res.setHeader("content-type", "application/json");
  if (url.pathname.startsWith("/file/")) {
    const key = decodeURIComponent(url.pathname.slice(6));
    return res.end(JSON.stringify(data[key] ?? null));
  }
  if (req.method === "GET") {
    const prefix = url.searchParams.get("prefix") || "";
    const blobs = Object.keys(data).filter((k) => k.startsWith(prefix)).map((k) => ({
      pathname: k, url: `http://127.0.0.1:${STORE_PORT}/file/${encodeURIComponent(k)}`,
      downloadUrl: "", size: 1, uploadedAt: now, etag: "1",
    }));
    return res.end(JSON.stringify({ blobs, hasMore: false }));
  }
  req.resume();
  res.end(JSON.stringify({ url: "", pathname: "", contentType: "", contentDisposition: "" }));
});
await new Promise((r) => store.listen(STORE_PORT, "127.0.0.1", r));
const DATA_FILE = path.join(mkdtempSync(path.join(os.tmpdir(), "xtenant-")), "blob.json");
writeFileSync(DATA_FILE, JSON.stringify(data));

// ── app ──
const tenants = [
  { slug: "tenant-a", name: "A", primaryColor: "#000", domains: ["a.localhost"], active: true, enabledModules: [] },
  { slug: "tenant-b", name: "B", primaryColor: "#000", domains: ["b.localhost"], active: true, enabledModules: [] },
  { slug: "tenant-c", name: "C", primaryColor: "#000", domains: ["c.localhost"], active: true, enabledModules: [] },
  { slug: "tenant-d", name: "D", primaryColor: "#000", domains: ["d.localhost"], active: true, enabledModules: [] },
];
const env = { ...process.env };
for (const k of Object.keys(env)) if (/BLOB|DEV_TENANT_SLUG|PLATFORM_DOMAIN/i.test(k)) delete env[k];
Object.assign(env, {
  SESSION_SECRET: SECRET,
  PLATFORM_TENANTS_JSON: JSON.stringify(tenants),
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_localfake_notarealtoken",
  PRIVATE_BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_localfake_notarealtoken",
  FAKE_BLOB_DATA_FILE: DATA_FILE,
  NODE_OPTIONS: `${env.NODE_OPTIONS || ""} --import ${pathToFileURL(path.join(ROOT, "scripts/fake-private-blob.mjs")).href}`,
  VERCEL_BLOB_API_URL: `http://127.0.0.1:${STORE_PORT}`,
  NEXT_TELEMETRY_DISABLED: "1",
});
const app = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "dev", "-p", String(APP_PORT)], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
let appLog = "";
app.stdout.on("data", (d) => (appLog += d));
app.stderr.on("data", (d) => (appLog += d));

function hit(pathname, host, cookie, extra = {}) {
  return new Promise((resolve) => {
    const headers = { host, ...extra };
    if (cookie) headers.cookie = `aria-session=${cookie}`;
    const r = http.request({ host: "127.0.0.1", port: APP_PORT, path: pathname, headers, timeout: 180000 }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    r.on("error", () => resolve(0));
    r.on("timeout", () => { r.destroy(); resolve(0); });
    r.end();
  });
}

for (let i = 0; i < 120 && (await hit("/api/tenant-config", "a.localhost")) === 0; i++) {
  await new Promise((r) => setTimeout(r, 1000));
}

const exp = Math.floor(Date.now() / 1000) + 3600;
const mint = (p) => {
  const b = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${b}.${createHmac("sha256", SECRET).update(b).digest("base64url")}`;
};
const sess = (userId, role, extra = {}) => mint({ userId, email: `${userId}@x.test`, name: userId, role, tenantSlug: "tenant-a", exp, ...extra });
const adminA = sess("a-admin", "admin");
const repA = sess("a-rep", "rep");
const camA = sess("a-cam", "cam");

let fail = 0;
async function expect(label, pathname, host, cookie, ok, extra) {
  const s = await hit(pathname, host, cookie, extra);
  const pass = ok(s);
  if (!pass) fail++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${s}  ${label}`);
}
const is = (n) => (s) => s === n;
const not403 = (s) => s !== 403 && s !== 401 && s !== 0;

const routes = [
  ["/api/users", adminA],
  ["/api/sync/log", adminA],
  ["/api/tenant-config/sync-schedule", adminA],
  ["/api/scores/channel", camA],
  ["/api/data/brands", repA],
];
for (const [p, c] of routes) {
  await expect(`tenant-A cookie on tenant-B host  ${p}`, p, "b.localhost", c, is(403));
  await expect(`tenant-A cookie on tenant-A host  ${p}`, p, "a.localhost", c, not403);
}
await expect("spoofed x-tenant-slug: tenant-a on B host", "/api/users", "b.localhost", adminA, is(403), { "x-tenant-slug": "tenant-a" });
await expect("cookie without exp", "/api/users", "a.localhost", mint({ userId: "a-admin", role: "admin", tenantSlug: "tenant-a" }), is(401));
await expect("expired cookie", "/api/users", "a.localhost", sess("a-admin", "admin", { exp: 1000 }), is(401));
await expect("inactive user", "/api/users", "a.localhost", sess("a-off", "admin"), is(401));
await expect("deleted user", "/api/users", "a.localhost", sess("ghost", "admin"), is(401));
await expect("rep cookie claiming admin (role from store)", "/api/users", "a.localhost", sess("a-rep", "admin"), is(403));
await expect("rep lacks view_channel_scorecard", "/api/scores/channel", "a.localhost", repA, is(403));
await expect("cookie from before a password change", "/api/users", "a.localhost", sess("a-pw", "admin"), is(401));
await expect("cookie issued after the password change", "/api/users", "a.localhost", sess("a-pw", "admin", { passwordChangedAt: "2026-10-21T10:00:00.000Z" }), not403);
await expect("store read error -> 503, not 401", "/api/users", "c.localhost", sess("c-admin", "admin", { tenantSlug: "tenant-c" }), is(503));
await expect("corrupt store file -> 500, not 503/401", "/api/users", "d.localhost", sess("d-admin", "admin", { tenantSlug: "tenant-d" }), is(500));
await expect("forged x-tenant-slug on a path the proxy skips", "/api/scores/x.png", "b.localhost", adminA, is(403), { "x-tenant-slug": "tenant-a" });
await expect("super admin cookie from before a password reset", "/api/users", "b.localhost", mint({ userId: "sa-pw", role: "super_admin", tenantSlug: "_platform", isSuperAdmin: true, exp }), is(401));
await expect("super admin cookie after the reset", "/api/users", "b.localhost", mint({ userId: "sa-pw", role: "super_admin", tenantSlug: "_platform", isSuperAdmin: true, passwordChangedAt: "2026-10-21T10:00:00.000Z", exp }), not403);
await expect("super admin on tenant-B host", "/api/users", "b.localhost", mint({ userId: "sa1", role: "super_admin", tenantSlug: "_platform", isSuperAdmin: true, exp }), not403);
await expect("deleted super admin", "/api/users", "b.localhost", mint({ userId: "sa-gone", role: "super_admin", tenantSlug: "_platform", isSuperAdmin: true, exp }), is(401));

app.kill();
store.close();
if (fail) console.log(appLog.split("\n").filter((l) => /fake-private|rror|blob/i.test(l)).slice(0, 30).join("\n"));
console.log(fail ? `\nRESULT: ${fail} check(s) FAILED` : "\nRESULT: all checks passed");
process.exit(fail ? 1 : 0);
