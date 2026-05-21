"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import PasswordInput from "@/components/PasswordInput";
import { authFetch } from "@/lib/useAuth";

export default function AccountPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const isForced = user?.forcePasswordChange === true;

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setSaving(true);
    try {
      const res = await authFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: isForced ? undefined : currentPassword,
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to change password");
        return;
      }

      setSuccess("Password changed successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      // Update session to clear forcePasswordChange
      if (user && isForced) {
        login({ ...user, forcePasswordChange: false });
        setTimeout(() => router.push("/"), 1500);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user) return null;

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-[var(--color-dark)] mb-2">
        {isForced ? "Change Your Password" : "Account Settings"}
      </h1>

      {isForced && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Your administrator requires you to change your password before continuing.
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-[var(--color-border)] p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            {success}
          </div>
        )}

        {!isForced && (
          <div className="mb-4">
            <label htmlFor="current" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
              Current Password
            </label>
            <PasswordInput
              id="current"
              name="current"
              value={currentPassword}
              onChange={setCurrentPassword}
              required
              placeholder="Enter current password"
            />
          </div>
        )}

        <div className="mb-4">
          <label htmlFor="new" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
            New Password
          </label>
          <PasswordInput
            id="new"
            name="new"
            value={newPassword}
            onChange={setNewPassword}
            required
            placeholder="Enter new password"
            autoComplete="new-password"
          />
        </div>

        <div className="mb-6">
          <label htmlFor="confirm" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
            Confirm New Password
          </label>
          <PasswordInput
            id="confirm"
            name="confirm"
            value={confirmPassword}
            onChange={setConfirmPassword}
            required
            placeholder="Confirm new password"
            autoComplete="new-password"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
          style={{ backgroundColor: "var(--color-primary)" }}
        >
          {saving ? "Changing..." : "Change Password"}
        </button>
      </form>
    </div>
  );
}
