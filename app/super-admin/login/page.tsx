"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import PasswordInput from "@/components/PasswordInput";
import { useAuth } from "@/lib/useAuth";

export default function SuperAdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && user?.isSuperAdmin) {
      router.push("/super-admin");
    }
  }, [authLoading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/super-admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }

      login(data.user);
      router.push("/super-admin");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F7F8] px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Image src="/aria-logo.png" alt="ARIA" width={64} height={64} className="mb-4" />
          <h1 className="text-xl font-bold text-[#2D3748]">Super Admin</h1>
          <p className="text-sm text-[#718096]">Platform Administration</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-[#E2E8F0] p-6 shadow-sm">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label htmlFor="sa-email" className="block text-sm font-medium text-[#1A202C] mb-1.5">
              Email
            </label>
            <input
              id="sa-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm focus:border-[#3D6273] focus:outline-none focus:ring-2 focus:ring-[#3D6273]/20"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="sa-password" className="block text-sm font-medium text-[#1A202C] mb-1.5">
              Password
            </label>
            <PasswordInput
              id="sa-password"
              name="sa-password"
              value={password}
              onChange={setPassword}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-[#3D6273] text-sm font-medium text-white transition-colors hover:bg-[#345566] disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="mt-6 text-center text-[10px] text-[#718096]">
          Powered by <span className="font-semibold text-[#3D6273]">OuterJoin</span>
        </p>
      </div>
    </div>
  );
}
