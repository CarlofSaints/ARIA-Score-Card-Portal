import { NextRequest } from "next/server";
import {
  requirePermission,
  handleAuthError,
  noCacheHeaders,
} from "@/lib/auth";
import { getTenantSlug } from "@/lib/getTenantSlug";
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  setUserPassword,
} from "@/lib/userData";

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, "manage_users");
    const slug = await getTenantSlug();
    const users = await getUsers(slug);

    // Strip password hashes before returning
    const safe = users.map(({ password, ...rest }) => rest);
    return Response.json({ users: safe }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requirePermission(req, "manage_users");
    const slug = await getTenantSlug();
    const body = await req.json();

    const { name, email, password, role, forcePasswordChange } = body;
    if (!name || !email || !password || !role) {
      return Response.json(
        { error: "name, email, password, and role are required" },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const user = await createUser(slug, {
      name,
      email,
      password,
      role,
      forcePasswordChange: forcePasswordChange ?? false,
    });

    const { password: _, ...safe } = user;
    return Response.json({ user: safe }, { status: 201, headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requirePermission(req, "manage_users");
    const slug = await getTenantSlug();
    const body = await req.json();
    const { id, password, ...updates } = body;

    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400, headers: noCacheHeaders() });
    }

    // A password change is handled separately so it gets hashed (updateUser
    // only accepts profile fields). setUserPassword also clears forcePasswordChange,
    // so re-apply the flag afterwards if the caller asked to force a change.
    if (typeof password === "string" && password.length > 0) {
      await setUserPassword(slug, id, password);
    }

    // Only call updateUser if there are profile fields to change (avoids a
    // no-op write when the request was a pure password reset).
    let user = await getUserById(slug, id);
    if (Object.keys(updates).length > 0) {
      user = await updateUser(slug, id, updates);
    }
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404, headers: noCacheHeaders() });
    }

    const { password: _, ...safe } = user;
    return Response.json({ user: safe }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requirePermission(req, "manage_users");
    const slug = await getTenantSlug();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return Response.json({ error: "id query param required" }, { status: 400, headers: noCacheHeaders() });
    }

    await deleteUser(slug, id);
    return Response.json({ success: true }, { headers: noCacheHeaders() });
  } catch (err) {
    return handleAuthError(err);
  }
}
