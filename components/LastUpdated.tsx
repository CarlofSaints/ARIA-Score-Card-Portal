"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/useAuth";

/** "Data last updated 27 Oct 2026, 14:54" (SA time), from the last sync. */
export default function LastUpdated({ className = "" }: { className?: string }) {
  const [at, setAt] = useState<string | null>(null);
  useEffect(() => {
    authFetch("/api/sync/last")
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: { lastSync?: string | null }) => setAt(d.lastSync ?? null))
      .catch(() => {});
  }, []);
  if (!at) return null;
  const when = new Date(at).toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  return <span className={`text-xs text-[var(--color-text-muted)] ${className}`}>Data last updated {when}</span>;
}
