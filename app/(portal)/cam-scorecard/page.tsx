"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import ModuleGate from "@/components/ModuleGate";
import PermissionGate from "@/components/PermissionGate";
import ScoreTable from "@/components/ScoreTable";

export default function CamScorecardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  if (loading || !user) return null;

  return (
    <PermissionGate permission="view_cam_scorecard">
      <ModuleGate moduleKey="cam_scorecard">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--color-dark)]">
            CAM Score Card
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Performance scores for CAMs across assigned channels and brands
          </p>
        </div>
        <ScoreTable type="cam" title="CAM" />
      </ModuleGate>
    </PermissionGate>
  );
}
