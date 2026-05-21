"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth, authFetch } from "@/lib/useAuth";
import type { TenantConfig } from "@/lib/types";

export default function SuperAdminDashboard() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantConfig[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && (!user || !user.isSuperAdmin)) {
      router.push("/super-admin/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (user?.isSuperAdmin) {
      authFetch("/api/super-admin/tenants")
        .then((r) => r.json())
        .then((data) => setTenants(data.tenants || []))
        .catch(() => {})
        .finally(() => setFetching(false));
    }
  }, [user]);

  if (loading || !user?.isSuperAdmin) return null;

  return (
    <div className="min-h-screen bg-[#F5F7F8]">
      {/* Header */}
      <header className="bg-white border-b border-[#E2E8F0] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/aria-logo.png" alt="ARIA" width={32} height={32} />
          <div>
            <h1 className="text-lg font-bold text-[#2D3748]">ARIA Score Card</h1>
            <p className="text-xs text-[#718096]">Platform Administration</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[#718096]">{user.name}</span>
          <button
            onClick={() => { logout(); router.push("/super-admin/login"); }}
            className="text-sm text-[#E04E2A] hover:underline"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-[#2D3748]">Clients</h2>
          <Link
            href="/super-admin/clients/new"
            className="px-4 py-2 rounded-lg bg-[#3D6273] text-white text-sm font-medium hover:bg-[#345566] transition-colors"
          >
            + New Client
          </Link>
        </div>

        {fetching ? (
          <div className="text-center py-12 text-[#718096]">Loading...</div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-[#E2E8F0]">
            <p className="text-[#718096] mb-4">No clients yet.</p>
            <Link
              href="/super-admin/clients/new"
              className="text-sm font-medium text-[#3D6273] hover:underline"
            >
              Create your first client
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {tenants.map((t) => (
              <Link
                key={t.slug}
                href={`/super-admin/clients/${t.slug}`}
                className="bg-white rounded-xl border border-[#E2E8F0] p-5 hover:shadow-md transition-shadow flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: t.branding.primaryColor }}
                  >
                    {t.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#2D3748]">{t.name}</h3>
                    <p className="text-xs text-[#718096]">
                      {t.slug} &middot; {t.enabledModules.length} modules &middot;{" "}
                      {t.active ? (
                        <span className="text-green-600">Active</span>
                      ) : (
                        <span className="text-red-500">Inactive</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {t.branding.primaryColor && (
                    <div
                      className="w-6 h-6 rounded-full border-2 border-white shadow"
                      style={{ backgroundColor: t.branding.primaryColor }}
                      title={`Primary: ${t.branding.primaryColor}`}
                    />
                  )}
                  {t.branding.secondaryColor && (
                    <div
                      className="w-6 h-6 rounded-full border-2 border-white shadow"
                      style={{ backgroundColor: t.branding.secondaryColor }}
                      title={`Secondary: ${t.branding.secondaryColor}`}
                    />
                  )}
                  {t.branding.accentColor && (
                    <div
                      className="w-6 h-6 rounded-full border-2 border-white shadow"
                      style={{ backgroundColor: t.branding.accentColor }}
                      title={`Accent: ${t.branding.accentColor}`}
                    />
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
