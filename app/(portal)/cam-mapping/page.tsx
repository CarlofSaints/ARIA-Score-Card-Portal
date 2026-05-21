"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import type { CamMapping } from "@/lib/types";

export default function CamMappingPage() {
  const { user, loading, hasRole } = useAuth();
  const router = useRouter();

  const [mappings, setMappings] = useState<CamMapping[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [camName, setCamName] = useState("");
  const [camEmail, setCamEmail] = useState("");
  const [channels, setChannels] = useState("");
  const [brands, setBrands] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !hasRole("admin")) {
      router.push("/");
    }
  }, [loading, hasRole, router]);

  useEffect(() => {
    if (user && hasRole("admin")) loadMappings();
  }, [user]);

  async function loadMappings() {
    try {
      const res = await authFetch("/api/cam-mappings");
      const data = await res.json();
      setMappings(data.mappings || []);
    } catch { /* ignore */ }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const res = await authFetch("/api/cam-mappings", {
        method: "POST",
        body: JSON.stringify({
          camUserId: camEmail, // use email as ID for now
          camName,
          camEmail,
          channelIds: channels
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean),
          brandIds: brands
            .split(",")
            .map((b) => b.trim())
            .filter(Boolean),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed");
        return;
      }

      setShowForm(false);
      setCamName("");
      setCamEmail("");
      setChannels("");
      setBrands("");
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">CAM Name *</label>
              <input
                type="text"
                value={camName}
                onChange={(e) => setCamName(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">CAM Email *</label>
              <input
                type="email"
                value={camEmail}
                onChange={(e) => setCamEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Channels</label>
              <input
                type="text"
                value={channels}
                onChange={(e) => setChannels(e.target.value)}
                placeholder="Channel A, Channel B"
                className="w-full rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
              <p className="text-xs text-[var(--color-text-muted)] mt-1">Comma-separated</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Brands</label>
              <input
                type="text"
                value={brands}
                onChange={(e) => setBrands(e.target.value)}
                placeholder="Brand X, Brand Y"
                className="w-full rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              />
              <p className="text-xs text-[var(--color-text-muted)] mt-1">Comma-separated</p>
            </div>
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
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Email</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Channels</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Brands</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => (
                <tr key={m.id} className="border-t border-[var(--color-border)]">
                  <td className="px-4 py-3 font-medium">{m.camName}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{m.camEmail}</td>
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
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-text-muted)]">
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
