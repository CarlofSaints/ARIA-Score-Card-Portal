"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import PermissionGate from "@/components/PermissionGate";
import type { OosDetailRow } from "@/lib/types";

type SortKey = "storeName" | "subChannel" | "brand" | "productName";

export default function OosPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<OosDetailRow[]>([]);
  const [period, setPeriod] = useState("");
  const [fetching, setFetching] = useState(true);

  const [storeSearch, setStoreSearch] = useState("");
  const [brand, setBrand] = useState("all");
  const [channel, setChannel] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("storeName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    authFetch("/api/data/oos")
      .then((r) => r.json())
      .then((d) => {
        setRows(Array.isArray(d.rows) ? d.rows : []);
        setPeriod(d.period || "");
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [user]);

  const brands = useMemo(
    () => Array.from(new Set(rows.map((r) => r.brand).filter(Boolean))).sort(),
    [rows]
  );
  const channels = useMemo(
    () => Array.from(new Set(rows.map((r) => r.channelName).filter(Boolean))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = storeSearch.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !`${r.storeName} ${r.siteCode}`.toLowerCase().includes(q)) return false;
      if (brand !== "all" && r.brand !== brand) return false;
      if (channel !== "all" && r.channelName !== channel) return false;
      return true;
    });
  }, [rows, storeSearch, brand, channel]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const stats = useMemo(() => {
    const stores = new Set(filtered.map((r) => r.siteCode));
    const prods = new Set(filtered.map((r) => r.productId));
    return { items: filtered.length, stores: stores.size, products: prods.size };
  }, [filtered]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  if (loading || !user) return null;

  return (
    <PermissionGate permission="view_oos">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-dark)]">Out of Stocks</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Ranged site-SKU combinations with no stock on hand{period ? ` · ${period}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <StatCard label="OOS items" value={stats.items} />
        <StatCard label="Stores affected" value={stats.stores} />
        <StatCard label="Products affected" value={stats.products} />
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search store name or code…"
          value={storeSearch}
          onChange={(e) => setStoreSearch(e.target.value)}
          className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm min-w-[220px] flex-1"
        />
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
            No OOS data for {period || "this period"} yet. The OOS query is being finalised —
            once it&apos;s wired into the sync, data will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--color-bg)] z-10">
                <tr className="text-left text-[var(--color-text-muted)]">
                  <Th label="Store" k="storeName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Sub-Channel" k="subChannel" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Product" k="productName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Brand" k="brand" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={`${r.siteCode}|${r.productId}|${i}`} className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                    <td className="px-3 py-2">
                      <div className="font-medium text-[var(--color-text)]">{r.storeName}</div>
                      <div className="text-xs text-[var(--color-text-muted)]">{r.siteCode}</div>
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text)]">{r.subChannel || "—"}</td>
                    <td className="px-3 py-2 text-[var(--color-text)]">{r.productName}</td>
                    <td className="px-3 py-2 text-[var(--color-text)]">{r.brand || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 text-xs text-[var(--color-text-muted)] border-t border-[var(--color-border)]">
            Showing {sorted.length.toLocaleString()} of {rows.length.toLocaleString()} OOS items
          </div>
        </div>
      )}
    </PermissionGate>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-[var(--color-border)] p-4">
      <div className="text-2xl font-bold text-[var(--color-dark)]">{value.toLocaleString()}</div>
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
    <th onClick={() => onSort(k)} className={`px-3 py-2 font-semibold cursor-pointer select-none whitespace-nowrap ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"}`}>
      {label}
      <span className="ml-1 text-[10px]">{active ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
    </th>
  );
}
