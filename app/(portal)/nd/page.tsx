"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import PermissionGate from "@/components/PermissionGate";
import { useColumnWidths, Th } from "@/components/resizableColumns";
import type { NdDetailRow } from "@/lib/types";
import { useKamFilter } from "@/lib/useKamFilter";

type Level = NdDetailRow["level"];
type SortKey = "name" | "channelName" | "subChannel" | "brand" | "ndPercent" | "rangedCount" | "totalCount";

const COLS: { key: SortKey; label: string; width: number; align?: "right" | "center"; sortable?: boolean }[] = [
  { key: "name", label: "Name", width: 300 },
  { key: "channelName", label: "Channel", width: 120 },
  { key: "subChannel", label: "Sub-Channel", width: 140 },
  { key: "brand", label: "Brand", width: 150 },
  { key: "rangedCount", label: "Distributed", width: 110, align: "right" },
  { key: "totalCount", label: "Ranged", width: 100, align: "right" },
  { key: "ndPercent", label: "ND %", width: 90, align: "right" },
];

// Columns per grain: picking a level swaps both the rows and the columns shown.
const LEVEL_COLS: Record<Level, SortKey[]> = {
  channel: ["name", "rangedCount", "totalCount", "ndPercent"],
  store: ["name", "channelName", "subChannel", "rangedCount", "totalCount", "ndPercent"],
  product: ["name", "brand", "rangedCount", "totalCount", "ndPercent"],
};

function entityName(r: NdDetailRow): string {
  if (r.level === "product") return r.productName || r.productId;
  if (r.level === "store") return r.storeName || r.siteCode;
  return r.channelName;
}

export default function NdPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<NdDetailRow[]>([]);
  const [period, setPeriod] = useState("");
  const [fetching, setFetching] = useState(true);

  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("all");
  const [brand, setBrand] = useState("all");
  const [level, setLevel] = useState<Level>("channel");
  const { kams, kamId, setKamId, matches } = useKamFilter();
  const [sortKey, setSortKey] = useState<SortKey>("ndPercent");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { widths, startResize, totalWidth } = useColumnWidths(
    Object.fromEntries(COLS.map((c) => [c.key, c.width]))
  );

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

  const baseRows = useMemo(() => rows.filter((r) => r.level === level), [rows, level]);
  const cols = useMemo(() => COLS.filter((c) => LEVEL_COLS[level].includes(c.key)), [level]);

  const channels = useMemo(
    () => Array.from(new Set(rows.map((r) => r.channelName).filter(Boolean))).sort(),
    [rows]
  );
  const brands = useMemo(
    () => Array.from(new Set(rows.map((r) => r.brand).filter(Boolean))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return baseRows.filter((r) => {
      // Product rows carry no channel, store/channel rows no brand: each filter
      // only applies where the row has that field.
      if (channel !== "all" && r.channelName && r.channelName !== channel) return false;
      if (brand !== "all" && r.brand && r.brand !== brand) return false;
      if (!matches(r.channelName || undefined, r.brand || undefined)) return false;
      if (q && !entityName(r).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [baseRows, search, channel, brand, matches]);

  const sortRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return (arr: NdDetailRow[]) =>
      [...arr].sort((a, b) => {
        if (sortKey === "name") return entityName(a).localeCompare(entityName(b)) * dir;
        const av = a[sortKey];
        const bv = b[sortKey];
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
      });
  }, [sortKey, sortDir]);

  // DC store rows are split into their own grid below the main one.
  const mainRows = useMemo(
    () => sortRows(filtered.filter((r) => !(r.level === "store" && (r.subChannel || "").toUpperCase() === "DC"))),
    [filtered, sortRows]
  );
  const dcRows = useMemo(
    () => sortRows(filtered.filter((r) => r.level === "store" && (r.subChannel || "").toUpperCase() === "DC")),
    [filtered, sortRows]
  );

  const avgNd = useMemo(() => {
    if (filtered.length === 0) return 0;
    return Math.round((filtered.reduce((a, r) => a + (r.ndPercent || 0), 0) / filtered.length) * 10) / 10;
  }, [filtered]);

  function toggleSort(key: string) {
    const k = key as SortKey;
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  }

  if (loading || !user) return null;

  return (
    <PermissionGate permission="view_nd">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-dark)]">Numerical Distribution</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Ranged product coverage by channel, store and product{period ? ` · ${period}` : ""}
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
          placeholder="Search store / product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm min-w-[220px] flex-1"
        />
        <select value={level} onChange={(e) => setLevel(e.target.value as Level)} className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm bg-white">
          <option value="channel">Channel</option>
          <option value="store">Store</option>
          <option value="product">Product</option>
        </select>
        <select value={kamId} onChange={(e) => setKamId(e.target.value)} className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm bg-white">
          <option value="all">All KAMs</option>
          {kams.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
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
            No ND data for {period || "this period"} yet. Run a sync in Control Centre &rarr; Data Sync.
          </p>
        </div>
      ) : (
        <>
          <Grid rows={mainRows} cols={cols} widths={widths} startResize={startResize} totalWidth={totalWidth(cols.map((c) => c.key))} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
          {dcRows.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-[var(--color-dark)] mb-2">Distribution Centres (DC)</h2>
              <Grid rows={dcRows} cols={cols} widths={widths} startResize={startResize} totalWidth={totalWidth(cols.map((c) => c.key))} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            </div>
          )}
        </>
      )}
    </PermissionGate>
  );
}

