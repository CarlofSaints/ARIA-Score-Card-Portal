import { NextRequest } from "next/server";
import {
  requireLogin,
  handleAuthError,
  noCacheHeaders,
} from "@/lib/auth";
import { getUserById, verifyPassword, setUserPassword } from "@/lib/userData";

export async function POST(req: NextRequest) {
  try {
    const session = requireLogin(req);
    const { currentPassword, newPassword } = await req.json();

    if (!newPassword || newPassword.length < 6) {
      return Response.json(
        { error: "New password must be at least 6 characters" },
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

    // If not a forced change, verify current password
    if (!session.forcePasswordChange) {
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

    await setUserPassword(session.tenantSlug, session.userId, newPassword);

    return Response.json(
      { success: true, message: "Password changed successfully" },
      { headers: noCacheHeaders() }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}
