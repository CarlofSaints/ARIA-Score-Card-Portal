// Force every user and super-admin to choose a new password.
//   PRIVATE_BLOB_READ_WRITE_TOKEN=... RESEND_API_KEY=... node scripts/force-password-reset.mjs [--dry-run]
//     replaces every password with a random one (signs everyone out), emails each
//     active tenant user a 72-hour reset link. Super-admins have no reset page, so:
//   ... node scripts/force-password-reset.mjs --super-admin-from <slug>
//     copies the NEW password of the same-email user in <slug> onto each super-admin
//     (only once that user has set it after the forced reset).
import { get, put } from "@vercel/blob";
import { Resend } from "resend";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";

const TOKEN = process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;
if (!TOKEN) throw new Error("PRIVATE_BLOB_READ_WRITE_TOKEN is not set");
const dry = process.argv.includes("--dry-run");
const fromIdx = process.argv.indexOf("--super-admin-from");
const TOKENS_KEY = "_platform/password-reset-tokens.json";
const SA_KEY = "_platform/super-admins.json";
const MARK_KEY = "_platform/forced-reset-at.json";

async function read(key, fallback) {
  const r = await get(key, { access: "private", useCache: false, token: TOKEN });
  if (!r) return fallback;
  return JSON.parse(await new Response(r.stream).text());
}
const write = (key, data) => put(key, JSON.stringify(data, null, 2), {
  access: "private", addRandomSuffix: false, allowOverwrite: true,
  contentType: "application/json", cacheControlMaxAge: 0, token: TOKEN,
});
const randomHash = () => bcrypt.hash(randomBytes(32).toString("base64url"), 10);
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

if (fromIdx > 0) {
  const slug = process.argv[fromIdx + 1];
  const { at } = await read(MARK_KEY, {});
  if (!at) throw new Error("No forced reset recorded");
  const users = await read(`${slug}/users.json`, []);
  const admins = await read(SA_KEY, []);
  for (const a of admins) {
    const u = users.find((x) => x.email.toLowerCase() === a.email.toLowerCase());
    if (!u || !(u.passwordChangedAt > at)) { console.log(`skip ${a.email}: no new password set in ${slug} yet`); continue; }
    a.password = u.password;
    a.passwordChangedAt = new Date().toISOString();
    console.log(`${dry ? "[dry] " : ""}super-admin ${a.email} now uses the ${slug} password`);
  }
  if (!dry) await write(SA_KEY, admins);
  process.exit(0);
}

const resend = dry ? null : new Resend(process.env.RESEND_API_KEY || (() => { throw new Error("RESEND_API_KEY is not set"); })());
const now = new Date().toISOString();
const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
const tenants = await read("_platform/tenants.json", []);
const tokens = await read(TOKENS_KEY, []);
const mails = [];

for (const t of tenants) {
  const users = await read(`${t.slug}/users.json`, null);
  if (!users) continue;
  const site = t.domains?.[0] ? `https://${t.domains[0]}` : `https://${t.slug}.ariascorecard.co.za`;
  for (const u of users) {
    u.password = await randomHash();
    u.passwordChangedAt = now; // signs out every existing session
    if (u.active === false) continue;
    const email = u.email.toLowerCase();
    const token = randomUUID();
    for (let i = tokens.length - 1; i >= 0; i--) if (tokens[i].email === email && tokens[i].tenantSlug === t.slug) tokens.splice(i, 1);
    tokens.push({ token, email, tenantSlug: t.slug, expiresAt, used: false });
    mails.push({ to: u.email, name: u.name, url: `${site}/reset-password?token=${token}`, site });
  }
  console.log(`${t.slug}: ${users.length} passwords replaced`);
  if (!dry) await write(`${t.slug}/users.json`, users);
}
const admins = await read(SA_KEY, []);
for (const a of admins) { a.password = await randomHash(); a.passwordChangedAt = now; }
console.log(`super-admins: ${admins.length} passwords replaced`);

if (dry) {
  for (const m of mails) console.log(`[dry] would email ${m.name} <${m.to}> link on ${m.site}`);
  process.exit(0);
}
await write(TOKENS_KEY, tokens);
await write(SA_KEY, admins);
await write(MARK_KEY, { at: now });

let failed = 0;
for (const m of mails) {
  const { error } = await resend.emails.send({
    from: "ARIA Score Card <noreply@outerjoin.co.za>",
    to: m.to,
    subject: "Please set a new password for ARIA Score Card",
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <h2 style="color:#3D6273;">Please set a new password</h2>
      <p>Hi ${esc(String(m.name).trim())},</p>
      <p>As part of a security upgrade we have reset all ARIA Score Card passwords. Please click the button below to choose a new one.</p>
      <p><a href="${esc(m.url)}" style="display:inline-block;padding:12px 24px;background:#3D6273;color:#fff;text-decoration:none;border-radius:6px;">Set my new password</a></p>
      <p style="color:#718096;font-size:13px;">The link works for 3 days. After that, use "Forgot password" on the login page at ${esc(m.site)}.</p>
      <p style="margin-top:24px;color:#718096;font-size:13px;">Powered by OuterJoin</p>
    </div>`,
  });
  if (error) { failed++; console.log(`FAILED ${m.to}: ${error.message}`); } else console.log(`sent ${m.to}`);
  await new Promise((r) => setTimeout(r, 1100)); // Resend allows 2/s
}
console.log(`emails: ${mails.length - failed} sent, ${failed} failed`);
