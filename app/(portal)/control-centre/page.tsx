"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { KPI_DEFS, MODULE_DEFS } from "@/lib/modules";
import type { KpiWeighting } from "@/lib/types";

export default function ControlCentrePage() {
  const { user, loading, hasRole } = useAuth();
  const router = useRouter();
  const tenant = useTenant();

  const [weightings, setWeightings] = useState<KpiWeighting[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

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
