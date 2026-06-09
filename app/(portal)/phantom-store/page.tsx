"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import type { PhantomDetailRow } from "@/lib/types";

type SortKey = "storeName" | "brand" | "productName" | "siteArticleStatus" | "soh" | "ranged";
type RangedFilter = "all" | "ranged" | "not" | "unknown";

export default function PhantomStorePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<PhantomDetailRow[]>([]);
  const [period, setPeriod] = useState<string>("");
  const [fetching, setFetching] = useState(true);

  const [storeSearch, setStoreSearch] = useState("");
  const [brand, setBrand] = useState("all");
  const [ranged, setRanged] = useState<RangedFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("soh");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    authFetch("/api/data/phantom")
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

  const filtered = useMemo(() => {
    const q = storeSearch.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !`${r.storeName} ${r.siteCode}`.toLowerCase().includes(q)) return false;
      if (brand !== "all" && r.brand !== brand) return false;
      if (ranged === "ranged" && r.ranged !== true) return false;
      if (ranged === "not" && r.ranged !== false) return false;
      if (ranged === "unknown" && r.ranged !== null) return false;
      return true;
    });
  }, [rows, storeSearch, brand, ranged]);

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
    const rangedCount = filtered.filter((r) => r.ranged === true).length;
    const negSoh = filtered.filter((r) => r.soh <= 0).length;
    return { items: filtered.length, stores: stores.size, products: prods.size, rangedCount, negSoh };
  }, [filtered]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "soh" ? "asc" : "asc");
    }
  }

  if (loading || !user) return null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-dark)]">Phantom Stock</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Product &amp; store items flagged as phantom stock (PnP){period ? ` · ${period}` : ""}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="Phantom items" value={stats.items} />
        <StatCard label="Stores affected" value={stats.stores} />
        <StatCard label="Products affected" value={stats.products} />
        <StatCard label="Ranged" value={stats.rangedCount} />
        <StatCard label="SOH ≤ 0" value={stats.negSoh} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search store name or code…"
          value={storeSearch}
          onChange={(e) => setStoreSearch(e.target.value)}
          className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm min-w-[220px] flex-1"
        />
        <select
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm bg-white"
        >
          <option value="all">All brands</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select
          value={ranged}
          onChange={(e) => setRanged(e.target.value as RangedFilter)}
          className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm bg-white"
        >
          <option value="all">All ranging</option>
          <option value="ranged">Ranged</option>
          <option value="not">Not ranged</option>
          <option value="unknown">Unknown</option>
        </select>
      </div>

      {/* Table */}
      {fetching ? (
        <div className="text-center py-12 text-[var(--color-text-muted)]">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-[var(--color-border)]">
          <p className="text-[var(--color-text-muted)]">
            No phantom data for {period || "this period"}. Run a sync in Control Centre &rarr; Data Sync.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--color-bg)] z-10">
                <tr className="text-left text-[var(--color-text-muted)]">
                  <Th label="Store" k="storeName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Product" k="productName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Brand" k="brand" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Site Status" k="siteArticleStatus" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="SOH" k="soh" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  <Th label="Ranged" k="ranged" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr
                    key={`${r.siteCode}|${r.productId}|${i}`}
                    className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg)]"
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium text-[var(--color-text)]">{r.storeName}</div>
                      <div className="text-xs text-[var(--color-text-muted)]">{r.siteCode}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-[var(--color-text)]">{r.productName}</div>
                      <div className="text-xs text-[var(--color-text-muted)]">{r.channelArticle}</div>
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text)]">{r.brand || "—"}</td>
                    <td className="px-3 py-2 text-[var(--color-text)]">{r.siteArticleStatus || "—"}</td>
                    <td
                      className={`px-3 py-2 text-right font-medium ${
                        r.soh <= 0 ? "text-red-600" : "text-[var(--color-text)]"
                      }`}
                    >
                      {r.soh}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <RangedBadge ranged={r.ranged} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 text-xs text-[var(--color-text-muted)] border-t border-[var(--color-border)]">
            Showing {sorted.length.toLocaleString()} of {rows.length.toLocaleString()} phantom items
          </div>
        </div>
      )}
    </div>
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
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  align = "left",
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align?: "left" | "right" | "center";
}) {
  const active = sortKey === k;
  return (
    <th
      onClick={() => onSort(k)}
      className={`px-3 py-2 font-semibold cursor-pointer select-none whitespace-nowrap ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      }`}
    >
      {label}
      <span className="ml-1 text-[10px]">{active ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
    </th>
  );
}

function RangedBadge({ ranged }: { ranged: boolean | null }) {
  if (ranged === null)
    return <span className="text-xs text-[var(--color-text-muted)]">—</span>;
  return ranged ? (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
      Yes
    </span>
  ) : (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
      No
    </span>
  );
}
