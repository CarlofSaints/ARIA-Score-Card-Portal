import { NextRequest } from "next/server";
import { readJson, writeJson } from "@/lib/blob";
import type { SuperAdmin } from "@/lib/types";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { noCacheHeaders } from "@/lib/auth";
import { createHash, timingSafeEqual } from "crypto";

const SA_KEY = "_platform/super-admins.json";

// Hash both sides so lengths match and the compare stays constant-time.
function secretMatches(given: string | null): boolean {
  const expected = process.env.SUPER_ADMIN_SEED_SECRET;
  if (!given || !expected) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  // Off in production unless explicitly switched on for a one-off seed.
  if (process.env.NODE_ENV === "production" && process.env.SEED_ENABLED !== "1") {
    return Response.json({ error: "Not found" }, { status: 404, headers: noCacheHeaders() });
  }

  if (!secretMatches(req.headers.get("x-seed-secret"))) {
    return Response.json(
      { error: "Invalid seed secret" },
      { status: 403, headers: noCacheHeaders() }
    );
  }

  try {
    const { email, name, password } = await req.json();
    if (!email || !name || !password) {
      return Response.json(
        { error: "email, name, and password are required" },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const existing = await readJson<SuperAdmin[]>(SA_KEY, []);
    // Never overwrite an existing super admin.
    if (existing.some((sa) => sa.email.toLowerCase() === email.toLowerCase())) {
      return Response.json(
        { error: "Super admin already exists" },
        { status: 409, headers: noCacheHeaders() }
      );
    }

    const hash = await bcrypt.hash(password, 10);
    const adminId = uuid();
    existing.push({
      id: adminId,
      name,
      email: email.toLowerCase(),
      password: hash,
      createdAt: new Date().toISOString(),
    });

    await writeJson(SA_KEY, existing);

    return Response.json(
      { success: true, id: adminId },
      { headers: noCacheHeaders() }
    );
  } catch (err) {
    console.error("Seed error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
