import type { UserRole, PermissionKey, PermissionDef, RolePermissions } from "./types";

export const ALL_PERMISSIONS: PermissionDef[] = [
  // Admin
  { key: "manage_users", label: "Manage Users", category: "admin" },
  { key: "manage_roles", label: "Manage Roles", category: "admin" },
  { key: "manage_clients", label: "Manage Clients", category: "admin" },
  { key: "manage_modules", label: "Manage Modules", category: "admin" },
  { key: "manage_kpis", label: "Manage KPIs", category: "admin" },
  { key: "manage_cam_mapping", label: "Manage CAM Mapping", category: "admin" },
  // View
  { key: "view_dashboard", label: "View Dashboard", category: "view" },
  { key: "view_cam_scorecard", label: "View CAM Scorecard", category: "view" },
  { key: "view_channel_scorecard", label: "View Channel Scorecard", category: "view" },
  { key: "view_store_scorecard", label: "View Store Scorecard", category: "view" },
  { key: "view_product_scorecard", label: "View Product Scorecard", category: "view" },
  // Data
  { key: "export_data", label: "Export Data", category: "data" },
];

export const DEFAULT_ROLE_PERMISSIONS: RolePermissions[] = [
  {
    role: "super_admin",
    permissions: ALL_PERMISSIONS.map((p) => p.key),
  },
  {
    role: "admin",
    permissions: [
      "manage_users",
      "manage_roles",
      "manage_modules",
      "manage_kpis",
      "manage_cam_mapping",
      "view_dashboard",
      "view_cam_scorecard",
      "view_channel_scorecard",
      "view_store_scorecard",
      "view_product_scorecard",
      "export_data",
    ],
  },
  {
    role: "cam",
    permissions: [
      "view_dashboard",
      "view_cam_scorecard",
      "view_channel_scorecard",
      "view_store_scorecard",
      "view_product_scorecard",
      "export_data",
    ],
  },
  {
    role: "manager",
    permissions: [
      "view_dashboard",
      "view_channel_scorecard",
      "view_store_scorecard",
      "view_product_scorecard",
      "export_data",
    ],
  },
  {
    role: "rep",
    permissions: [
      "view_dashboard",
      "view_store_scorecard",
      "view_product_scorecard",
    ],
  },
];

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  cam: "CAM",
  manager: "Manager",
  rep: "Rep",
};

export function getRoleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? role;
}

export function isRoleAtLeast(role: UserRole, minRole: UserRole): boolean {
  const hierarchy: UserRole[] = ["super_admin", "admin", "cam", "manager", "rep"];
  return hierarchy.indexOf(role) <= hierarchy.indexOf(minRole);
}

export function hasPermission(
  rolePerms: RolePermissions[],
  role: UserRole,
  perm: PermissionKey
): boolean {
  if (role === "super_admin") return true;
  const entry = rolePerms.find((rp) => rp.role === role);
  return entry ? entry.permissions.includes(perm) : false;
}
