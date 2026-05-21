"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import PasswordInput from "@/components/PasswordInput";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="text-center">
        <p className="text-sm text-red-600 mb-4">Invalid reset link. No token provided.</p>
        <Link href="/forgot-password" className="text-sm text-[var(--color-primary)] hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#38A169" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p className="text-sm text-[var(--color-text)] mb-4">
          Your password has been reset successfully.
        </p>
        <Link
          href="/login"
          className="block w-full text-center py-2.5 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: "var(--color-primary)" }}
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="password" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
          New Password
        </label>
        <PasswordInput
          id="password"
          name="password"
          value={password}
          onChange={setPassword}
          required
          placeholder="Enter new password"
          autoComplete="new-password"
        />
      </div>

      <div className="mb-4">
        <label htmlFor="confirm" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
          Confirm Password
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
        disabled={loading}
        className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        {loading ? "Resetting..." : "Reset Password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Image src="/aria-logo.png" alt="ARIA Score Card" width={64} height={64} className="mb-4" />
          <h1 className="text-xl font-bold text-[var(--color-dark)]">Set New Password</h1>
        </div>
        <div className="bg-white rounded-xl border border-[var(--color-border)] p-6 shadow-sm">
          <Suspense fallback={<div className="text-center text-sm text-gray-400">Loading...</div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
