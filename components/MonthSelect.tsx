"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/useAuth";
import { monthLabel } from "@/components/ScoreTable";

/**
 * Month picker for the detail pages: the months that have a synced snapshot
 * (same list as the scorecards). "" = the current month.
 */
export default function MonthSelect({ value, onChange }: { value: string; onChange: (period: string) => void }) {
  const [periods, setPeriods] = useState<string[]>([]);
  const [current, setCurrent] = useState("");

  useEffect(() => {
    authFetch("/api/scores/periods")
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: { periods?: string[]; current?: string }) => {
        setPeriods(d.periods ?? []);
        setCurrent(d.current ?? "");
      })
      .catch(() => {});
  }, []);

  return (
    <select value={value || current} onChange={(e) => onChange(e.target.value === current ? "" : e.target.value)}
      aria-label="Month" className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm bg-white">
      {(periods.length ? periods : [current]).filter(Boolean).map((p) => (
        <option key={p} value={p}>{monthLabel(p)}{p === current ? " (current)" : ""}</option>
      ))}
    </select>
  );
}
