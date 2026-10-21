import { createHmac, timingSafeEqual } from "crypto";

// The proxy signs the tenant slug it resolved from the Host, so a handler can
// tell its header apart from a client-sent copy (e.g. on paths the proxy's
// matcher skips). No secret, no proof: the header is then never trusted.
export function tenantProof(slug: string): string | null {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) return null;
  return createHmac("sha256", s).update(`tenant:${slug}`).digest("base64url");
}

export function tenantProofValid(slug: string, given: string | null): boolean {
  const expected = tenantProof(slug);
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
