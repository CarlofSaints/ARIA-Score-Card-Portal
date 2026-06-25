"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { authFetch } from "@/lib/useAuth";
import type { PermissionKey, UserRole } from "@/lib/types";

interface PermissionsState {
  role: UserRole | null;
  permissions: PermissionKey[];
  loading: boolean;
  /**
   * True if the user holds `perm`. While permissions are still loading this
   * returns `true` (optimistic) so navigation/pages don't flash hidden before
   * the real set arrives — gates settle once `loading` is false.
   */
  can: (perm: PermissionKey) => boolean;
}

const PermissionsContext = createContext<PermissionsState>({
  role: null,
  permissions: [],
  loading: true,
  can: () => true,
});

export function usePermissions() {
  return useContext(PermissionsContext);
}

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [permissions, setPermissions] = useState<PermissionKey[]>([]);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    authFetch("/api/me/permissions")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setPermissions(Array.isArray(data.permissions) ? data.permissions : []);
        setRole(data.role ?? null);
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const can = (perm: PermissionKey) =>
    loading || role === "super_admin" || permissions.includes(perm);

  return (
    <PermissionsContext.Provider value={{ role, permissions, loading, can }}>
      {children}
    </PermissionsContext.Provider>
  );
}
