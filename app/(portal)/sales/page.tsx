"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import PermissionGate from "@/components/PermissionGate";
import { useColumnWidths, Th } from "@/components/resizableColumns";
import type { SalesDetailRow, MonthSales } from "@/lib/types";
import { useKamFilter } from "@/lib/useKamFilter";

// Granularity. "detail" = store×SKU combos; the rest are the rolled-up aggregates.
type Level = "detail" | "channel" | "store" | "product";
type ColKey = "channel" | "store" | "product" | "value" | "units" | "prev" | "growth";

// Name columns shown per level (figures are always appended). Picking a level
// both re-aggregates the rows and swaps which name columns appear.
const NAME_COLS: Record<Level, ColKey[]> = {
  channel: ["channel"],
  store: ["channel", "store"],
  product: ["product"],
  detail: ["channel", "store", "product"],
};
const VALUE_COLS: ColKey[] = ["value", "units", "prev", "growth"];
const COL_WIDTH: Record<ColKey, number> = {
  channel: 160, store: 260, product: 280, value: 150, units: 120, prev: 150, growth: 110,
};
const RIGHT = new Set<ColKey>(["value", "units", "prev", "growth"]);

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleString("en-ZA", { month: "short", year: "numeric" });
}

function rand(v: number): string {
  return "R " + (v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function SalesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<SalesDetailRow[]>([]); // channel/store/product aggregates
  const [combos, setCombos] = useState<SalesDetailRow[]>([]); // store×SKU (Detail)
  const [period, setPeriod] = useState("");
  const [fetching, setFetching] = useState(true);

  const [view, setView] = useState<string>("ytd"); // "ytd" | "YYYY-MM"
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("all");
  const [level, setLevel] = useState<Level>("store");
  const { kams, kamId, setKamId, matches } = useKamFilter();
  const [sortKey, setSortKey] = useState<ColKey>("value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { widths, startResize, totalWidth } = useColumnWidths(COL_WIDTH);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    authFetch("/api/data/sales")
      .then((r) => r.json())
      .then((d) => {
        setRows(Array.isArray(d.rows) ? d.rows : []);
        setCombos(Array.isArray(d.combos) ? d.combos : []);
        setPeriod(d.period || "");
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [user]);

  const isYtd = view === "ytd";
  const mrow = (r: SalesDetailRow) => r.months?.[view];

  // A month is "live" (still in progress) when explicitly not complete — then we
  // read its to-date figures (compare like-for-like vs prior-year to-date). A
  // SETTLED month reads its FULL calendar-month value (PFM) and FULL prior-year.
  const mLive = (m?: MonthSales) => !!m && m.complete === false;
  const mVal = (m?: MonthSales) => (m ? (mLive(m) ? m.partialValue ?? 0 : m.value) : 0);
  const mUnits = (m?: MonthSales) => (m ? (mLive(m) ? m.partialUnits ?? 0 : m.units) : 0);
  const mPrev = (m?: MonthSales) => (m ? (mLive(m) ? m.partialPyValue ?? 0 : m.pyValue) : 0);

  const val = (r: SalesDetailRow) => (isYtd ? r.ytdValue : mVal(mrow(r)));
  const units = (r: SalesDetailRow) => (isYtd ? r.ytdUnits : mUnits(mrow(r)));
  const prev = (r: SalesDetailRow) => (isYtd ? r.splyValue : mPrev(mrow(r)));
  const grow = (r: SalesDetailRow): number | null => {
    if (isYtd) return r.growthPercent;
    const m = mrow(r);
    const p = mPrev(m);
    const v = mVal(m);
    return p > 0 ? Math.round(((v - p) / p) * 1000) / 10 : null;
  };

  // Detail reads the store×SKU combos; every other level reads its aggregate rows.
  const baseRows = useMemo(
    () => (level === "detail" ? combos : rows.filter((r) => r.level === level)),
    [level, rows, combos]
  );

  // Period dropdown + live-month come from the aggregates (they carry full month
  // history, including back-filled months); Detail only has the current period.
  const months = useMemo(
    () => Array.from(new Set(rows.flatMap((r) => Object.keys(r.months || {})))).sort().reverse(),
    [rows]
  );
  const liveMonth = useMemo(
    () => months.find((m) => rows.some((r) => r.months?.[m]?.complete === false)) || "",
    [months, rows]
  );
  const selectedLive = !isYtd && view === liveMonth;

  const channels = useMemo(
    () => Array.from(new Set(rows.map((r) => r.channelName).filter(Boolean))).sort(),
    [rows]
  );

  const rowText = (r: SalesDetailRow) =>
    [r.channelName, r.storeName, r.productName, r.productId, r.siteCode].filter(Boolean).join(" ");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return baseRows.filter((r) => {
      // Channel filter — skipped for rows with no channel (product aggregates).
      if (channel !== "all" && r.channelName && r.channelName !== channel) return false;
      // KAM ownership: channel for channel/store/detail; brand where the row is a SKU.
      const chForKam = level === "product" ? undefined : r.channelName || undefined;
      const brForKam = level === "product" || level === "detail" ? r.brand : undefined;
      if (!matches(chForKam, brForKam)) return false;
      if (q && !rowText(r).toLowerCase().includes(q)) return false;
      if (view !== "ytd" && !r.months?.[view]) return false;
      return true;
    });
  }, [baseRows, search, channel, level, matches, view]);

  const maxDates = useMemo(
    () => Array.from(new Set(filtered.map((r) => r.maxDate).filter(Boolean))).sort() as string[],
    [filtered]
  );
  // Warn only when the selected month is FULL for some rows but still LIVE for
  // others — then the total mixes a whole month with a partial slice.
  const showMismatch = useMemo(() => {
    if (isYtd) return false;
    let hasComplete = false;
    let hasLive = false;
    for (const r of filtered) {
      const m = r.months?.[view];
      if (!m) continue;
      if (m.complete === false) hasLive = true;
      else hasComplete = true;
    }
    return hasComplete && hasLive;
  }, [filtered, view, isYtd]);

  const sortVal = (r: SalesDetailRow, key: ColKey): number | string => {
    switch (key) {
      case "channel": return r.channelName;
      case "store": return r.storeName || r.siteCode;
      case "product": return r.productName || r.productId;
      case "value": return val(r);
      case "units": return units(r);
      case "prev": return prev(r);
      case "growth": return grow(r) ?? -Infinity;
    }
    return "";
  };

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const av = sortVal(a, sortKey);
      const bv = sortVal(b, sortKey);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, sortDir, view]);

  // Each level is a single grain, so the headline is just its sum — no double-count.
  const totals = useMemo(() => {
    const cur = filtered.reduce((a, r) => a + (val(r) || 0), 0);
    const pv = filtered.reduce((a, r) => a + (prev(r) || 0), 0);
    const growth = pv > 0 ? Math.round(((cur - pv) / pv) * 1000) / 10 : 0;
    return { cur, pv, growth };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, view]);

  function toggleSort(key: string) {
    const k = key as ColKey;
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "channel" || k === "store" || k === "product" ? "asc" : "desc"); }
  }

  const liveSuffix = selectedLive ? " (to date)" : "";
  const viewLabel = isYtd ? "YTD" : monthLabel(view);
  const valLabel = `${viewLabel} Value${liveSuffix}`;
  const unitsLabel = `${viewLabel} Units${liveSuffix}`;
  // Prior-year label = the viewed month one year earlier (PY Aug 2026 → PY Aug 2025).
  const pyMonthLabel = monthLabel(view.replace(/^\d{4}/, (y) => String(Number(y) - 1)));
  const prevLabel = isYtd ? "SPLY Value" : `PY ${pyMonthLabel}${liveSuffix}`;

  const cols = useMemo<ColKey[]>(() => [...NAME_COLS[level], ...VALUE_COLS], [level]);
  const primaryNameCol = NAME_COLS[level][NAME_COLS[level].length - 1];

  const colLabel = (c: ColKey): string => {
    switch (c) {
      case "channel": return "Channel";
      case "store": return "Store";
      case "product": return "Product";
      case "value": return valLabel;
      case "units": return unitsLabel;
      case "prev": return prevLabel;
      case "growth": return "Growth";
    }
    return c;
  };
  const cellText = (c: ColKey, r: SalesDetailRow): string => {
    switch (c) {
      case "channel": return r.channelName || "—";
      case "store": return r.storeName || r.siteCode || "—";
      case "product": return r.productName || r.productId || "—";
      case "value": return rand(val(r));
      case "units": return (units(r) || 0).toLocaleString("en-ZA");
      case "prev": return rand(prev(r));
      case "growth": return grow(r) != null ? `${grow(r)}%` : "—";
    }
    return "";
  };
  const cellClass = (c: ColKey, r: SalesDetailRow): string => {
    if (c === "growth") return `px-3 py-2 text-right font-medium ${(grow(r) ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`;
    if (RIGHT.has(c)) return "px-3 py-2 text-right text-[var(--color-text)]";
    return `px-3 py-2 text-[var(--color-text)] truncate${c === primaryNameCol ? " font-medium" : ""}`;
  };

  if (loading || !user) return null;

  const detailNoData = level === "detail" && combos.length === 0 && rows.length > 0;

  return (
    <PermissionGate permission="view_sales">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-dark)]">Sales</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            {isYtd
              ? "Year-to-date sales vs same period last year (SPLY)"
              : `${viewLabel} ${selectedLive ? "month-to-date" : "full month"} sales vs the same month last year`}
            {!isYtd && maxDates.length === 1 ? ` · data as of ${maxDates[0]}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--color-text-muted)]">Period</label>
          <select
            value={view}
            onChange={(e) => setView(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm bg-white"
          >
            <option value="ytd">YTD (year-to-date)</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
                {m === liveMonth ? " (to date)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showMismatch && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">Heads up — mixed data dates.</span>{" "}
          The channels in view have different “data as of” dates ({maxDates.join(", ")}).
          For {viewLabel}, that means it&apos;s the full month for channels updated within{" "}
          {viewLabel}, but a partial/earlier slice for others. Filter to a single channel
          for a clean comparison.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <StatCard label={valLabel} value={rand(totals.cur)} />
        <StatCard label={prevLabel} value={rand(totals.pv)} />
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
          <option value="channel">Channel</option>
          <option value="store">Store</option>
          <option value="product">Product</option>
          <option value="detail">Detail (store × SKU)</option>
        </select>
        <select value={kamId} onChange={(e) => setKamId(e.target.value)} className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm bg-white">
          <option value="all">All KAMs</option>
          {kams.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
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
            No sales detail for {period || "this period"} yet. Run a sync in Control Centre &rarr; Data Sync.
          </p>
        </div>
      ) : detailNoData ? (
        <div className="text-center py-12 bg-white rounded-xl border border-[var(--color-border)]">
          <p className="text-[var(--color-text-muted)]">
            No store×SKU detail yet — run a fresh Sales sync in Control Centre to populate it.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="text-sm" style={{ tableLayout: "fixed", width: totalWidth(cols), minWidth: "100%" }}>
              <colgroup>
                {cols.map((c) => <col key={c} style={{ width: widths[c] }} />)}
              </colgroup>
              <thead className="sticky top-0 bg-[var(--color-bg)] z-10">
                <tr className="text-left text-[var(--color-text-muted)]">
                  {cols.map((c) => (
                    <Th key={c} label={colLabel(c)} colKey={c} align={RIGHT.has(c) ? "right" : undefined}
                      sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} onResize={startResize(c)} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={`${r.entityId}|${i}`} className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                    {cols.map((c) => (
                      <td key={c} className={cellClass(c, r)}>{cellText(c, r)}</td>
                    ))}
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
