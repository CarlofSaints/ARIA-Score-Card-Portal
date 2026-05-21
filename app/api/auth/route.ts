import { NextRequest, NextResponse } from "next/server";
import { getTenantSlug } from "@/lib/getTenantSlug";
import { getUserByEmail, verifyPassword, updateUser } from "@/lib/userData";
import { encodeSession, sessionCookieOptions, noCacheHeaders } from "@/lib/auth";
import type { SessionPayload } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return Response.json(
        { error: "Email and password are required" },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const slug = await getTenantSlug();
    const user = await getUserByEmail(slug, email);

    if (!user || !user.active) {
      return Response.json(
        { error: "Invalid credentials" },
        { status: 401, headers: noCacheHeaders() }
      );
    }

    const valid = await verifyPassword(user, password);
    if (!valid) {
      return Response.json(
        { error: "Invalid credentials" },
        { status: 401, headers: noCacheHeaders() }
      );
    }

    // Update last login
    await updateUser(slug, user.id, {
      lastLoginAt: new Date().toISOString(),
    });

    const session: SessionPayload = {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantSlug: slug,
      forcePasswordChange: user.forcePasswordChange,
    };

    const encoded = encodeSession(session);
    const cookieOpts = sessionCookieOptions();

    const res = NextResponse.json(
      { user: session },
      { headers: noCacheHeaders() }
    );
    res.cookies.set(cookieOpts.name, encoded, cookieOpts);

    return res;
  } catch (err) {
    console.error("Login error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}

export async function DELETE() {
  const res = NextResponse.json(
    { success: true },
    { headers: noCacheHeaders() }
  );
  res.cookies.set("aria-session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
