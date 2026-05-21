"use client";

import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/lib/useAuth";
import { MODULE_DEFS } from "@/lib/modules";
import { KPI_DEFS } from "@/lib/modules";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DashboardPage() {
  const tenant = useTenant();
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  const enabledModules = tenant.enabledModules;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--color-dark)]">
          Dashboard
        </h1>
        <p className="text-[var(--color-text-muted)] mt-1">
          Welcome back, {user.name}
        </p>
      </div>

      {/* Module Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {MODULE_DEFS.map((mod) => {
          const isEnabled = enabledModules.includes(mod.key);
          return (
            <Link
              key={mod.key}
              href={isEnabled ? mod.route : "#"}
              onClick={(e) => {
                if (!isEnabled) e.preventDefault();
              }}
              className={`group relative rounded-xl border p-6 transition-all ${
                isEnabled
                  ? "border-[var(--color-border)] bg-white hover:shadow-md hover:border-[var(--color-primary)]/30"
                  : "border-gray-200 bg-gray-50 cursor-not-allowed"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3
                    className={`text-lg font-semibold ${
                      isEnabled
                        ? "text-[var(--color-dark)]"
                        : "text-gray-400"
                    }`}
                  >
                    {mod.label}
                  </h3>
                  <p
                    className={`text-sm mt-1 ${
                      isEnabled
                        ? "text-[var(--color-text-muted)]"
                        : "text-gray-300"
                    }`}
                  >
                    {mod.description}
                  </p>
                </div>
                {!isEnabled && (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#D1D5DB"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                )}
              </div>
              {isEnabled && (
                <div className="mt-4 flex items-center text-sm font-medium text-[var(--color-primary)] group-hover:gap-2 transition-all">
                  View Scorecard
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="ml-1"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* KPI Summary */}
      <div className="bg-white rounded-xl border border-[var(--color-border)] p-6">
        <h2 className="text-lg font-semibold text-[var(--color-dark)] mb-4">
          KPI Weightings
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {KPI_DEFS.map((kpi) => (
            <div
              key={kpi.key}
              className="text-center p-4 rounded-lg bg-[var(--color-bg)]"
            >
              <p className="text-2xl font-bold text-[var(--color-primary)]">
                {kpi.defaultWeight}
              </p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                {kpi.shortLabel}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
