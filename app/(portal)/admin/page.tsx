"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import { ALL_PERMISSIONS, ROLE_LABELS } from "@/lib/roles";
import PasswordInput from "@/components/PasswordInput";
import type { UserRole, PermissionKey, RolePermissions } from "@/lib/types";

interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  forcePasswordChange: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

const ROLES: UserRole[] = ["super_admin", "admin", "cam", "manager", "rep"];

export default function AdminPage() {
  const { user, loading, hasRole } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<SafeUser[]>([]);
  const [rolePerms, setRolePerms] = useState<RolePermissions[]>([]);
  const [tab, setTab] = useState<"users" | "permissions">("users");

  // Create user form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("rep");
  const [newForce, setNewForce] = useState(true);
  const [newSendEmail, setNewSendEmail] = useState(true);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  const [permsSaving, setPermsSaving] = useState(false);
  const [permsMsg, setPermsMsg] = useState("");

  useEffect(() => {
    if (!loading && !hasRole("admin")) {
      router.push("/");
    }
  }, [loading, hasRole, router]);

  useEffect(() => {
    if (user && hasRole("admin")) {
      loadUsers();
      loadPerms();
    }
  }, [user]);

  async function loadUsers() {
    try {
      const res = await authFetch("/api/users");
      const data = await res.json();
      setUsers(data.users || []);
    } catch { /* ignore */ }
  }

  async function loadPerms() {
    try {
      const res = await authFetch("/api/role-permissions");
      const data = await res.json();
      setRolePerms(data.rolePermissions || []);
    } catch { /* ignore */ }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setCreating(true);

    try {
      const res = await authFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          password: newPassword,
          role: newRole,
          forcePasswordChange: newForce,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || "Failed");
        return;
      }

      // Send welcome email if checked
      if (newSendEmail) {
        await authFetch("/api/users/send-welcome", {
          method: "POST",
          body: JSON.stringify({
            email: newEmail,
            name: newName,
            password: newPassword,
            forcePasswordChange: newForce,
          }),
        }).catch(() => {});
      }

      setShowCreate(false);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("rep");
      setNewForce(true);
      setNewSendEmail(true);
      loadUsers();
    } catch {
      setCreateError("Network error");
    } finally {
      setCreating(false);
    }
  }

  function togglePerm(role: UserRole, perm: PermissionKey) {
    if (role === "super_admin") return;
    setRolePerms((prev) =>
      prev.map((rp) => {
        if (rp.role !== role) return rp;
        const has = rp.permissions.includes(perm);
        return {
          ...rp,
          permissions: has
            ? rp.permissions.filter((p) => p !== perm)
            : [...rp.permissions, perm],
        };
      })
    );
  }

  async function savePerms() {
    setPermsSaving(true);
    setPermsMsg("");
    try {
      const res = await authFetch("/api/role-permissions", {
        method: "PUT",
        body: JSON.stringify({ rolePermissions: rolePerms }),
      });
      if (res.ok) setPermsMsg("Saved");
      else setPermsMsg("Failed to save");
    } catch {
      setPermsMsg("Network error");
    } finally {
      setPermsSaving(false);
    }
  }

  async function toggleUserActive(u: SafeUser) {
    await authFetch("/api/users", {
      method: "PUT",
      body: JSON.stringify({ id: u.id, active: !u.active }),
    });
    loadUsers();
  }

  if (loading || !user) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-dark)] mb-6">Admin</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white rounded-lg border border-[var(--color-border)] p-1 w-fit">
        <button
          onClick={() => setTab("users")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "users"
              ? "bg-[var(--color-primary)] text-white"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          Users
        </button>
        <button
          onClick={() => setTab("permissions")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "permissions"
              ? "bg-[var(--color-primary)] text-white"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          Permissions
        </button>
      </div>

      {tab === "users" && (
        <div>
          {/* Create User Button */}
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90"
            >
              {showCreate ? "Cancel" : "+ New User"}
            </button>
          </div>

          {/* Create User Form */}
          {showCreate && (
            <form
              onSubmit={handleCreateUser}
              className="bg-white rounded-xl border border-[var(--color-border)] p-6 mb-6"
            >
              <h3 className="text-lg font-semibold text-[var(--color-dark)] mb-4">
                Create User
              </h3>
              {createError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {createError}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Name *</label>
                  <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} required className="w-full rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Email *</label>
                  <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required className="w-full rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Password *</label>
                  <PasswordInput id="new-user-pw" name="new-user-pw" value={newPassword} onChange={setNewPassword} required autoComplete="new-password" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Role *</label>
                  <select value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)} className="w-full rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none">
                    {ROLES.filter((r) => r !== "super_admin").map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2 mb-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={newForce} onChange={(e) => setNewForce(e.target.checked)} className="w-4 h-4 accent-[var(--color-primary)]" />
                  Force password change on first login
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={newSendEmail} onChange={(e) => setNewSendEmail(e.target.checked)} className="w-4 h-4 accent-[var(--color-primary)]" />
                  Send welcome email with credentials
                </label>
              </div>
              <button type="submit" disabled={creating} className="px-6 py-2.5 rounded-lg bg-[var(--color-primary)] text-sm font-medium text-white disabled:opacity-50">
                {creating ? "Creating..." : "Create User"}
              </button>
            </form>
          )}

          {/* Users Table */}
          <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-bg)]">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Role</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-[var(--color-border)]">
                      <td className="px-4 py-3 font-medium">{u.name}</td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)]">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                          {ROLE_LABELS[u.role] || u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {u.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleUserActive(u)}
                          className="text-xs text-[var(--color-primary)] hover:underline"
                        >
                          {u.active ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-text-muted)]">
                        No users yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "permissions" && (
        <div>
          <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-bg)]">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)] w-48">
                      Permission
                    </th>
                    {ROLES.map((r) => (
                      <th key={r} className="text-center px-3 py-3 font-medium text-[var(--color-text-muted)]">
                        {ROLE_LABELS[r]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALL_PERMISSIONS.map((perm) => (
                    <tr key={perm.key} className="border-t border-[var(--color-border)]">
                      <td className="px-4 py-3 font-medium">{perm.label}</td>
                      {ROLES.map((r) => {
                        const rp = rolePerms.find((rp) => rp.role === r);
                        const has = rp?.permissions.includes(perm.key) ?? false;
                        const locked = r === "super_admin";
                        return (
                          <td key={r} className="text-center px-3 py-3">
                            <input
                              type="checkbox"
                              checked={has}
                              disabled={locked}
                              onChange={() => togglePerm(r, perm.key)}
                              className="w-4 h-4 accent-[var(--color-primary)] disabled:opacity-50"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={savePerms}
              disabled={permsSaving}
              className="px-6 py-2.5 rounded-lg bg-[var(--color-primary)] text-sm font-medium text-white disabled:opacity-50"
            >
              {permsSaving ? "Saving..." : "Save Permissions"}
            </button>
            {permsMsg && (
              <span className={`text-sm ${permsMsg === "Saved" ? "text-green-600" : "text-red-600"}`}>
                {permsMsg}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
