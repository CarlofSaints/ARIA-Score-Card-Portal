"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAuth, authFetch } from "@/lib/useAuth";
import { MODULE_DEFS, KPI_DEFS } from "@/lib/modules";
import PasswordInput from "@/components/PasswordInput";
import type { ModuleKey, KpiWeighting } from "@/lib/types";
import { isValidHex } from "@/lib/colorUtils";

export default function NewClientPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Client details
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [domains, setDomains] = useState("");
  const [sqlClientName, setSqlClientName] = useState("");
  const [sqlClients, setSqlClients] = useState<{ id: number; name: string; kam: string | null }[]>([]);

  // Branding
  const [primaryColor, setPrimaryColor] = useState("#3D6273");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [accentColor, setAccentColor] = useState("");

  // Modules
  const [enabledModules, setEnabledModules] = useState<ModuleKey[]>(
    MODULE_DEFS.map((m) => m.key)
  );

  // KPI Weightings
  const [weightings, setWeightings] = useState<KpiWeighting[]>(
    KPI_DEFS.map((k) => ({ key: k.key, weight: k.defaultWeight }))
  );

  // Initial Admin
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [forcePasswordChange, setForcePasswordChange] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);

  // Logo
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && (!user || !user.isSuperAdmin)) {
      router.push("/super-admin/login");
    }
  }, [loading, user, router]);

  // Load SQL clients for dropdown
  useEffect(() => {
    authFetch("/api/super-admin/sql-clients")
      .then((res) => res.json())
      .then((data) => {
        if (data.clients) setSqlClients(data.clients);
      })
      .catch(() => {});
  }, []);

  // Auto-generate slug from name
  useEffect(() => {
    if (name) {
      setSlug(
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
      );
    }
  }, [name]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!isValidHex(primaryColor)) {
      setError("Primary colour must be a valid HEX code (e.g. #3D6273)");
      return;
    }
    if (secondaryColor && !isValidHex(secondaryColor)) {
      setError("Secondary colour must be a valid HEX code");
      return;
    }
    if (accentColor && !isValidHex(accentColor)) {
      setError("Accent colour must be a valid HEX code");
      return;
    }
    if (totalWeight !== 100) {
      setError(`KPI weights must sum to 100 (currently ${totalWeight})`);
      return;
    }

    setSaving(true);
    try {
      const res = await authFetch("/api/super-admin/tenants", {
        method: "POST",
        body: JSON.stringify({
          slug,
          name,
          branding: {
            primaryColor,
            secondaryColor: secondaryColor || undefined,
            accentColor: accentColor || undefined,
          },
          enabledModules,
          kpiWeightings: weightings,
          domains: domains
            .split(",")
            .map((d) => d.trim())
            .filter(Boolean),
          sqlClientName: sqlClientName || undefined,
          initialAdmin:
            adminEmail && adminName && adminPassword
              ? {
                  name: adminName,
                  email: adminEmail,
                  password: adminPassword,
                  forcePasswordChange,
                }
              : undefined,
          sendEmail,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create client");
        return;
      }

      // Upload logo if selected (needs slug from creation)
      if (logoFile) {
        const fd = new FormData();
        fd.append("logo", logoFile);
        await authFetch(`/api/super-admin/tenants/${slug}/logo`, {
          method: "POST",
          body: fd,
          rawBody: true,
        });
      }

      router.push("/super-admin");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user?.isSuperAdmin) return null;

  return (
    <div className="min-h-screen bg-[#F5F7F8]">
      {/* Header */}
      <header className="bg-white border-b border-[#E2E8F0] px-6 py-4 flex items-center gap-4">
        <Link href="/super-admin" className="text-[#718096] hover:text-[#2D3748]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <div className="flex items-center gap-3">
          <Image src="/aria-logo.png" alt="ARIA" width={28} height={28} />
          <h1 className="text-lg font-bold text-[#2D3748]">New Client</h1>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Section 1: Client Details */}
        <section className="bg-white rounded-xl border border-[#E2E8F0] p-6">
          <h2 className="text-lg font-semibold text-[#2D3748] mb-4">Client Details</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1A202C] mb-1.5">
                Client Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-[#E2E8F0] px-4 py-2.5 text-sm focus:border-[#3D6273] focus:outline-none focus:ring-2 focus:ring-[#3D6273]/20"
                placeholder="e.g. Clippa"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1A202C] mb-1.5">
                Slug *
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                required
                className="w-full rounded-lg border border-[#E2E8F0] px-4 py-2.5 text-sm focus:border-[#3D6273] focus:outline-none focus:ring-2 focus:ring-[#3D6273]/20 font-mono"
                placeholder="e.g. clippa"
              />
              <p className="text-xs text-[#718096] mt-1">
                Used for subdomain: {slug || "client"}.ariascorecard.com
              </p>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-[#1A202C] mb-1.5">
              Custom Domains
            </label>
            <input
              type="text"
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              className="w-full rounded-lg border border-[#E2E8F0] px-4 py-2.5 text-sm focus:border-[#3D6273] focus:outline-none focus:ring-2 focus:ring-[#3D6273]/20"
              placeholder="e.g. clippa.ariascorecard.com, scorecard.clippa.co.za"
            />
            <p className="text-xs text-[#718096] mt-1">Comma-separated list of domains</p>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-[#1A202C] mb-1.5">
              SQL Server Client
            </label>
            <select
              value={sqlClientName}
              onChange={(e) => setSqlClientName(e.target.value)}
              className="w-full rounded-lg border border-[#E2E8F0] px-4 py-2.5 text-sm focus:border-[#3D6273] focus:outline-none focus:ring-2 focus:ring-[#3D6273]/20"
            >
              <option value="">— No SQL mapping —</option>
              {sqlClients.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}{c.kam ? ` (KAM: ${c.kam})` : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-[#718096] mt-1">
              Links this tenant to a client in the SQL database for real data
            </p>
          </div>
        </section>

        {/* Section 2: Branding */}
        <section className="bg-white rounded-xl border border-[#E2E8F0] p-6">
          <h2 className="text-lg font-semibold text-[#2D3748] mb-4">Branding</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ColorField
              label="Primary Colour *"
              value={primaryColor}
              onChange={setPrimaryColor}
              required
            />
            <ColorField
              label="Secondary Colour"
              value={secondaryColor}
              onChange={setSecondaryColor}
            />
            <ColorField
              label="Accent Colour"
              value={accentColor}
              onChange={setAccentColor}
            />
          </div>

          {/* Logo Upload */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-[#1A202C] mb-1.5">
              Client Logo
            </label>
            <div className="flex items-center gap-4">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="w-16 h-16 object-contain rounded-lg border border-[#E2E8F0] bg-white p-1"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg border-2 border-dashed border-[#CBD5E0] flex items-center justify-center text-[#A0AEC0]">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
              )}
              <div>
                <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#E2E8F0] text-sm font-medium text-[#2D3748] hover:bg-[#F7FAFC] transition-colors">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Choose File
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setLogoFile(file);
                      if (file) {
                        const url = URL.createObjectURL(file);
                        setLogoPreview(url);
                      } else {
                        setLogoPreview(null);
                      }
                    }}
                  />
                </label>
                {logoFile && (
                  <p className="text-xs text-[#718096] mt-1">{logoFile.name}</p>
                )}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="mt-4 p-4 rounded-lg border border-[#E2E8F0] flex gap-3">
            <div
              className="h-10 flex-1 rounded-lg flex items-center justify-center text-white text-xs font-medium"
              style={{ backgroundColor: primaryColor }}
            >
              Primary
            </div>
            {secondaryColor && (
              <div
                className="h-10 flex-1 rounded-lg flex items-center justify-center text-white text-xs font-medium"
                style={{ backgroundColor: secondaryColor }}
              >
                Secondary
              </div>
            )}
            {accentColor && (
              <div
                className="h-10 flex-1 rounded-lg flex items-center justify-center text-white text-xs font-medium"
                style={{ backgroundColor: accentColor }}
              >
                Accent
              </div>
            )}
          </div>
        </section>

        {/* Section 3: Modules */}
        <section className="bg-white rounded-xl border border-[#E2E8F0] p-6">
          <h2 className="text-lg font-semibold text-[#2D3748] mb-4">Modules</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {MODULE_DEFS.map((mod) => (
              <label
                key={mod.key}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  enabledModules.includes(mod.key)
                    ? "border-[#3D6273] bg-[#3D6273]/5"
                    : "border-[#E2E8F0] hover:border-[#CBD5E0]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={enabledModules.includes(mod.key)}
                  onChange={() => toggleModule(mod.key)}
                  className="w-4 h-4 accent-[#3D6273]"
                />
                <div>
                  <p className="text-sm font-medium text-[#2D3748]">{mod.label}</p>
                  <p className="text-xs text-[#718096]">{mod.description}</p>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Section 4: KPI Weightings */}
        <section className="bg-white rounded-xl border border-[#E2E8F0] p-6">
          <h2 className="text-lg font-semibold text-[#2D3748] mb-4">KPI Weightings</h2>
          <p className="text-sm text-[#718096] mb-4">
            Assign point weightings to each KPI. Must total 100.
          </p>

          <div className="space-y-3">
            {KPI_DEFS.map((kpi) => {
              const w = weightings.find((w) => w.key === kpi.key);
              return (
                <div key={kpi.key} className="flex items-center gap-4">
                  <span className="text-sm font-medium text-[#2D3748] w-48">
                    {kpi.label}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={w?.weight ?? kpi.defaultWeight}
                    onChange={(e) => updateWeight(kpi.key, Number(e.target.value))}
                    className="flex-1 accent-[#3D6273]"
                  />
                  <span className="text-sm font-mono w-10 text-right text-[#2D3748]">
                    {w?.weight ?? kpi.defaultWeight}
                  </span>
                </div>
              );
            })}
          </div>

          <div
            className={`mt-4 text-right text-sm font-semibold ${
              totalWeight === 100 ? "text-green-600" : "text-red-600"
            }`}
          >
            Total: {totalWeight} / 100
          </div>
        </section>

        {/* Section 5: Initial Admin User */}
        <section className="bg-white rounded-xl border border-[#E2E8F0] p-6">
          <h2 className="text-lg font-semibold text-[#2D3748] mb-4">
            Initial Admin User
          </h2>
          <p className="text-sm text-[#718096] mb-4">
            Create the first admin user for this client. Optional — can be done later.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1A202C] mb-1.5">Name</label>
              <input
                type="text"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                className="w-full rounded-lg border border-[#E2E8F0] px-4 py-2.5 text-sm focus:border-[#3D6273] focus:outline-none focus:ring-2 focus:ring-[#3D6273]/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1A202C] mb-1.5">Email</label>
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="w-full rounded-lg border border-[#E2E8F0] px-4 py-2.5 text-sm focus:border-[#3D6273] focus:outline-none focus:ring-2 focus:ring-[#3D6273]/20"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-[#1A202C] mb-1.5">Password</label>
            <PasswordInput
              id="admin-pw"
              name="admin-pw"
              value={adminPassword}
              onChange={setAdminPassword}
              placeholder="Set initial password"
              autoComplete="new-password"
            />
          </div>

          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-2 text-sm text-[#2D3748] cursor-pointer">
              <input
                type="checkbox"
                checked={forcePasswordChange}
                onChange={(e) => setForcePasswordChange(e.target.checked)}
                className="w-4 h-4 accent-[#3D6273]"
              />
              Force password change on first login
            </label>
            <label className="flex items-center gap-2 text-sm text-[#2D3748] cursor-pointer">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="w-4 h-4 accent-[#3D6273]"
              />
              Send welcome email with credentials
            </label>
          </div>
        </section>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Link
            href="/super-admin"
            className="px-6 py-2.5 rounded-lg text-sm font-medium text-[#718096] border border-[#E2E8F0] hover:bg-white transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-lg bg-[#3D6273] text-sm font-medium text-white hover:bg-[#345566] transition-colors disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Client"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#1A202C] mb-1.5">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          type="color"
          value={value || "#3D6273"}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded border border-[#E2E8F0] cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          placeholder="#000000"
          className="flex-1 rounded-lg border border-[#E2E8F0] px-4 py-2.5 text-sm font-mono focus:border-[#3D6273] focus:outline-none focus:ring-2 focus:ring-[#3D6273]/20"
        />
      </div>
    </div>
  );
}
