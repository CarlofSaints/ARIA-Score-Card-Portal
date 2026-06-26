"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import PermissionGate from "@/components/PermissionGate";
import { useColumnWidths, Th } from "@/components/resizableColumns";
import type { SalesDetailRow } from "@/lib/types";

type View = "ytd" | "mtd";
type SortKey = "name" | "level" | "channelName" | "value" | "units" | "prev" | "growth";

const COLS: { key: SortKey; label: string; width: number; align?: "right" | "center"; sortable?: boolean }[] = [
  { key: "name", label: "Entity", width: 300 },
  { key: "level", label: "Level", width: 90 },
  { key: "channelName", label: "Channel", width: 120 },
  { key: "value", label: "Value", width: 140, align: "right" },
  { key: "units", label: "Units", width: 110, align: "right" },
  { key: "prev", label: "Prev", width: 140, align: "right" },
  { key: "growth", label: "Growth", width: 100, align: "right" },
];

function rand(v: number): string {
  return "R " + (v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function entityName(r: SalesDetailRow): string {
  if (r.level === "product") return r.productName || r.productId;
  if (r.level === "store") return r.storeName || r.siteCode;
  return r.channelName;
}

export default function SalesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<SalesDetailRow[]>([]);
  const [period, setPeriod] = useState("");
  const [fetching, setFetching] = useState(true);

  const [view, setView] = useState<View>("ytd");
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { widths, startResize, totalWidth } = useColumnWidths(
    Object.fromEntries(COLS.map((c) => [c.key, c.width]))
  );

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

  // Row accessors switch between YTD and MTD measures.
  const val = (r: SalesDetailRow) => (view === "ytd" ? r.ytdValue : r.mtdValue);
  const units = (r: SalesDetailRow) => (view === "ytd" ? r.ytdUnits : r.mtdUnits);
  const prev = (r: SalesDetailRow) => (view === "ytd" ? r.splyValue : r.pyMtdValue);
  const grow = (r: SalesDetailRow) => (view === "ytd" ? r.growthPercent : r.mtdGrowthPercent);

  // Channel-level rows are no longer shown — only store and product.
  const baseRows = useMemo(() => rows.filter((r) => r.level !== "channel"), [rows]);

  const channels = useMemo(
    () => Array.from(new Set(baseRows.map((r) => r.channelName).filter(Boolean))).sort(),
    [baseRows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return baseRows.filter((r) => {
      if (channel !== "all" && r.channelName !== channel) return false;
      if (q && !entityName(r).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [baseRows, search, channel]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    const accessor: Record<SortKey, (r: SalesDetailRow) => number | string> = {
      name: entityName,
      level: (r) => r.level,
      channelName: (r) => r.channelName,
      value: val,
      units: units,
      prev: prev,
      growth: grow,
    };
    const get = accessor[sortKey];
    arr.sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir, view]);

  const totals = useMemo(() => {
    const cur = filtered.reduce((a, r) => a + (val(r) || 0), 0);
    const pv = filtered.reduce((a, r) => a + (prev(r) || 0), 0);
    const growth = pv > 0 ? Math.round(((cur - pv) / pv) * 1000) / 10 : 0;
    return { cur, pv, growth };
  }, [filtered, view]);

  function toggleSort(key: string) {
    const k = key as SortKey;
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "name" || k === "channelName" || k === "level" ? "asc" : "desc"); }
  }

  const valLabel = view === "ytd" ? "YTD Value" : "MTD Value";
  const unitsLabel = view === "ytd" ? "YTD Units" : "MTD Units";
  const prevLabel = view === "ytd" ? "SPLY Value" : "PY MTD Value";
  const colLabel = (key: SortKey, fallback: string) =>
    key === "value" ? valLabel : key === "units" ? unitsLabel : key === "prev" ? prevLabel : fallback;

  if (loading || !user) return null;

  return (
    <PermissionGate permission="view_sales">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-dark)]">Sales</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            {view === "ytd"
              ? "Year-to-date sales vs same period last year (SPLY)"
              : "Month-to-date sales vs this month last year (TMLY)"}
            {period ? ` · ${period}` : ""}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-[var(--color-border)] overflow-hidden">
          {(["ytd", "mtd"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-2 text-sm font-medium ${
                view === v ? "bg-[var(--color-primary)] text-white" : "bg-white text-[var(--color-text)]"
              }`}
            >
              {v.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <StatCard label={valLabel} value={rand(totals.cur)} />
        <StatCard label={prevLabel} value={rand(totals.pv)} />
        <StatCard label="Growth" value={`${totals.growth}%`} accent={totals.growth >= 0 ? "pos" : "neg"} />
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search store / product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm min-w-[220px] flex-1"
        />
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
            No sales detail for {period || "this period"} yet. Run a sync in Control Centre &rarr; Data Sync.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="text-sm" style={{ tableLayout: "fixed", width: totalWidth(COLS.map((c) => c.key)), minWidth: "100%" }}>
              <colgroup>
                {COLS.map((c) => <col key={c.key} style={{ width: widths[c.key] }} />)}
              </colgroup>
              <thead className="sticky top-0 bg-[var(--color-bg)] z-10">
                <tr className="text-left text-[var(--color-text-muted)]">
                  {COLS.map((c) => (
                    <Th key={c.key} label={colLabel(c.key, c.label)} colKey={c.key} align={c.align}
                      sortKey={sortKey} sortDir={sortDir}
                      onSort={c.sortable === false ? undefined : toggleSort}
                      onResize={startResize(c.key)} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={`${r.level}|${entityName(r)}|${i}`} className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                    <td className="px-3 py-2 font-medium text-[var(--color-text)] truncate">{entityName(r)}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)] capitalize">{r.level}</td>
                    <td className="px-3 py-2 text-[var(--color-text)] truncate">{r.channelName || "—"}</td>
                    <td className="px-3 py-2 text-right text-[var(--color-text)]">{rand(val(r))}</td>
                    <td className="px-3 py-2 text-right text-[var(--color-text)]">{(units(r) || 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-[var(--color-text)]">{rand(prev(r))}</td>
                    <td className={`px-3 py-2 text-right font-medium ${(grow(r) ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {grow(r) != null ? `${grow(r)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 text-xs text-[var(--color-text-muted)] border-t border-[var(--color-border)]">
            Showing {sorted.length.toLocaleString()} of {baseRows.length.toLocaleString()} rows
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
