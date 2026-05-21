"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAuth, authFetch } from "@/lib/useAuth";
import { MODULE_DEFS, KPI_DEFS } from "@/lib/modules";
import type { TenantConfig, ModuleKey, KpiWeighting } from "@/lib/types";
import { isValidHex } from "@/lib/colorUtils";

export default function EditClientPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { user, loading } = useAuth();
  const router = useRouter();

  const [tenant, setTenant] = useState<TenantConfig | null>(null);
  const [fetching, setFetching] = useState(true);

  // Form state
  const [name, setName] = useState("");
  const [domains, setDomains] = useState("");
  const [active, setActive] = useState(true);
  const [primaryColor, setPrimaryColor] = useState("");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [accentColor, setAccentColor] = useState("");
  const [enabledModules, setEnabledModules] = useState<ModuleKey[]>([]);
  const [weightings, setWeightings] = useState<KpiWeighting[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!loading && (!user || !user.isSuperAdmin)) {
      router.push("/super-admin/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (user?.isSuperAdmin) {
      authFetch(`/api/super-admin/tenants/${slug}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.tenant) {
            const t = data.tenant as TenantConfig;
            setTenant(t);
            setName(t.name);
            setDomains(t.domains.join(", "));
            setActive(t.active);
            setPrimaryColor(t.branding.primaryColor);
            setSecondaryColor(t.branding.secondaryColor || "");
            setAccentColor(t.branding.accentColor || "");
            setEnabledModules(t.enabledModules);
            setWeightings(
              t.kpiWeightings.length > 0
                ? t.kpiWeightings
                : KPI_DEFS.map((k) => ({ key: k.key, weight: k.defaultWeight }))
            );
          }
        })
        .finally(() => setFetching(false));
    }
  }, [user, slug]);

  function toggleModule(key: ModuleKey) {
    setEnabledModules((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  }

  function updateWeight(key: string, value: number) {
    setWeightings((prev) =>
      prev.map((w) => (w.key === key ? { ...w, weight: value } : w))
    );
  }

  const totalWeight = weightings.reduce((sum, w) => sum + w.weight, 0);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!isValidHex(primaryColor)) {
      setError("Primary colour must be a valid HEX code");
      return;
    }
    if (totalWeight !== 100) {
      setError(`KPI weights must total 100 (currently ${totalWeight})`);
      return;
    }

    setSaving(true);
    try {
      const res = await authFetch(`/api/super-admin/tenants/${slug}`, {
        method: "PUT",
        body: JSON.stringify({
          name,
          active,
          branding: {
            primaryColor,
            secondaryColor: secondaryColor || undefined,
            accentColor: accentColor || undefined,
            logoUrl: tenant?.branding.logoUrl,
          },
          enabledModules,
          kpiWeightings: weightings,
          domains: domains
            .split(",")
            .map((d) => d.trim())
            .filter(Boolean),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }
      setSuccess("Client updated successfully");
      setTenant(data.tenant);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (loading || fetching || !user?.isSuperAdmin) {
    return (
      <div className="min-h-screen bg-[#F5F7F8] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#3D6273] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen bg-[#F5F7F8] flex items-center justify-center">
        <p className="text-[#718096]">Client not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7F8]">
      <header className="bg-white border-b border-[#E2E8F0] px-6 py-4 flex items-center gap-4">
        <Link href="/super-admin" className="text-[#718096] hover:text-[#2D3748]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div className="flex items-center gap-3">
          <Image src="/aria-logo.png" alt="ARIA" width={28} height={28} />
          <h1 className="text-lg font-bold text-[#2D3748]">Edit: {tenant.name}</h1>
        </div>
      </header>

      <form onSubmit={handleSave} className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}
        {success && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>
        )}

        {/* Details */}
        <section className="bg-white rounded-xl border border-[#E2E8F0] p-6">
          <h2 className="text-lg font-semibold text-[#2D3748] mb-4">Client Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Client Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-lg border border-[#E2E8F0] px-4 py-2.5 text-sm focus:border-[#3D6273] focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Slug</label>
              <input type="text" value={slug} disabled className="w-full rounded-lg border border-[#E2E8F0] px-4 py-2.5 text-sm bg-gray-50 text-gray-500 font-mono" />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1.5">Domains</label>
            <input type="text" value={domains} onChange={(e) => setDomains(e.target.value)} className="w-full rounded-lg border border-[#E2E8F0] px-4 py-2.5 text-sm focus:border-[#3D6273] focus:outline-none" />
          </div>
          <div className="mt-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-4 h-4 accent-[#3D6273]" />
              Active
            </label>
          </div>
        </section>

        {/* Branding */}
        <section className="bg-white rounded-xl border border-[#E2E8F0] p-6">
          <h2 className="text-lg font-semibold text-[#2D3748] mb-4">Branding</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ColorField label="Primary *" value={primaryColor} onChange={setPrimaryColor} required />
            <ColorField label="Secondary" value={secondaryColor} onChange={setSecondaryColor} />
            <ColorField label="Accent" value={accentColor} onChange={setAccentColor} />
          </div>
        </section>

        {/* Modules */}
        <section className="bg-white rounded-xl border border-[#E2E8F0] p-6">
          <h2 className="text-lg font-semibold text-[#2D3748] mb-4">Modules</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {MODULE_DEFS.map((mod) => (
              <label key={mod.key} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${enabledModules.includes(mod.key) ? "border-[#3D6273] bg-[#3D6273]/5" : "border-[#E2E8F0]"}`}>
                <input type="checkbox" checked={enabledModules.includes(mod.key)} onChange={() => toggleModule(mod.key)} className="w-4 h-4 accent-[#3D6273]" />
                <div>
                  <p className="text-sm font-medium">{mod.label}</p>
                  <p className="text-xs text-[#718096]">{mod.description}</p>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* KPI Weightings */}
        <section className="bg-white rounded-xl border border-[#E2E8F0] p-6">
          <h2 className="text-lg font-semibold text-[#2D3748] mb-4">KPI Weightings</h2>
          <div className="space-y-3">
            {KPI_DEFS.map((kpi) => {
              const w = weightings.find((w) => w.key === kpi.key);
              return (
                <div key={kpi.key} className="flex items-center gap-4">
                  <span className="text-sm font-medium w-48">{kpi.label}</span>
                  <input type="range" min={0} max={100} value={w?.weight ?? 0} onChange={(e) => updateWeight(kpi.key, Number(e.target.value))} className="flex-1 accent-[#3D6273]" />
                  <span className="text-sm font-mono w-10 text-right">{w?.weight ?? 0}</span>
                </div>
              );
            })}
          </div>
          <div className={`mt-4 text-right text-sm font-semibold ${totalWeight === 100 ? "text-green-600" : "text-red-600"}`}>
            Total: {totalWeight} / 100
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <Link href="/super-admin" className="px-6 py-2.5 rounded-lg text-sm font-medium text-[#718096] border border-[#E2E8F0] hover:bg-white">
            Cancel
          </Link>
          <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-lg bg-[#3D6273] text-sm font-medium text-white hover:bg-[#345566] disabled:opacity-50">
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ColorField({ label, value, onChange, required = false }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      <div className="flex gap-2">
        <input type="color" value={value || "#3D6273"} onChange={(e) => onChange(e.target.value)} className="w-10 h-10 rounded border border-[#E2E8F0] cursor-pointer" />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} required={required} placeholder="#000000" className="flex-1 rounded-lg border border-[#E2E8F0] px-4 py-2.5 text-sm font-mono focus:border-[#3D6273] focus:outline-none" />
      </div>
    </div>
  );
}
