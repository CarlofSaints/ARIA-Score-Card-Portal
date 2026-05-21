import { NextRequest, NextResponse } from "next/server";
import { readJson } from "@/lib/blob";
import type { SuperAdmin, SessionPayload } from "@/lib/types";
import bcrypt from "bcryptjs";
import { encodeSession, sessionCookieOptions, noCacheHeaders } from "@/lib/auth";

const SA_KEY = "_platform/super-admins.json";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return Response.json(
        { error: "Email and password are required" },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const admins = await readJson<SuperAdmin[]>(SA_KEY, []);
    const admin = admins.find(
      (a) => a.email.toLowerCase() === email.toLowerCase()
    );

    if (!admin) {
      return Response.json(
        { error: "Invalid credentials" },
        { status: 401, headers: noCacheHeaders() }
      );
    }

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      return Response.json(
        { error: "Invalid credentials" },
        { status: 401, headers: noCacheHeaders() }
      );
    }

    const session: SessionPayload = {
      userId: admin.id,
      email: admin.email,
      name: admin.name,
      role: "super_admin",
      tenantSlug: "_platform",
      isSuperAdmin: true,
    };

    const encoded = encodeSession(session);
    const cookieOpts = sessionCookieOptions(60 * 60 * 8); // 8 hours

    const res = NextResponse.json(
      { user: session },
      { headers: noCacheHeaders() }
    );
    res.cookies.set(cookieOpts.name, encoded, cookieOpts);

    return res;
  } catch (err) {
    console.error("Super admin auth error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