function Grid({
  rows, cols, widths, startResize, totalWidth, sortKey, sortDir, onSort,
}: {
  rows: NdDetailRow[];
  cols: typeof COLS;
  widths: Record<string, number>;
  startResize: (k: string) => (e: React.MouseEvent) => void;
  totalWidth: number;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: string) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
      <div className="overflow-x-auto max-h-[70vh]">
        <table className="text-sm" style={{ tableLayout: "fixed", width: totalWidth, minWidth: "100%" }}>
          <colgroup>
            {cols.map((c) => <col key={c.key} style={{ width: widths[c.key] }} />)}
          </colgroup>
          <thead className="sticky top-0 bg-[var(--color-bg)] z-10">
            <tr className="text-left text-[var(--color-text-muted)]">
              {cols.map((c) => (
                <Th key={c.key} label={c.label} colKey={c.key} align={c.align}
                  sortKey={sortKey} sortDir={sortDir}
                  onSort={c.sortable === false ? undefined : onSort}
                  onResize={startResize(c.key)} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.level}|${entityName(r)}|${i}`} className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                {cols.map((c) => <td key={c.key} className={`px-3 py-2 text-[var(--color-text)] ${c.align === "right" ? "text-right" : "truncate"}${c.key === "name" || c.key === "ndPercent" ? " font-medium" : ""}`}>{cell(c.key, r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-2 text-xs text-[var(--color-text-muted)] border-t border-[var(--color-border)]">
        Showing {rows.length.toLocaleString()} rows
      </div>
    </div>
  );
}

function cell(key: SortKey, r: NdDetailRow): string {
  switch (key) {
    case "name": return entityName(r);
    case "rangedCount": return r.rangedCount?.toLocaleString() ?? "—";
    case "totalCount": return r.totalCount?.toLocaleString() ?? "—";
    case "ndPercent": return r.ndPercent != null ? `${r.ndPercent}%` : "—";
    default: return r[key] || "—";
  }
}

function StatCard({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="bg-white rounded-xl border border-[var(--color-border)] p-4">
      <div className="text-2xl font-bold text-[var(--color-dark)]">{value.toLocaleString()}{suffix}</div>
      <div className="text-xs text-[var(--color-text-muted)] mt-1">{label}</div>
    </div>
  );
}
