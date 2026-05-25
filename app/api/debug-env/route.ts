import { noCacheHeaders } from "@/lib/auth";

export async function GET() {
  return Response.json(
    {
      SQL_PROXY_URL: process.env.SQL_PROXY_URL ? `set (${process.env.SQL_PROXY_URL.length} chars)` : "NOT SET",
      SQL_PROXY_API_KEY: process.env.SQL_PROXY_API_KEY ? `set (${process.env.SQL_PROXY_API_KEY.length} chars)` : "NOT SET",
      BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN ? "set" : "NOT SET",
      DEV_TENANT_SLUG: process.env.DEV_TENANT_SLUG || "NOT SET",
      NODE_ENV: process.env.NODE_ENV,
    },
    { headers: noCacheHeaders() }
  );
}
