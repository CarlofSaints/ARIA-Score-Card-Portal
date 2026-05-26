"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { KPI_DEFS, MODULE_DEFS } from "@/lib/modules";
import type { KpiWeighting } from "@/lib/types";

interface SyncMeta {
  lastSync?: string;
  channelCount?: number;
  storeCount?: number;
  productCount?: number;
  brandCount?: number;
  salesChannelCount?: number;
  salesStoreCount?: number;
  salesProductCount?: number;
  oosDetailCount?: number;
  phantomDetailCount?: number;
}

export default function ControlCentrePage() {
  const { user, loading, hasRole } = useAuth();
  const router = useRouter();
  const tenant = useTenant();

  const [weightings, setWeightings] = useState<KpiWeighting[]>([]);
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
    }
  }, [user]);

  function updateWeight(key: string, value: number) {
    setWeightings((prev) =>
      prev.map((w) => (w.key === key ? { ...w, weight: value } : w))
    );
  }

  const totalWeight = weightings.reduce((sum, w) => sum + w.weight, 0);

  async function handleSave() {
    setMessage("");
    if (totalWeight !== 100) {
      setMessage(`Weights must total 100 (currently ${totalWeight})`);
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch("/api/kpi-weightings", {
        method: "PUT",
        body: JSON.stringify({ weightings }),
      });
      if (res.ok) setMessage("Saved successfully");
      else setMessage("Failed to save");
    } catch {
      setMessage("Network error");
    } finally {
      setSaving(false);
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
      if (res.ok) setPhantomMessage("Saved successfully");
      else setPhantomMessage("Failed to save");
    } catch {
      setPhantomMessage("Network error");
    } finally {
      setPhantomSaving(false);
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
          KPI Weightings
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-4">
          Adjust the point weighting for each KPI. Must total 100.
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
            onClick={async () => {
              setSyncing(true);
              setSyncMessage("");
              try {
                const res = await authFetch("/api/sync", { method: "POST" });
                const data = await res.json();
                if (res.ok) {
                  setSyncMessage(
                    `Synced: ${data.counts.channels} channels, ${data.counts.stores} stores, ${data.counts.products} products, ${data.counts.oosDetail} OOS, ${data.counts.phantomDetail} phantom`
                  );
                  setSyncMeta({
                    lastSync: new Date().toISOString(),
                    channelCount: data.counts.channels,
                    storeCount: data.counts.stores,
                    productCount: data.counts.products,
                    brandCount: data.counts.brands,
                    salesChannelCount: data.counts.salesChannels,
                    salesStoreCount: data.counts.salesStores,
                    salesProductCount: data.counts.salesProducts,
                    oosDetailCount: data.counts.oosDetail,
                    phantomDetailCount: data.counts.phantomDetail,
                  });
                } else {
                  setSyncMessage(data.error || "Sync failed");
                }
              } catch {
                setSyncMessage("Network error during sync");
              } finally {
                setSyncing(false);
              }
            }}
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
