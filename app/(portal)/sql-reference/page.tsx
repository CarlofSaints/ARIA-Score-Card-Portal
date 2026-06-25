"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import {
  SQL_REGISTRY,
  SQL_CATEGORIES,
  type SqlRegistryEntry,
  type SqlEntryStatus,
} from "@/lib/sqlRegistry";

interface DriftState {
  loading: boolean;
  ok: boolean;
  error?: string;
  undocumented: string[]; // on the proxy, missing from this registry
  missingOnProxy: string[]; // in this registry, not registered on the proxy
}

const STATUS_STYLES: Record<SqlEntryStatus, string> = {
  live: "bg-green-100 text-green-700",
  building: "bg-amber-100 text-amber-700",
  planned: "bg-gray-100 text-gray-600",
};

const STATUS_LABEL: Record<SqlEntryStatus, string> = {
  live: "Live",
  building: "Being built",
  planned: "Planned",
};

export default function SqlReferencePage() {
  const { user, loading, hasRole } = useAuth();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<string>("");
  const [drift, setDrift] = useState<DriftState>({
    loading: true,
    ok: false,
    undocumented: [],
    missingOnProxy: [],
  });

  useEffect(() => {
    if (!loading && (!user || !hasRole("super_admin"))) router.push("/");
  }, [loading, user, hasRole, router]);

  // Compare the registry against the queries actually registered on the proxy.
  useEffect(() => {
    if (!user || !hasRole("super_admin")) return;
    authFetch("/api/sql-reference/proxy-queries")
      .then((r) => r.json())
      .then((d: { names?: string[]; ok?: boolean; error?: string }) => {
        const proxyNames = new Set(d.names || []);
        const registryNames = new Set(SQL_REGISTRY.map((e) => e.name));
        setDrift({
          loading: false,
          ok: !!d.ok,
          error: d.error,
          undocumented: [...proxyNames].filter((n) => !registryNames.has(n)).sort(),
          missingOnProxy: [...registryNames].filter((n) => !proxyNames.has(n)).sort(),
        });
      })
      .catch(() =>
        setDrift({ loading: false, ok: false, error: "Could not reach the proxy", undocumented: [], missingOnProxy: [] })
      );
  }, [user, hasRole]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return SQL_REGISTRY;
    return SQL_REGISTRY.filter((e) =>
      `${e.name} ${e.label} ${e.purpose} ${e.category} ${e.usedBy}`
        .toLowerCase()
        .includes(q)
    );
  }, [search]);

  function copy(entry: SqlRegistryEntry) {
    navigator.clipboard?.writeText(entry.sql).then(() => {
      setCopied(entry.name);
      setTimeout(() => setCopied(""), 1500);
    });
  }

  if (loading || !user || !hasRole("super_admin")) return null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-dark)]">SQL Reference</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Every named query &amp; stored procedure the portal runs through the SQL proxy.
          Super-admin only · reference/documentation (does not execute anything).
        </p>
      </div>

      <DriftBanner drift={drift} />

      <div className="mb-5">
        <input
          type="text"
          placeholder="Search queries, SPs, purpose…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm w-full max-w-md"
        />
      </div>

      {SQL_CATEGORIES.map((cat) => {
        const entries = filtered.filter((e) => e.category === cat);
        if (entries.length === 0) return null;
        return (
          <section key={cat} className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-3">
              {cat}
            </h2>
            <div className="space-y-3">
              {entries.map((e) => (
                <div
                  key={e.name}
                  className="bg-white rounded-xl border border-[var(--color-border)] p-4"
                >
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="font-semibold text-[var(--color-dark)]">{e.label}</span>
                    <code className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-bg)] text-[var(--color-text)]">
                      {e.name}
                    </code>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                      {e.kind === "stored_procedure" ? "Stored Procedure" : "Query"}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[e.status]}`}>
                      {STATUS_LABEL[e.status]}
                    </span>
                  </div>

                  <p className="text-sm text-[var(--color-text)] mb-3">{e.purpose}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs text-[var(--color-text-muted)] mb-3">
                    <div><span className="font-medium text-[var(--color-text)]">Server:</span> {e.server}</div>
                    <div><span className="font-medium text-[var(--color-text)]">Database:</span> {e.database}</div>
                    <div className="md:col-span-2">
                      <span className="font-medium text-[var(--color-text)]">Params:</span>{" "}
                      {e.params.length === 0
                        ? "none"
                        : e.params.map((p) => `${p.name} (${p.description})`).join(" · ")}
                    </div>
                    <div className="md:col-span-2">
                      <span className="font-medium text-[var(--color-text)]">Used by:</span> {e.usedBy}
                    </div>
                  </div>

                  <div className="relative">
                    <button
                      onClick={() => copy(e)}
                      className="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-gray-300 border border-gray-700"
                    >
                      {copied === e.name ? "Copied!" : "Copy"}
                    </button>
                    <pre className="text-xs bg-[#1e2530] text-gray-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                      {e.sql}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-[var(--color-text-muted)]">
          No queries match “{search}”.
        </div>
      )}
    </div>
  );
}

function DriftBanner({ drift }: { drift: DriftState }) {
  if (drift.loading) {
    return (
      <div className="mb-5 px-4 py-2.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-sm text-[var(--color-text-muted)]">
        Checking this page against the live proxy…
      </div>
    );
  }

  if (!drift.ok) {
    return (
      <div className="mb-5 px-4 py-2.5 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-600">
        Couldn&apos;t verify against the proxy{drift.error ? ` (${drift.error})` : ""}. The catalogue below may be out of date.
      </div>
    );
  }

  const inSync = drift.undocumented.length === 0 && drift.missingOnProxy.length === 0;
  if (inSync) {
    return (
      <div className="mb-5 px-4 py-2.5 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
        ✓ In sync with the proxy — every registered query is documented here.
      </div>
    );
  }

  return (
    <div className="mb-5 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
      <p className="font-semibold mb-1">⚠ This page is out of sync with the proxy.</p>
      {drift.undocumented.length > 0 && (
        <p className="mb-1">
          On the proxy but <strong>not documented here</strong> (add to <code>lib/sqlRegistry.ts</code>):{" "}
          {drift.undocumented.map((n) => <code key={n} className="mx-0.5 px-1 rounded bg-amber-100">{n}</code>)}
        </p>
      )}
      {drift.missingOnProxy.length > 0 && (
        <p>
          Documented here but <strong>not registered on the proxy</strong> (removed/renamed/not deployed):{" "}
          {drift.missingOnProxy.map((n) => <code key={n} className="mx-0.5 px-1 rounded bg-amber-100">{n}</code>)}
        </p>
      )}
    </div>
  );
}
