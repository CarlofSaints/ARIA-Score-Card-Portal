"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { KPI_DEFS, MODULE_DEFS } from "@/lib/modules";
import type {
  KpiWeighting,
  KpiScoringConfig,
  KpiKey,
  ScoreBracket,
  SalesGrowthMetric,
} from "@/lib/types";

const GROWTH_METRICS: { value: SalesGrowthMetric; label: string; disabled?: boolean }[] = [
  { value: "ytd_vs_ytd", label: "YTD vs YTD (year-to-date vs last year)" },
  { value: "tm_vs_tmly", label: "TM vs TMLY (this month vs same month last year)" },
  { value: "tm_vs_lm", label: "TM vs LM (this month vs last month)" },
];

interface SyncMeta {
  lastSync?: string;
  lastAutoSync?: string;
  lastSyncSource?: "manual" | "cron";
  channelCount?: number;
  storeCount?: number;
  productCount?: number;
  brandCount?: number;
  salesChannelCount?: number;
  salesStoreCount?: number;
  salesProductCount?: number;
  oosDetailCount?: number;
  phantomDetailCount?: number;
  ndDetailCount?: number;
}

export default function ControlCentrePage() {
  const { user, loading, hasRole } = useAuth();
  const router = useRouter();
  const tenant = useTenant();

  const [weightings, setWeightings] = useState<KpiWeighting[]>([]);
  const [scoring, setScoring] = useState<KpiScoringConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncMeta, setSyncMeta] = useState<SyncMeta | null>(null);

  // Phantom config
  const [phantomDays, setPhantomDays] = useState(60);
  const [phantomSaving, setPhantomSaving] = useState(false);
  const [phantomMessage, setPhantomMessage] = useState("");

  // Numerical Distribution config (SP @ScanRange — rolling scan window)
  const [ndDays, setNdDays] = useState(60);
  const [ndSaving, setNdSaving] = useState(false);
  const [ndMessage, setNdMessage] = useState("");

  // Auto-sync schedule (per-tenant, whole hours in SAST)
  const [syncTimes, setSyncTimes] = useState<string[]>([]);
  const [addHour, setAddHour] = useState("08:00");
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState("");

  useEffect(() => {
    if (!loading && !hasRole("admin")) {
      router.push("/");
    }
  }, [loading, hasRole, router]);

  useEffect(() => {
    if (user && hasRole("admin")) {
      authFetch("/api/kpi-weightings")
        .then((r) => r.json())
        .then((data) => setWeightings(data.weightings || []))
        .catch(() => {});

      authFetch("/api/kpi-scoring")
        .then((r) => r.json())
        .then((data) => setScoring(data.scoring || []))
        .catch(() => {});

      authFetch("/api/sync")
        .then((r) => r.json())
        .then((data) => setSyncMeta(data))
        .catch(() => {});

      authFetch("/api/tenant-config/phantom")
        .then((r) => r.json())
        .then((data) => {
          if (data.phantomLookbackDays) setPhantomDays(data.phantomLookbackDays);
        })
        .catch(() => {});

      authFetch("/api/tenant-config/nd")
        .then((r) => r.json())
        .then((data) => {
          if (data.ndRollingDays) setNdDays(data.ndRollingDays);
        })
        .catch(() => {});

      authFetch("/api/tenant-config/sync-schedule")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data.syncTimes)) setSyncTimes(data.syncTimes);
        })
        .catch(() => {});
    }
  }, [user]);

  function updateWeight(key: string, value: number) {
    setWeightings((prev) =>
      prev.map((w) => (w.key === key ? { ...w, weight: value } : w))
    );
  }

  const totalWeight = weightings.reduce((sum, w) => sum + w.weight, 0);

  // ── Scoring (points brackets) helpers ──
  function scoringFor(key: KpiKey): KpiScoringConfig {
    return (
      scoring.find((s) => s.key === key) || { key, brackets: [] }
    );
  }

  function updateScoring(key: KpiKey, next: Partial<KpiScoringConfig>) {
    setScoring((prev) => {
      const exists = prev.some((s) => s.key === key);
      const base = exists
        ? prev
        : [...prev, { key, brackets: [] } as KpiScoringConfig];
      return base.map((s) => (s.key === key ? { ...s, ...next } : s));
    });
  }

  function updateBracket(key: KpiKey, idx: number, field: keyof ScoreBracket, value: number) {
    const cfg = scoringFor(key);
    const brackets = cfg.brackets.map((b, i) =>
      i === idx ? { ...b, [field]: value } : b
    );
    updateScoring(key, { brackets });
  }

  function addBracket(key: KpiKey) {
    const cfg = scoringFor(key);
    const last = cfg.brackets[cfg.brackets.length - 1];
    const newBracket: ScoreBracket = last
      ? { min: last.max, max: last.max + 10, points: last.points }
      : { min: 0, max: 100, points: 0 };
    updateScoring(key, { brackets: [...cfg.brackets, newBracket] });
  }

  function removeBracket(key: KpiKey, idx: number) {
    const cfg = scoringFor(key);
    updateScoring(key, { brackets: cfg.brackets.filter((_, i) => i !== idx) });
  }

  async function handleSave() {
    setMessage("");
    if (totalWeight !== 100) {
      setMessage(`Weights must total 100 (currently ${totalWeight})`);
      return;
    }
    setSaving(true);
    try {
      const [wRes, sRes] = await Promise.all([
        authFetch("/api/kpi-weightings", {
          method: "PUT",
          body: JSON.stringify({ weightings }),
        }),
        authFetch("/api/kpi-scoring", {
          method: "PUT",
          body: JSON.stringify({ scoring }),
        }),
      ]);
      if (wRes.ok && sRes.ok) setMessage("Saved successfully");
      else {
        const err = !sRes.ok ? await sRes.json().catch(() => ({})) : {};
        setMessage(err.error || "Failed to save");
      }
    } catch {
      setMessage("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function runSync() {
    setSyncing(true);
    setSyncMessage("");
    try {
      const res = await authFetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSyncMessage(
          `Synced: ${data.counts.channels} channels, ${data.counts.stores} stores, ${data.counts.products} products, ${data.counts.salesDetail} sales, ${data.counts.oosDetail} OOS, ${data.counts.ndDetail} ND, ${data.counts.phantomDetail} phantom`
        );
        setSyncMeta((prev) => ({
          ...prev,
          lastSync: new Date().toISOString(),
          lastSyncSource: "manual",
          channelCount: data.counts.channels,
          storeCount: data.counts.stores,
          productCount: data.counts.products,
          brandCount: data.counts.brands,
          salesChannelCount: data.counts.salesChannels,
          salesStoreCount: data.counts.salesStores,
          salesProductCount: data.counts.salesProducts,
          oosDetailCount: data.counts.oosDetail,
          phantomDetailCount: data.counts.phantomDetail,
          ndDetailCount: data.counts.ndDetail,
        }));
      } else {
        setSyncMessage(data.error || "Sync failed");
      }
    } catch {
      setSyncMessage("Network error during sync");
    } finally {
      setSyncing(false);
    }
  }

  async function handlePhantomSave() {
    setPhantomMessage("");
    setPhantomSaving(true);
    try {
      const res = await authFetch("/api/tenant-config/phantom", {
        method: "PUT",
        body: JSON.stringify({ phantomLookbackDays: phantomDays }),
      });
      if (res.ok) {
        // The lookback only changes the phantom data once a sync re-runs the SP,
        // so kick off a resync — fire-and-forget so the Save button releases
        // immediately and the Data Sync section shows its own progress.
        setPhantomMessage("Saved · re-syncing in the background…");
        void runSync();
      } else {
        setPhantomMessage("Failed to save");
      }
    } catch {
      setPhantomMessage("Network error");
    } finally {
      setPhantomSaving(false);
    }
  }

  async function handleNdSave() {
    setNdMessage("");
    setNdSaving(true);
    try {
      const res = await authFetch("/api/tenant-config/nd", {
        method: "PUT",
        body: JSON.stringify({ ndRollingDays: ndDays }),
      });
      if (res.ok) {
        // The scan window only changes the ND data once a sync re-runs the SP,
        // so kick off a resync — fire-and-forget so the Save button releases
        // immediately and the Data Sync section shows its own progress.
        setNdMessage("Saved · re-syncing in the background…");
        void runSync();
      } else {
        setNdMessage("Failed to save");
      }
    } catch {
      setNdMessage("Network error");
    } finally {
      setNdSaving(false);
    }
  }

  function addScheduleTime() {
    setScheduleMessage("");
    setSyncTimes((prev) =>
      prev.includes(addHour) ? prev : [...prev, addHour].sort()
    );
  }

  function removeScheduleTime(t: string) {
    setScheduleMessage("");
    setSyncTimes((prev) => prev.filter((x) => x !== t));
  }

  async function handleScheduleSave() {
    setScheduleMessage("");
    setScheduleSaving(true);
    try {
      const res = await authFetch("/api/tenant-config/sync-schedule", {
        method: "PUT",
        body: JSON.stringify({ syncTimes }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.syncTimes)) setSyncTimes(data.syncTimes);
        setScheduleMessage("Saved successfully");
      } else {
        setScheduleMessage("Failed to save");
      }
    } catch {
      setScheduleMessage("Network error");
    } finally {
      setScheduleSaving(false);
    }
  }

  if (loading || !user) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-dark)] mb-6">
        Control Centre
      </h1>

      {/* KPI Weightings */}
      <section className="bg-white rounded-xl border border-[var(--color-border)] p-6 mb-6">
        <h2 className="text-lg font-semibold text-[var(--color-dark)] mb-2">
          KPI Weightings &amp; Points
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-4">
          Each KPI&apos;s weight is its points pool (weights must total 100). Under each, define how the
          metric % converts to points using brackets — for Sales, pick the growth metric first.
        </p>

        <div className="space-y-4">
          {KPI_DEFS.map((kpi) => {
            const w = weightings.find((w) => w.key === kpi.key);
            const val = w?.weight ?? kpi.defaultWeight;
            return (
              <div key={kpi.key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-[var(--color-text)]">
                    {kpi.label}
                  </span>
                  <span className="text-sm font-mono text-[var(--color-text-muted)]">
                    {val}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={val}
                  onChange={(e) => updateWeight(kpi.key, Number(e.target.value))}
                  className="w-full accent-[var(--color-primary)]"
                />
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  {kpi.description}
                </p>

                {/* Points brackets */}
                <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[var(--color-text)]">
                      Points allotment ({val} pts pool)
                    </span>
                    <span className="text-[11px] text-[var(--color-text-muted)]">
                      {kpi.key === "phantom_inventory" || kpi.key === "oos"
                        ? "Lower % → more points"
                        : "Higher % → more points"}
                    </span>
                  </div>

                  {kpi.key === "sales_growth" && (
                    <div className="mb-3">
                      <label className="block text-[11px] text-[var(--color-text-muted)] mb-1">
                        Growth metric
                      </label>
                      <select
                        value={scoringFor("sales_growth").salesGrowthMetric || "ytd_vs_ytd"}
                        onChange={(e) =>
                          updateScoring("sales_growth", {
                            salesGrowthMetric: e.target.value as SalesGrowthMetric,
                          })
                        }
                        className="w-full px-2 py-1.5 rounded-md border border-[var(--color-border)] text-xs bg-white"
                      >
                        {GROWTH_METRICS.map((m) => (
                          <option key={m.value} value={m.value} disabled={m.disabled}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {scoringFor(kpi.key).brackets.map((b, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs">
                        <input
                          type="number"
                          value={b.min}
                          onChange={(e) => updateBracket(kpi.key, i, "min", Number(e.target.value))}
                          className="w-16 px-1.5 py-1 rounded border border-[var(--color-border)] bg-white text-right"
                        />
                        <span className="text-[var(--color-text-muted)]">to</span>
                        <input
                          type="number"
                          value={b.max}
                          onChange={(e) => updateBracket(kpi.key, i, "max", Number(e.target.value))}
                          className="w-16 px-1.5 py-1 rounded border border-[var(--color-border)] bg-white text-right"
                        />
                        <span className="text-[var(--color-text-muted)]">% →</span>
                        <input
                          type="number"
                          value={b.points}
                          onChange={(e) => updateBracket(kpi.key, i, "points", Number(e.target.value))}
                          className="w-16 px-1.5 py-1 rounded border border-[var(--color-border)] bg-white text-right"
                        />
                        <span className="text-[var(--color-text-muted)]">pts</span>
                        <button
                          type="button"
                          onClick={() => removeBracket(kpi.key, i)}
                          className="ml-auto px-1.5 py-1 rounded text-[var(--color-text-muted)] hover:bg-red-50 hover:text-red-600"
                          aria-label="Remove bracket"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => addBracket(kpi.key)}
                    className="mt-2 px-2.5 py-1 rounded-md border border-[var(--color-border)] bg-white text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)]"
                  >
                    + Add bracket
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-6">
          <div className={`text-sm font-semibold ${totalWeight === 100 ? "text-green-600" : "text-red-600"}`}>
            Total: {totalWeight} / 100
          </div>
          <div className="flex items-center gap-3">
            {message && (
              <span className={`text-sm ${message.includes("Saved") ? "text-green-600" : "text-red-600"}`}>
                {message}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving || totalWeight !== 100}
              className="px-6 py-2 rounded-lg bg-[var(--color-primary)] text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </section>

      {/* Phantom Stock Settings */}
      <section className="bg-white rounded-xl border border-[var(--color-border)] p-6 mb-6">
        <h2 className="text-lg font-semibold text-[var(--color-dark)] mb-2">
          Phantom Stock Settings
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-4">
          Phantom stock is when a product shows stock on hand (SOH) but has had no sales or stock movement
          over a defined period. This typically indicates a system discrepancy — the stock may not physically
          exist on the shelf.
        </p>

        <div className="flex items-end gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
              Lookback Period (days)
            </label>
            <input
              type="number"
              min={7}
              max={365}
              value={phantomDays}
              onChange={(e) => setPhantomDays(Math.max(7, Math.min(365, Number(e.target.value) || 60)))}
              className="w-32 rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePhantomSave}
              disabled={phantomSaving}
              className="px-6 py-2.5 rounded-lg bg-[var(--color-primary)] text-sm font-medium text-white disabled:opacity-50"
            >
              {phantomSaving ? "Saving..." : "Save"}
            </button>
            {phantomMessage && (
              <span className={`text-sm ${phantomMessage.includes("Saved") ? "text-green-600" : "text-red-600"}`}>
                {phantomMessage}
              </span>
            )}
          </div>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          Products where SOH has not changed and no sales have been recorded in the last {phantomDays} days
          will be flagged as phantom stock. After changing this, run a sync to recalculate.
        </p>
      </section>

      {/* Numerical Distribution Settings */}
      <section className="bg-white rounded-xl border border-[var(--color-border)] p-6 mb-6">
        <h2 className="text-lg font-semibold text-[var(--color-dark)] mb-2">
          Numerical Distribution Settings
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-4">
          Numerical distribution measures how widely a product is actually present across ranged stores.
          The rolling window sets how many days back the calculation looks for distribution (scans / stock
          presence) when determining whether a product is distributed in a store.
        </p>

        <div className="flex items-end gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
              Numerical Distribution Rolling Days
            </label>
            <input
              type="number"
              min={7}
              max={365}
              value={ndDays}
              onChange={(e) => setNdDays(Math.max(7, Math.min(365, Number(e.target.value) || 60)))}
              className="w-32 rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleNdSave}
              disabled={ndSaving}
              className="px-6 py-2.5 rounded-lg bg-[var(--color-primary)] text-sm font-medium text-white disabled:opacity-50"
            >
              {ndSaving ? "Saving..." : "Save"}
            </button>
            {ndMessage && (
              <span className={`text-sm ${ndMessage.includes("Saved") ? "text-green-600" : "text-red-600"}`}>
                {ndMessage}
              </span>
            )}
          </div>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          Distribution is evaluated over the last {ndDays} days (passed to the SP as the scan range).
          After changing this, run a sync to recalculate.
        </p>
      </section>

      {/* Auto-Sync Schedule */}
      <section className="bg-white rounded-xl border border-[var(--color-border)] p-6 mb-6">
        <h2 className="text-lg font-semibold text-[var(--color-dark)] mb-2">
          Auto-Sync Schedule
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-4">
          Automatically pull fresh data from SQL Server at set times each day (South African time).
          For example, add 08:00 and 14:00 to refresh every morning and afternoon. Leave empty to
          sync manually only.
        </p>

        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
              Add a time
            </label>
            <select
              value={addHour}
              onChange={(e) => setAddHour(e.target.value)}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm bg-white focus:border-[var(--color-primary)] focus:outline-none"
            >
              {Array.from({ length: 24 }, (_, h) => {
                const v = `${String(h).padStart(2, "0")}:00`;
                return (
                  <option key={v} value={v}>
                    {v}
                  </option>
                );
              })}
            </select>
          </div>
          <button
            type="button"
            onClick={addScheduleTime}
            className="px-4 py-2.5 rounded-lg border border-[var(--color-primary)] text-[var(--color-primary)] text-sm font-medium"
          >
            + Add
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4 min-h-[2rem]">
          {syncTimes.length === 0 ? (
            <span className="text-sm text-[var(--color-text-muted)]">
              No scheduled syncs — data refreshes only when you click Sync Now.
            </span>
          ) : (
            syncTimes.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-text)] text-sm font-medium"
              >
                {t}
                <button
                  type="button"
                  onClick={() => removeScheduleTime(t)}
                  className="text-[var(--color-text-muted)] hover:text-red-600"
                  aria-label={`Remove ${t}`}
                >
                  &times;
                </button>
              </span>
            ))
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleScheduleSave}
            disabled={scheduleSaving}
            className="px-6 py-2.5 rounded-lg bg-[var(--color-primary)] text-sm font-medium text-white disabled:opacity-50"
          >
            {scheduleSaving ? "Saving..." : "Save Schedule"}
          </button>
          {scheduleMessage && (
            <span className={`text-sm ${scheduleMessage.includes("Saved") ? "text-green-600" : "text-red-600"}`}>
              {scheduleMessage}
            </span>
          )}
        </div>
      </section>

      {/* Data Sync */}
      <section className="bg-white rounded-xl border border-[var(--color-border)] p-6 mb-6">
        <h2 className="text-lg font-semibold text-[var(--color-dark)] mb-2">
          Data Sync
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-4">
          Pull the latest channels, stores, products, sales, OOS, and phantom stock data from SQL Server.
        </p>

        {syncMeta && syncMeta.lastSync && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div className="p-3 rounded-lg bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/10">
                <p className="text-xs text-[var(--color-text-muted)]">Last Sync</p>
                <p className="text-sm font-medium text-[var(--color-text)]">
                  {new Date(syncMeta.lastSync as string).toLocaleString()}
                </p>
                {syncMeta.lastSyncSource && (
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                    {syncMeta.lastSyncSource === "cron" ? "Scheduled" : "Manual"}
                  </p>
                )}
              </div>
              <div className="p-3 rounded-lg bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/10">
                <p className="text-xs text-[var(--color-text-muted)]">Last Auto-Sync</p>
                <p className="text-sm font-medium text-[var(--color-text)]">
                  {syncMeta.lastAutoSync
                    ? new Date(syncMeta.lastAutoSync).toLocaleString()
                    : "Never"}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/10">
                <p className="text-xs text-[var(--color-text-muted)]">Channels</p>
                <p className="text-sm font-medium text-[var(--color-text)]">{syncMeta.channelCount ?? 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/10">
                <p className="text-xs text-[var(--color-text-muted)]">Stores</p>
                <p className="text-sm font-medium text-[var(--color-text)]">{syncMeta.storeCount ?? 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/10">
                <p className="text-xs text-[var(--color-text-muted)]">Products</p>
                <p className="text-sm font-medium text-[var(--color-text)]">{syncMeta.productCount ?? 0}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                <p className="text-xs text-blue-600">Brands</p>
                <p className="text-sm font-medium text-blue-800">{syncMeta.brandCount ?? 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-green-50 border border-green-100">
                <p className="text-xs text-green-600">Sales Records</p>
                <p className="text-sm font-medium text-green-800">
                  {(syncMeta.salesChannelCount ?? 0) + (syncMeta.salesStoreCount ?? 0) + (syncMeta.salesProductCount ?? 0)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                <p className="text-xs text-red-600">OOS Items</p>
                <p className="text-sm font-medium text-red-800">{syncMeta.oosDetailCount ?? 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-100">
                <p className="text-xs text-amber-600">Phantom Items</p>
                <p className="text-sm font-medium text-amber-800">{syncMeta.phantomDetailCount ?? 0}</p>
              </div>
            </div>
          </>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={runSync}
            disabled={syncing}
            className="px-6 py-2 rounded-lg bg-[var(--color-primary)] text-sm font-medium text-white disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
          {syncMessage && (
            <span className={`text-sm ${syncMessage.includes("Synced") ? "text-green-600" : "text-red-600"}`}>
              {syncMessage}
            </span>
          )}
        </div>
      </section>

      {/* Module Status */}
      <section className="bg-white rounded-xl border border-[var(--color-border)] p-6">
        <h2 className="text-lg font-semibold text-[var(--color-dark)] mb-4">
          Module Status
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {MODULE_DEFS.map((mod) => {
            const enabled = tenant.enabledModules.includes(mod.key);
            return (
              <div
                key={mod.key}
                className={`p-4 rounded-lg border ${
                  enabled
                    ? "border-green-200 bg-green-50"
                    : "border-gray-200 bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--color-text)]">
                    {mod.label}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      enabled
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  {mod.description}
                </p>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mt-4">
          Module toggles are managed by your OuterJoin administrator via the Super Admin portal.
        </p>
      </section>
    </div>
  );
}
