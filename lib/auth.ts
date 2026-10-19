import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import type { SessionPayload, UserRole, PermissionKey } from "./types";
import { getRolePermissions } from "./roleData";
import { hasPermission } from "./roles";

const COOKIE_NAME = "aria-session";

export function noCacheHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
  };
}

// HMAC-signed session cookies. The payload stays readable (base64url JSON) but
// is signed with a server-only secret, so it can't be forged or tampered with —
// the old base64-only cookie let anyone mint a `super_admin` session, and this
// repo is public. There is NO repo-visible fallback secret: SESSION_SECRET must
// be set in the environment, and without it we fail closed (no session issued or
// trusted).
function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET is missing or too short (set a 32+ char secret)");
  }
  return s;
}

function sign(body: string): string {
  return createHmac("sha256", sessionSecret()).update(body).digest("base64url");
}

export function encodeSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeSession(cookie: string): SessionPayload | null {
  try {
    const dot = cookie.lastIndexOf(".");
    if (dot <= 0) return null; // no signature segment → legacy/forged → reject
    const body = cookie.slice(0, dot);
    const given = Buffer.from(cookie.slice(dot + 1));
    const expected = Buffer.from(sign(body));
    // Constant-time compare; timingSafeEqual throws on length mismatch, so guard.
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return null;
    }
    return JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as SessionPayload;
  } catch {
    return null;
  }
}

export function getSession(req: NextRequest): SessionPayload | null {
  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (!cookie) return null;
  return decodeSession(cookie);
}

export function requireLogin(req: NextRequest): SessionPayload {
  const session = getSession(req);
  if (!session) {
    throw new AuthError("Not authenticated", 401);
  }
  return session;
}

export function requireRole(
  req: NextRequest,
  minRole: UserRole
): SessionPayload {
  const session = requireLogin(req);
  const hierarchy: UserRole[] = [
    "super_admin",
    "admin",
    "cam",
    "manager",
    "rep",
  ];
  if (hierarchy.indexOf(session.role) > hierarchy.indexOf(minRole)) {
    throw new AuthError("Insufficient permissions", 403);
  }
  return session;
}

export async function requirePermission(
  req: NextRequest,
  perm: PermissionKey
): Promise<SessionPayload> {
  const session = requireLogin(req);
  if (session.role === "super_admin") return session;

  const rolePerms = await getRolePermissions(session.tenantSlug);
  if (!hasPermission(rolePerms, session.role, perm)) {
    throw new AuthError("Insufficient permissions", 403);
  }
  return session;
}

export function sessionCookieOptions(maxAge = 60 * 60 * 24) {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export function handleAuthError(err: unknown) {
  if (err instanceof AuthError) {
    return Response.json(
      { error: err.message },
      { status: err.status, headers: noCacheHeaders() }
    );
  }
  console.error(err);
  return Response.json(
    { error: "Internal server error" },
    { status: 500, headers: noCacheHeaders() }
  );
}
