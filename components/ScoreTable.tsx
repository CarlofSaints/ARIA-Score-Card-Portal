"use client";

import { useState, useEffect } from "react";
import { authFetch } from "@/lib/useAuth";
import { KPI_DEFS } from "@/lib/modules";
import type { EntityScore } from "@/lib/types";

interface ScoreTableProps {
  type: "cam" | "channel" | "store" | "product";
  title: string;
}

function scoreColor(score: number, max: number): string {
  if (max === 0) return "text-gray-400";
  const pct = score / max;
  if (pct >= 0.8) return "text-green-600";
  if (pct >= 0.6) return "text-blue-600";
  if (pct >= 0.4) return "text-amber-600";
  return "text-red-600";
}

function scoreBg(score: number, max: number): string {
  if (max === 0) return "bg-gray-50";
  const pct = score / max;
  if (pct >= 0.8) return "bg-green-50";
  if (pct >= 0.6) return "bg-blue-50";
  if (pct >= 0.4) return "bg-amber-50";
  return "bg-red-50";
}

export default function ScoreTable({ type, title }: ScoreTableProps) {
  const [scores, setScores] = useState<EntityScore[]>([]);
  const [period, setPeriod] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch(`/api/scores/${type}`)
      .then((r) => r.json())
      .then((data) => {
        setScores(data.scores || []);
        setPeriod(data.period || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [type]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div>
      {/* Summary Cards */}
      {scores.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-[var(--color-border)] p-4 text-center">
            <p className="text-2xl font-bold text-[var(--color-primary)]">
              {scores.length}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              Total {title}s
            </p>
          </div>
          <div className="bg-white rounded-xl border border-[var(--color-border)] p-4 text-center">
            <p className="text-2xl font-bold text-green-600">
              {scores.filter((s) => s.totalScore / s.maxPossibleScore >= 0.8).length}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">Top Performers</p>
          </div>
          <div className="bg-white rounded-xl border border-[var(--color-border)] p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">
              {Math.round(
                scores.reduce((s, sc) => s + sc.totalScore, 0) / Math.max(1, scores.length) * 10
              ) / 10}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">Avg Score</p>
          </div>
          <div className="bg-white rounded-xl border border-[var(--color-border)] p-4 text-center">
            <p className="text-2xl font-bold text-[var(--color-text)]">
              {period}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">Period</p>
          </div>
        </div>
      )}

      {/* Score Table */}
      <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-bg)]">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)] w-8">
                  #
                </th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">
                  Name
                </th>
                {KPI_DEFS.map((kpi) => (
                  <th
                    key={kpi.key}
                    className="text-center px-3 py-3 font-medium text-[var(--color-text-muted)]"
                  >
                    {kpi.shortLabel}
                    <div className="text-[10px] font-normal opacity-60">% · score</div>
                  </th>
                ))}
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {scores.map((s) => (
                <tr
                  key={s.entityId}
                  className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg)]/50"
                >
                  <td className="px-4 py-3 text-[var(--color-text-muted)] font-mono">
                    {s.rank}
                  </td>
                  <td className="px-4 py-3 font-medium text-[var(--color-text)]">
                    {s.entityName}
                  </td>
                  {KPI_DEFS.map((kpi) => {
                    const ks = s.kpiScores.find((k) => k.kpiKey === kpi.key);
                    return (
                      <td key={kpi.key} className="text-center px-3 py-3">
                        <div className="text-xs font-semibold text-[var(--color-text)]">
                          {ks?.percent !== undefined ? `${ks.percent.toFixed(1)}%` : "—"}
                        </div>
                        <span
                          className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${scoreBg(
                            ks?.score ?? 0,
                            ks?.maxScore ?? 1
                          )} ${scoreColor(ks?.score ?? 0, ks?.maxScore ?? 1)}`}
                        >
                          {ks?.score.toFixed(1) ?? "-"}
                        </span>
                      </td>
                    );
                  })}
                  <td className="text-center px-4 py-3">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${scoreBg(
                        s.totalScore,
                        s.maxPossibleScore
                      )} ${scoreColor(s.totalScore, s.maxPossibleScore)}`}
                    >
                      {s.totalScore.toFixed(1)}
                    </span>
                  </td>
                </tr>
              ))}
              {scores.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-[var(--color-text-muted)]"
                  >
                    No data available. Seed mock data from the Control Centre or connect to SQL Server.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
