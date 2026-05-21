import type { RolePermissions } from "./types";
import { readJson, writeJson } from "./blob";
import { DEFAULT_ROLE_PERMISSIONS } from "./roles";

function rolePermsKey(tenantSlug: string): string {
  return `${tenantSlug}/config/role-permissions.json`;
}

export async function getRolePermissions(
  tenantSlug: string
): Promise<RolePermissions[]> {
  return readJson<RolePermissions[]>(
    rolePermsKey(tenantSlug),
    DEFAULT_ROLE_PERMISSIONS
  );
}

export async function saveRolePermissions(
  tenantSlug: string,
  rolePerms: RolePermissions[]
): Promise<void> {
  // Ensure super_admin always has all permissions
  const superAdminEntry = rolePerms.find((rp) => rp.role === "super_admin");
  if (superAdminEntry) {
    const { ALL_PERMISSIONS } = await import("./roles");
    superAdminEntry.permissions = ALL_PERMISSIONS.map((p) => p.key);
  }
  await writeJson(rolePermsKey(tenantSlug), rolePerms);
}
