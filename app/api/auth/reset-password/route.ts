import { NextRequest } from "next/server";
import { validateResetToken, markTokenUsed } from "@/lib/passwordReset";
import { getUserByEmail, setUserPassword } from "@/lib/userData";
import { noCacheHeaders } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();
    if (!token || !password) {
      return Response.json(
        { error: "Token and new password are required" },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    if (password.length < 6) {
      return Response.json(
        { error: "Password must be at least 6 characters" },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const entry = await validateResetToken(token);
    if (!entry) {
      return Response.json(
        { error: "Invalid or expired reset link" },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const user = await getUserByEmail(entry.tenantSlug, entry.email);
    if (!user) {
      return Response.json(
        { error: "User not found" },
        { status: 404, headers: noCacheHeaders() }
      );
    }

    await setUserPassword(entry.tenantSlug, user.id, password);
    await markTokenUsed(token);

    return Response.json(
      { success: true, message: "Password has been reset. You can now log in." },
      { headers: noCacheHeaders() }
    );
  } catch (err) {
    console.error("Reset password error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
