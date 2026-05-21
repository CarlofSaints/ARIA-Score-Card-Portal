import { NextRequest } from "next/server";
import { readJson, writeJson } from "@/lib/blob";
import type { SuperAdmin } from "@/lib/types";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { noCacheHeaders } from "@/lib/auth";

const SA_KEY = "_platform/super-admins.json";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-seed-secret");
  if (!secret || secret !== process.env.SUPER_ADMIN_SEED_SECRET) {
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
    if (existing.some((sa) => sa.email.toLowerCase() === email.toLowerCase())) {
      return Response.json(
        { error: "Super admin with that email already exists" },
        { status: 409, headers: noCacheHeaders() }
      );
    }

    const hash = await bcrypt.hash(password, 10);
    const admin: SuperAdmin = {
      id: uuid(),
      name,
      email: email.toLowerCase(),
      password: hash,
      createdAt: new Date().toISOString(),
    };

    existing.push(admin);
    await writeJson(SA_KEY, existing);

    return Response.json(
      { success: true, id: admin.id },
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
