"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import type { ProductFieldMapping } from "@/lib/types";

/* ── Canonical fields that can be mapped ── */
const CANONICAL_FIELDS: {
  key: keyof ProductFieldMapping;
  label: string;
  required: boolean;
}[] = [
  { key: "article", label: "Article (Join Key)", required: true },
  { key: "brand", label: "Brand", required: false },
  { key: "category", label: "Category", required: false },
  { key: "status", label: "Product Status", required: false },
  { key: "description", label: "Description", required: false },
  { key: "barcode", label: "Barcode / EAN", required: false },
];

interface MappingState {
  mapping: ProductFieldMapping | null;
  headers: string[];
  autoMatched: Partial<ProductFieldMapping>;
}

export default function ProductMappingPage() {
  const { user, loading, hasRole } = useAuth();
  const router = useRouter();

  const [pmfInfo, setPmfInfo] = useState<{
    count: number;
    headers: string[];
  } | null>(null);
  const [mappingState, setMappingState] = useState<MappingState | null>(null);
  const [draft, setDraft] = useState<Partial<ProductFieldMapping>>({});
  const [masterCount, setMasterCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");

  // ── Auth guard ──
  useEffect(() => {
    if (!loading && !hasRole("admin")) {
      router.push("/");
    }
  }, [loading, hasRole, router]);

  // ── Load PMF info + mapping ──
  const loadData = useCallback(async () => {
    try {
      const [pmfRes, mappingRes, masterRes] = await Promise.all([
        authFetch("/api/pmf"),
        authFetch("/api/product-mapping"),
        authFetch("/api/product-master"),
      ]);

      if (pmfRes.ok) {
        const data = await pmfRes.json();
        setPmfInfo(data);
      }

      if (mappingRes.ok) {
        const data: MappingState = await mappingRes.json();
        setMappingState(data);

        // Initialize draft: prefer saved mapping, fall back to auto-match
        if (data.mapping) {
          setDraft(data.mapping);
        } else if (data.autoMatched) {
          setDraft(data.autoMatched);
        }
      }

      if (masterRes.ok) {
        const data = await masterRes.json();
        setMasterCount(data.count);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (user && hasRole("admin")) {
      loadData();
    }
  }, [user, hasRole, loadData]);

  // ── PMF JSON Upload ──
  async function handlePmfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadMessage("");

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const rows = Array.isArray(parsed) ? parsed : [parsed];

      const res = await authFetch("/api/pmf", {
        method: "POST",
        body: JSON.stringify({ rows }),
      });

      const data = await res.json();
      if (res.ok) {
        setUploadMessage(
          `Uploaded ${data.rowCount} rows (${data.headers.length} columns)` +
            (data.masterRebuilt
              ? ` — product master rebuilt: ${data.masterCount} products`
              : "")
        );
        // Reload all data
        await loadData();
      } else {
        setUploadMessage(data.error || "Upload failed");
      }
    } catch {
      setUploadMessage("Failed to parse file — must be a JSON array of objects");
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = "";
    }
  }

  // ── Save mapping ──
  async function handleSave() {
    if (!draft.article) {
      setMessage("Article field mapping is required");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const res = await authFetch("/api/product-mapping", {
        method: "PUT",
        body: JSON.stringify({ mapping: draft }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage(`Saved — ${data.count} products mapped`);
        setMasterCount(data.count);
      } else {
        setMessage(data.error || "Save failed");
      }
    } catch {
      setMessage("Network error");
    } finally {
      setSaving(false);
    }
  }

  // ── Force rebuild ──
  async function handleRebuild() {
    setSaving(true);
    setMessage("");

    try {
      const res = await authFetch("/api/product-master", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Rebuilt — ${data.count} products`);
        setMasterCount(data.count);
      } else {
        setMessage(data.error || "Rebuild failed");
      }
    } catch {
      setMessage("Network error");
    } finally {
      setSaving(false);
    }
  }

  function updateDraft(field: keyof ProductFieldMapping, value: string) {
    setDraft((prev) => ({
      ...prev,
      [field]: value || undefined,
    }));
  }

  if (loading || !user) return null;

  const headers = mappingState?.headers ?? pmfInfo?.headers ?? [];
  const hasPmf = (pmfInfo?.count ?? 0) > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-dark)]">
          Product Mapping
        </h1>
        {masterCount != null && (
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              masterCount > 0
                ? "bg-green-100 text-green-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {masterCount > 0 ? `${masterCount} products mapped` : "Not mapped"}
          </span>
        )}
      </div>

      {/* PMF Upload */}
      <section className="bg-white rounded-xl border border-[var(--color-border)] p-6 mb-6">
        <h2 className="text-lg font-semibold text-[var(--color-dark)] mb-2">
          PMF Data
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-4">
          Upload your Product Management File (PMF) as a JSON array of objects.
          Each object should represent one product row with column names as keys.
        </p>

        {hasPmf && (
          <div className="flex items-center gap-3 mb-4">
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
              {pmfInfo!.count} rows uploaded
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {pmfInfo!.headers.length} columns detected
            </span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <label className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-sm font-medium text-white cursor-pointer hover:opacity-90 transition-opacity">
            {uploading ? "Uploading..." : hasPmf ? "Re-upload PMF" : "Upload PMF"}
            <input
              type="file"
              accept=".json"
              onChange={handlePmfUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
          {uploadMessage && (
            <span
              className={`text-sm ${
                uploadMessage.includes("Uploaded")
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {uploadMessage}
            </span>
          )}
        </div>
      </section>

      {/* Field Mapping */}
      {hasPmf && headers.length > 0 && (
        <section className="bg-white rounded-xl border border-[var(--color-border)] p-6 mb-6">
          <h2 className="text-lg font-semibold text-[var(--color-dark)] mb-2">
            Field Mapping
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mb-4">
            Map each canonical field to the corresponding column in your PMF
            data. Article is required as the join key to DISPO data.
          </p>

          <div className="space-y-3">
            {CANONICAL_FIELDS.map(({ key, label, required }) => (
              <div
                key={key}
                className="flex items-center gap-4"
              >
                <label className="w-44 text-sm font-medium text-[var(--color-text)] flex items-center gap-1.5">
                  {label}
                  {required && (
                    <span className="text-red-500 text-xs">*</span>
                  )}
                </label>
                <select
                  value={draft[key] ?? ""}
                  onChange={(e) => updateDraft(key, e.target.value)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none ${
                    draft[key]
                      ? "border-green-300 bg-green-50"
                      : "border-[var(--color-border)]"
                  }`}
                >
                  <option value="">— Not mapped —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                {mappingState?.autoMatched?.[key] &&
                  !draft[key] && (
                    <button
                      onClick={() =>
                        updateDraft(key, mappingState!.autoMatched[key]!)
                      }
                      className="text-xs text-[var(--color-primary)] hover:underline whitespace-nowrap"
                    >
                      Suggest: {mappingState!.autoMatched[key]}
                    </button>
                  )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--color-border)]">
            <button
              onClick={handleRebuild}
              disabled={saving}
              className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)] disabled:opacity-50"
            >
              Force Rebuild
            </button>
            <div className="flex items-center gap-3">
              {message && (
                <span
                  className={`text-sm ${
                    message.includes("Saved") || message.includes("Rebuilt")
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {message}
                </span>
              )}
              <button
                onClick={handleSave}
                disabled={saving || !draft.article}
                className="px-6 py-2 rounded-lg bg-[var(--color-primary)] text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save & Build"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* No PMF data yet */}
      {!hasPmf && (
        <section className="bg-white rounded-xl border border-[var(--color-border)] p-6">
          <div className="text-center py-8">
            <p className="text-sm text-[var(--color-text-muted)]">
              Upload PMF data above to configure field mapping.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
