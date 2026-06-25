"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import PermissionGate from "@/components/PermissionGate";
import type { NdDetailRow } from "@/lib/types";

type Level = "all" | "channel" | "store" | "product";
type SortKey = "name" | "channelName" | "brand" | "ndPercent" | "rangedCount" | "totalCount";

export default function NdPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<NdDetailRow[]>([]);
  const [period, setPeriod] = useState("");
  const [fetching, setFetching] = useState(true);

  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<Level>("all");
  const [channel, setChannel] = useState("all");
  const [brand, setBrand] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("ndPercent");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    authFetch("/api/data/nd")
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

  const brands = useMemo(
    () => Array.from(new Set(rows.map((r) => r.brand).filter(Boolean))).sort(),
    [rows]
  );

  function entityName(r: NdDetailRow): string {
    if (r.level === "product") return r.productName || r.productId;
    if (r.level === "store") return r.storeName || r.siteCode;
    return r.channelName;
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (level !== "all" && r.level !== level) return false;
      if (channel !== "all" && r.channelName !== channel) return false;
      if (brand !== "all" && r.brand !== brand) return false;
      if (q && !entityName(r).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, level, channel, brand]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sortKey === "name") return entityName(a).localeCompare(entityName(b)) * dir;
      if (sortKey === "brand") return String(a.brand ?? "").localeCompare(String(b.brand ?? "")) * dir;
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const avgNd = useMemo(() => {
    if (filtered.length === 0) return 0;
    return Math.round((filtered.reduce((a, r) => a + (r.ndPercent || 0), 0) / filtered.length) * 10) / 10;
  }, [filtered]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "ndPercent" ? "asc" : "asc"); }
  }

  if (loading || !user) return null;

  return (
    <PermissionGate permission="view_nd">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-dark)]">Numerical Distribution</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Ranged product coverage across channels, stores and products{period ? ` · ${period}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <StatCard label="Rows" value={filtered.length} />
        <StatCard label="Avg ND %" value={avgNd} suffix="%" />
        <StatCard label="Channels" value={channels.length} />
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
        <select value={brand} onChange={(e) => setBrand(e.target.value)} className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm bg-white">
          <option value="all">All brands</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {fetching ? (
        <div className="text-center py-12 text-[var(--color-text-muted)]">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-[var(--color-border)]">
          <p className="text-[var(--color-text-muted)]">
            No ND data for {period || "this period"} yet. The ND queries are being finalised —
            once they&apos;re wired into the sync, data will appear here automatically.
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
                  <Th label="Brand" k="brand" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Ranged" k="rangedCount" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <Th label="Total" k="totalCount" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <Th label="ND %" k="ndPercent" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={`${r.level}|${entityName(r)}|${i}`} className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                    <td className="px-3 py-2 font-medium text-[var(--color-text)]">{entityName(r)}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)] capitalize">{r.level}</td>
                    <td className="px-3 py-2 text-[var(--color-text)]">{r.channelName || "—"}</td>
                    <td className="px-3 py-2 text-[var(--color-text)]">{r.brand || "—"}</td>
                    <td className="px-3 py-2 text-right text-[var(--color-text)]">{r.rangedCount?.toLocaleString() ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-[var(--color-text)]">{r.totalCount?.toLocaleString() ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-medium text-[var(--color-text)]">{r.ndPercent != null ? `${r.ndPercent}%` : "—"}</td>
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

function StatCard({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="bg-white rounded-xl border border-[var(--color-border)] p-4">
      <div className="text-2xl font-bold text-[var(--color-dark)]">{value.toLocaleString()}{suffix}</div>
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
