import { NextRequest } from "next/server";
import { getSession, noCacheHeaders } from "@/lib/auth";
import { listClients } from "@/lib/sqlProxy";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session?.isSuperAdmin) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: noCacheHeaders() }
    );
  }

  try {
    const result = await listClients();
    const clients = result.data.map((c) => ({
      id: c.ClientID,
      name: c.Client,
      kam: c["KAM Name"],
      kamEmail: c["KAM Email"],
    }));
    return Response.json({ clients }, { headers: noCacheHeaders() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: `Failed to fetch SQL clients: ${message}` },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
