"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import type { RangingIndexEntry } from "@/lib/types";

interface ChannelResult {
  channel: string;
  rowsScanned: number;
  ranged: number;
  stores: number;
  products: number;
  status: "parsing" | "uploading" | "done" | "error";
  error?: string;
}

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "ranged"]);

function isTrue(v: unknown): boolean {
  if (v === true) return true;
  if (v === 1) return true;
  return TRUE_VALUES.has(String(v ?? "").trim().toLowerCase());
}

async function gzipJson(obj: unknown): Promise<Blob> {
  const json = JSON.stringify(obj);
  const cs = new CompressionStream("gzip");
  const stream = new Blob([json]).stream().pipeThrough(cs);
  return await new Response(stream).blob();
}

export default function RangingPage() {
  const { user, loading, hasRole } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [index, setIndex] = useState<RangingIndexEntry[]>([]);
  const [results, setResults] = useState<ChannelResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [topError, setTopError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  const loadIndex = useCallback(() => {
    authFetch("/api/ranging")
      .then((r) => r.json())
      .then((d) => setIndex(Array.isArray(d.channels) ? d.channels : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user) loadIndex();
  }, [user, loadIndex]);

  const handleFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setTopError("");
      setResults([]);
      setFileName(file.name);
      try {
        const XLSX = await import("xlsx");
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data, { type: "array" });
        const rangeSheets = wb.SheetNames.filter((n) =>
          n.toUpperCase().startsWith("RANGE_")
        );

        if (rangeSheets.length === 0) {
          setTopError('No "RANGE_*" sheets found in this workbook.');
          setBusy(false);
          return;
        }

        for (const sheetName of rangeSheets) {
          const channel = sheetName.replace(/^RANGE_/i, "").trim().toUpperCase();
          setResults((prev) => [
            ...prev,
            { channel, rowsScanned: 0, ranged: 0, stores: 0, products: 0, status: "parsing" },
          ]);

          // Parse this sheet
          const ws = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
            header: 1,
            defval: null,
            blankrows: false,
          });
          if (rows.length < 2) {
            updateResult(setResults, channel, { status: "done", rowsScanned: 0 });
            continue;
          }
          const header = (rows[0] as unknown[]).map((h) =>
            String(h ?? "").trim().toLowerCase()
          );
          const iSite = header.indexOf("sitecode");
          const iProd = header.indexOf("productid");
          const iRange = header.indexOf("rangeindicator");

          if (iSite < 0 || iProd < 0 || iRange < 0) {
            updateResult(setResults, channel, {
              status: "error",
              error: "Missing SiteCode / ProductID / RangeIndicator columns",
            });
            continue;
          }

          const byStore: Record<string, number> = {};
          const byProduct: Record<string, number> = {};
          const pairs: string[] = [];
          let rowsScanned = 0;

          for (let r = 1; r < rows.length; r++) {
            const row = rows[r] as unknown[];
            rowsScanned++;
            if (!isTrue(row[iRange])) continue;
            const site = String(row[iSite] ?? "").trim();
            const prod = String(row[iProd] ?? "").trim();
            if (!site || !prod) continue;
            byStore[site] = (byStore[site] || 0) + 1;
            byProduct[prod] = (byProduct[prod] || 0) + 1;
            pairs.push(`${site}|${prod}`);
          }

          updateResult(setResults, channel, {
            status: "uploading",
            rowsScanned,
            ranged: pairs.length,
            stores: Object.keys(byStore).length,
            products: Object.keys(byProduct).length,
          });

          // Upload (gzipped)
          const payload = {
            channel,
            total: pairs.length,
            byStore,
            byProduct,
            pairs,
            rowsScanned,
            sourceFile: file.name,
          };
          const gz = await gzipJson(payload);
          const res = await fetch("/api/ranging", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/gzip" },
            body: gz,
          });
          if (!res.ok) {
            const body = await res.text();
            updateResult(setResults, channel, { status: "error", error: `Upload failed: ${body}` });
            continue;
          }
          updateResult(setResults, channel, { status: "done" });
        }

        loadIndex();
      } catch (e) {
        setTopError(e instanceof Error ? e.message : "Failed to process file");
      } finally {
        setBusy(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [loadIndex]
  );

  async function handleDelete(channel: string) {
    if (!confirm(`Remove ranging data for ${channel}?`)) return;
    await fetch(`/api/ranging?channel=${encodeURIComponent(channel)}`, {
      method: "DELETE",
      credentials: "include",
    });
    loadIndex();
  }

  if (loading || !user) return null;
  const canManage = hasRole("admin");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-dark)]">Ranging</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Upload the Range Management workbook. Every <code>RANGE_*</code> sheet is read; ranged
          (RangeIndicator = true) site-SKU combos build the denominator for the Phantom % KPI.
          Re-run a sync after uploading to recalculate.
        </p>
      </div>

      {/* Upload */}
      {canManage && (
        <div className="mb-6">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="hidden"
          />
          <div
            role="button"
            tabIndex={0}
            onClick={() => !busy && fileRef.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !busy) {
                e.preventDefault();
                fileRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (busy) return;
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors outline-none ${
              busy
                ? "opacity-70 cursor-wait border-[var(--color-border)] bg-white"
                : dragOver
                ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 cursor-pointer"
                : "border-[var(--color-border)] bg-white cursor-pointer hover:border-[var(--color-primary)] hover:bg-[var(--color-bg)]"
            }`}
          >
            <div
              className="mx-auto mb-3 w-12 h-12 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: "var(--color-primary)",
                color: "white",
              }}
            >
              <UploadCloudIcon />
            </div>
            <p className="text-base font-semibold text-[var(--color-text)]">
              {busy
                ? `Processing ${fileName}…`
                : dragOver
                ? "Drop to upload"
                : "Drag & drop the Range Management workbook"}
            </p>
            {!busy && (
              <p className="text-sm mt-1">
                <span className="font-semibold text-[var(--color-primary)] underline">
                  or click to browse
                </span>
              </p>
            )}
            <p className="text-xs text-[var(--color-text-muted)] mt-3">
              .xlsx — parsed in your browser, may take a few seconds
              {fileName && !busy ? ` · last: ${fileName}` : ""}
            </p>
          </div>
          {topError && <p className="text-sm text-red-600 mt-2">{topError}</p>}
        </div>
      )}

      {/* Per-sheet results from the current upload */}
      {results.length > 0 && (
        <div className="bg-white rounded-xl border border-[var(--color-border)] p-5 mb-6">
          <h2 className="text-sm font-semibold text-[var(--color-dark)] mb-3">Upload progress</h2>
          <div className="space-y-1">
            {results.map((r) => (
              <div key={r.channel} className="flex items-center justify-between text-sm py-1">
                <span className="font-medium text-[var(--color-text)]">{r.channel}</span>
                <span className="text-[var(--color-text-muted)]">
                  {r.status === "parsing" && "parsing…"}
                  {r.status === "uploading" && "uploading…"}
                  {r.status === "done" &&
                    `${r.ranged.toLocaleString()} ranged · ${r.stores} stores · ${r.products} products`}
                  {r.status === "error" && <span className="text-red-600">{r.error}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Currently loaded ranging */}
      <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold text-[var(--color-dark)]">Loaded ranging</h2>
        </div>
        {index.length === 0 ? (
          <div className="px-5 py-8 text-center text-[var(--color-text-muted)] text-sm">
            No ranging loaded yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-bg)] text-left text-[var(--color-text-muted)]">
              <tr>
                <th className="px-4 py-2 font-semibold">Channel</th>
                <th className="px-4 py-2 font-semibold text-right">Ranged combos</th>
                <th className="px-4 py-2 font-semibold text-right">Stores</th>
                <th className="px-4 py-2 font-semibold text-right">Products</th>
                <th className="px-4 py-2 font-semibold text-right">Rows scanned</th>
                <th className="px-4 py-2 font-semibold">Uploaded</th>
                {canManage && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody>
              {index.map((e) => (
                <tr key={e.channel} className="border-t border-[var(--color-border)]">
                  <td className="px-4 py-2 font-medium text-[var(--color-text)]">{e.channel}</td>
                  <td className="px-4 py-2 text-right">{e.total.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">{e.stores.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">{e.products.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-[var(--color-text-muted)]">
                    {e.rowsScanned.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-[var(--color-text-muted)]">
                    {new Date(e.uploadedAt).toLocaleString()}
                  </td>
                  {canManage && (
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => handleDelete(e.channel)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function UploadCloudIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 16l-4-4-4 4" />
      <path d="M12 12v9" />
      <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
      <path d="M16 16l-4-4-4 4" />
    </svg>
  );
}

function updateResult(
  setResults: React.Dispatch<React.SetStateAction<ChannelResult[]>>,
  channel: string,
  patch: Partial<ChannelResult>
) {
  setResults((prev) => prev.map((r) => (r.channel === channel ? { ...r, ...patch } : r)));
}
