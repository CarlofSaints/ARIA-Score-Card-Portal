"use client";

import { useTenant } from "@/contexts/TenantContext";
import type { ModuleKey } from "@/lib/types";

interface ModuleGateProps {
  moduleKey: ModuleKey;
  children: React.ReactNode;
}

export default function ModuleGate({ moduleKey, children }: ModuleGateProps) {
  const tenant = useTenant();
  const isEnabled = tenant.enabledModules.includes(moduleKey);

  if (!isEnabled) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#9CA3AF"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-[var(--color-dark)] mb-2">
          Module Not Enabled
        </h2>
        <p className="text-[var(--color-text-muted)] max-w-md">
          This module has not been enabled for your account. If you would like
          to add it, please speak to your CAM.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
