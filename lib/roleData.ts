import type { RolePermissions, PermissionKey } from "./types";
import { readJson, writeJson } from "./blob";
import { DEFAULT_ROLE_PERMISSIONS } from "./roles";

function rolePermsKey(tenantSlug: string): string {
  return `${tenantSlug}/config/role-permissions.json`;
}

function versionKey(tenantSlug: string): string {
  return `${tenantSlug}/config/role-permissions-version.json`;
}

// Bump when new permission keys are added that existing tenants should receive
// by default. v2 introduced view_phantom / view_oos / view_nd / view_sales.
const CURRENT_VERSION = 2;
const V2_NEW_KEYS: PermissionKey[] = ["view_phantom", "view_oos", "view_nd", "view_sales"];

export async function getRolePermissions(
  tenantSlug: string
): Promise<RolePermissions[]> {
  // Sentinel fallback lets us tell "never configured" (→ full current defaults)
  // apart from "saved config exists" (→ may need migrating).
  const saved = await readJson<RolePermissions[] | null>(
    rolePermsKey(tenantSlug),
    null
  );
  if (!saved) return DEFAULT_ROLE_PERMISSIONS;

  const ver = await readJson<{ v: number }>(versionKey(tenantSlug), { v: 1 });
  if (ver.v < CURRENT_VERSION) {
    const migrated = migrateToV2(saved);
    // Persist once so admins can later revoke the new keys (a pure-read merge
    // would keep re-granting them). The version marker stops repeat writes.
    await writeJson(rolePermsKey(tenantSlug), migrated);
    await writeJson(versionKey(tenantSlug), { v: CURRENT_VERSION });
    return migrated;
  }

  return saved;
}

// Additive: grant each role the new v2 view permissions it gets by default,
// without disturbing any existing (de)selections. Roles absent from the saved
// config are added from defaults.
function migrateToV2(saved: RolePermissions[]): RolePermissions[] {
  return DEFAULT_ROLE_PERMISSIONS.map((def) => {
    const existing = saved.find((rp) => rp.role === def.role);
    if (!existing) return { role: def.role, permissions: [...def.permissions] };

    const grantNew = V2_NEW_KEYS.filter((k) => def.permissions.includes(k));
    const merged = Array.from(new Set([...existing.permissions, ...grantNew]));
    return { role: def.role, permissions: merged };
  });
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
  // Saving a full matrix means the config is current — stamp the version so the
  // migration never re-adds keys the admin may have intentionally cleared.
  await writeJson(versionKey(tenantSlug), { v: CURRENT_VERSION });
}
