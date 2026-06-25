"use client";

import { usePermissions } from "@/contexts/PermissionsContext";
import type { PermissionKey } from "@/lib/types";

interface PermissionGateProps {
  permission: PermissionKey;
  children: React.ReactNode;
}

/**
 * Page-level guard: renders children only if the current role holds
 * `permission`. While permissions load it shows nothing (avoids a flash of the
 * "no access" screen). Super admins always pass (see PermissionsContext.can).
 */
export default function PermissionGate({
  permission,
  children,
}: PermissionGateProps) {
  const { can, loading } = usePermissions();

  if (loading) return null;

  if (!can(permission)) {
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
          No Access
        </h2>
        <p className="text-[var(--color-text-muted)] max-w-md">
          Your role doesn&apos;t have permission to view this page. If you need
          access, please speak to your administrator.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
