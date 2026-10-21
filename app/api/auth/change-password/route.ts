import { NextRequest, NextResponse } from "next/server";
import {
  requireLogin,
  handleAuthError,
  noCacheHeaders,
  encodeSession,
  sessionCookieOptions,
  sessionExp,
  SESSION_TTL,
} from "@/lib/auth";
import { getUserById, verifyPassword, setUserPassword } from "@/lib/userData";
import { MIN_PASSWORD_LENGTH } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const session = await requireLogin(req);
    const { currentPassword, newPassword } = await req.json();

    if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH) {
      return Response.json(
        { error: "New password must be at least 8 characters" },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const user = await getUserById(session.tenantSlug, session.userId);
    if (!user) {
      return Response.json(
        { error: "User not found" },
        { status: 404, headers: noCacheHeaders() }
      );
    }

    // If not a forced change (per the STORED user, not the cookie), verify current password
    if (!user.forcePasswordChange) {
      if (!currentPassword) {
        return Response.json(
          { error: "Current password is required" },
          { status: 400, headers: noCacheHeaders() }
        );
      }
      const valid = await verifyPassword(user, currentPassword);
      if (!valid) {
        return Response.json(
          { error: "Current password is incorrect" },
          { status: 401, headers: noCacheHeaders() }
        );
      }
    }

    const passwordChangedAt = await setUserPassword(session.tenantSlug, session.userId, newPassword);

    // Reissue the cookie: no forcePasswordChange, and the new passwordChangedAt
    // so this session survives while every other one is signed out.
    const res = NextResponse.json(
      { success: true, message: "Password changed successfully" },
      { headers: noCacheHeaders() }
    );
    const cookieOpts = sessionCookieOptions();
    res.cookies.set(
      cookieOpts.name,
      encodeSession({ ...session, forcePasswordChange: false, passwordChangedAt, exp: sessionExp(SESSION_TTL) }),
      cookieOpts
    );
    return res;
  } catch (err) {
    return handleAuthError(err);
  }
}
