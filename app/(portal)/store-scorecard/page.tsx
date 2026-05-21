"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import ModuleGate from "@/components/ModuleGate";
import ScoreTable from "@/components/ScoreTable";

export default function StoreScorecardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  if (loading || !user) return null;

  return (
    <ModuleGate moduleKey="store_scorecard">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-dark)]">
          Store Score Card
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Performance scores for individual stores
        </p>
      </div>
      <ScoreTable type="store" title="Store" />
    </ModuleGate>
  );
}
