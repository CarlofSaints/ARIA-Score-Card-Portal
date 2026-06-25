"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import PermissionGate from "@/components/PermissionGate";
import type { SalesDetailRow } from "@/lib/types";

type Level = "all" | "channel" | "store" | "product";
type SortKey = "name" | "channelName" | "ytdValue" | "ytdUnits" | "splyValue" | "growthPercent";

function rand(v: number): string {
  return "R " + (v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function SalesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<SalesDetailRow[]>([]);
  const [period, setPeriod] = useState("");
  const [fetching, setFetching] = useState(true);

  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<Level>("all");
  const [channel, setChannel] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("ytdValue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    authFetch("/api/data/sales")
      .then((r) => r.json())
      .then((d) => {
        setRows(Array.isArray(d.rows) ? d.rows : []);
        setPeriod(d.period || "");
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [user]);

  const channels = useMemo(
    () => Array.from(new Set(rows.map((r) => r.channelName).filter(Boolean))).sort(),
    [rows]
  );

  function entityName(r: SalesDetailRow): string {
    if (r.level === "product") return r.productName || r.productId;
    if (r.level === "store") return r.storeName || r.siteCode;
    return r.channelName;
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (level !== "all" && r.level !== level) return false;
      if (channel !== "all" && r.channelName !== channel) return false;
      if (q && !entityName(r).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, level, channel]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sortKey === "name") return entityName(a).localeCompare(entityName(b)) * dir;
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => {
    const ytd = filtered.reduce((a, r) => a + (r.ytdValue || 0), 0);
    const sply = filtered.reduce((a, r) => a + (r.splyValue || 0), 0);
    const growth = sply > 0 ? Math.round(((ytd - sply) / sply) * 1000) / 10 : 0;
    return { ytd, sply, growth };
  }, [filtered]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" || key === "channelName" ? "asc" : "desc"); }
  }

  if (loading || !user) return null;

  return (
    <PermissionGate permission="view_sales">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-dark)]">Sales</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Year-to-date sales vs same period last year (SPLY){period ? ` · ${period}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <StatCard label="YTD Sales" value={rand(totals.ytd)} />
        <StatCard label="SPLY Sales" value={rand(totals.sply)} />
        <StatCard label="Growth" value={`${totals.growth}%`} accent={totals.growth >= 0 ? "pos" : "neg"} />
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search channel / store / product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm min-w-[220px] flex-1"
        />
        <select value={level} onChange={(e) => setLevel(e.target.value as Level)} className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm bg-white">
          <option value="all">All levels</option>
          <option value="channel">Channel</option>
          <option value="store">Store</option>
          <option value="product">Product</option>
        </select>
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm bg-white">
          <option value="all">All channels</option>
          {channels.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {fetching ? (
        <div className="text-center py-12 text-[var(--color-text-muted)]">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-[var(--color-border)]">
          <p className="text-[var(--color-text-muted)]">
            No sales detail for {period || "this period"} yet. The detailed sales query is being
            finalised — once it&apos;s wired into the sync, data will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--color-bg)] z-10">
                <tr className="text-left text-[var(--color-text-muted)]">
                  <Th label="Entity" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <th className="px-3 py-2 font-semibold">Level</th>
                  <Th label="Channel" k="channelName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="YTD Value" k="ytdValue" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <Th label="YTD Units" k="ytdUnits" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <Th label="SPLY Value" k="splyValue" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <Th label="Growth" k="growthPercent" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={`${r.level}|${entityName(r)}|${i}`} className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                    <td className="px-3 py-2 font-medium text-[var(--color-text)]">{entityName(r)}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)] capitalize">{r.level}</td>
                    <td className="px-3 py-2 text-[var(--color-text)]">{r.channelName || "—"}</td>
                    <td className="px-3 py-2 text-right text-[var(--color-text)]">{rand(r.ytdValue)}</td>
                    <td className="px-3 py-2 text-right text-[var(--color-text)]">{(r.ytdUnits || 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-[var(--color-text)]">{rand(r.splyValue)}</td>
                    <td className={`px-3 py-2 text-right font-medium ${(r.growthPercent ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {r.growthPercent != null ? `${r.growthPercent}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 text-xs text-[var(--color-text-muted)] border-t border-[var(--color-border)]">
            Showing {sorted.length.toLocaleString()} of {rows.length.toLocaleString()} rows
          </div>
        </div>
      )}
    </PermissionGate>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: "pos" | "neg" }) {
  const color = accent === "pos" ? "text-green-600" : accent === "neg" ? "text-red-600" : "text-[var(--color-dark)]";
  return (
    <div className="bg-white rounded-xl border border-[var(--color-border)] p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-[var(--color-text-muted)] mt-1">{label}</div>
    </div>
  );
}

function Th({
  label, k, sortKey, sortDir, onSort, align = "left",
}: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: "asc" | "desc"; onSort: (k: SortKey) => void; align?: "left" | "right" | "center";
}) {
  const active = sortKey === k;
  return (
    <th onClick={() => onSort(k)} className={`px-3 py-2 font-semibold cursor-pointer select-none whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}>
      {label}
      <span className="ml-1 text-[10px]">{active ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
    </th>
  );
}
