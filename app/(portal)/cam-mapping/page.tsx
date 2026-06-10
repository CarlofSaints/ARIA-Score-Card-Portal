"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import type { CamMapping, ScorecardChannel } from "@/lib/types";

interface CamUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function CamMappingPage() {
  const { user, loading, hasRole } = useAuth();
  const router = useRouter();

  const [mappings, setMappings] = useState<CamMapping[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedCamId, setSelectedCamId] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Available options from SQL data + CAM users from the user list
  const [availableChannels, setAvailableChannels] = useState<ScorecardChannel[]>([]);
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);
  const [availableCams, setAvailableCams] = useState<CamUser[]>([]);

  useEffect(() => {
    if (!loading && !hasRole("admin")) {
      router.push("/");
    }
  }, [loading, hasRole, router]);

  useEffect(() => {
    if (user && hasRole("admin")) {
      loadMappings();
      loadOptions();
    }
  }, [user]);

  async function loadMappings() {
    try {
      const res = await authFetch("/api/cam-mappings");
      const data = await res.json();
      setMappings(data.mappings || []);
    } catch { /* ignore */ }
  }

  async function loadOptions() {
    try {
      const [chRes, brRes, usrRes] = await Promise.all([
        authFetch("/api/data/channels"),
        authFetch("/api/data/brands"),
        authFetch("/api/users"),
      ]);
      const chData = await chRes.json();
      const brData = await brRes.json();
      const usrData = await usrRes.json();
      setAvailableChannels(chData.channels || []);
      setAvailableBrands(brData.brands || []);
      setAvailableCams(
        (usrData.users || []).filter((u: CamUser) => u.role === "cam")
      );
    } catch { /* ignore */ }
  }

  function toggleChannel(id: string) {
    setSelectedChannels((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  function toggleBrand(name: string) {
    setSelectedBrands((prev) =>
      prev.includes(name) ? prev.filter((b) => b !== name) : [...prev, name]
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const cam = availableCams.find((c) => c.id === selectedCamId);
    if (!cam) {
      setError("Select a CAM");
      return;
    }
    setSaving(true);

    try {
      const res = await authFetch("/api/cam-mappings", {
        method: "POST",
        body: JSON.stringify({
          camUserId: cam.id,
          camName: cam.name,
          channelIds: selectedChannels,
          brandIds: selectedBrands,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed");
        return;
      }

      setShowForm(false);
      setSelectedCamId("");
      setSelectedChannels([]);
      setSelectedBrands([]);
      loadMappings();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await authFetch(`/api/cam-mappings?id=${id}`, { method: "DELETE" });
    loadMappings();
  }

  if (loading || !user) return null;

  const noOptions = availableChannels.length === 0 && availableBrands.length === 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-dark)]">
            CAM Mapping
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Assign channels and brands to CAMs
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium"
        >
          {showForm ? "Cancel" : "+ Add Mapping"}
        </button>
      </div>

      {noOptions && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          No channels or brands loaded yet. Run a Data Sync from the Control Centre first.
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSave}
          className="bg-white rounded-xl border border-[var(--color-border)] p-6 mb-6"
        >
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1.5">CAM *</label>
            {availableCams.length > 0 ? (
              <select
                value={selectedCamId}
                onChange={(e) => setSelectedCamId(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm bg-white focus:border-[var(--color-primary)] focus:outline-none"
              >
                <option value="">Select a CAM…</option>
                {availableCams.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-amber-700">
                No CAM users found. Create users with the <strong>CAM</strong> role in the Admin
                section first.
              </p>
            )}
          </div>

          {/* Channels multi-select */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Channels</label>
            {availableChannels.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {availableChannels.map((ch) => {
                  const selected = selectedChannels.includes(ch.name);
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => toggleChannel(ch.name)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        selected
                          ? "bg-blue-100 border-blue-300 text-blue-800"
                          : "bg-white border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-blue-200"
                      }`}
                    >
                      {selected && <span className="mr-1">&#10003;</span>}
                      {ch.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-[var(--color-text-muted)]">
                No channels available. Run a sync first.
              </p>
            )}
          </div>

          {/* Brands multi-select */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Brands</label>
            {availableBrands.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {availableBrands.map((brand) => {
                  const selected = selectedBrands.includes(brand);
                  return (
                    <button
                      key={brand}
                      type="button"
                      onClick={() => toggleBrand(brand)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        selected
                          ? "bg-purple-100 border-purple-300 text-purple-800"
                          : "bg-white border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-purple-200"
                      }`}
                    >
                      {selected && <span className="mr-1">&#10003;</span>}
                      {brand}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-[var(--color-text-muted)]">
                No brands available. Run a sync first.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-lg bg-[var(--color-primary)] text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Mapping"}
          </button>
        </form>
      )}

      {/* Mappings Table */}
      <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-bg)]">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">CAM</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Channels</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Brands</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => (
                <tr key={m.id} className="border-t border-[var(--color-border)]">
                  <td className="px-4 py-3 font-medium">{m.camName}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {m.channelIds.map((c) => (
                        <span key={c} className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs">
                          {c}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {m.brandIds.map((b) => (
                        <span key={b} className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 text-xs">
                          {b}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {mappings.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[var(--color-text-muted)]">
                    No CAM mappings configured
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
