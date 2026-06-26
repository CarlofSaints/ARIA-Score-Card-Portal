"use client";

import { useState, useEffect, useMemo } from "react";
import { authFetch } from "@/lib/useAuth";
import { KPI_DEFS } from "@/lib/modules";
import { useColumnWidths, Th } from "@/components/resizableColumns";
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

type SortKey = string; // "rank" | "name" | "total" | <kpi.key>

const FIXED_COLS = [
  { key: "rank", label: "#", width: 56, align: "left" as const },
  { key: "name", label: "Name", width: 240, align: "left" as const },
];

export default function ScoreTable({ type, title }: ScoreTableProps) {
  const [scores, setScores] = useState<EntityScore[]>([]);
  const [period, setPeriod] = useState("");
  const [loading, setLoading] = useState(true);

  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const cols = useMemo(
    () => [
      ...FIXED_COLS,
      ...KPI_DEFS.map((k) => ({ key: k.key, label: k.shortLabel, width: 130, align: "center" as const })),
      { key: "total", label: "Total", width: 130, align: "center" as const },
    ],
    []
  );

  const { widths, startResize, totalWidth } = useColumnWidths(
    Object.fromEntries(cols.map((c) => [c.key, c.width]))
  );

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

  function valueFor(s: EntityScore, key: SortKey): number | string {
    if (key === "name") return s.entityName;
    if (key === "rank" || key === "total") return s.totalScore;
    return s.kpiScores.find((k) => k.kpiKey === key)?.score ?? 0;
  }

  const withData = useMemo(() => scores.filter((s) => s.hasData !== false), [scores]);

  const sorted = useMemo(() => {
    const arr = [...scores];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const av = valueFor(a, sortKey);
      const bv = valueFor(b, sortKey);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
    return arr;
  }, [scores, sortKey, sortDir]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

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
            <p className="text-2xl font-bold text-[var(--color-primary)]">{scores.length}</p>
            <p className="text-xs text-[var(--color-text-muted)]">Total {title}s</p>
          </div>
          <div className="bg-white rounded-xl border border-[var(--color-border)] p-4 text-center">
            <p className="text-2xl font-bold text-green-600">
              {withData.filter((s) => s.totalScore / s.maxPossibleScore >= 0.8).length}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">Top Performers</p>
          </div>
          <div className="bg-white rounded-xl border border-[var(--color-border)] p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">
              {Math.round((withData.reduce((s, sc) => s + sc.totalScore, 0) / Math.max(1, withData.length)) * 10) / 10}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">Avg Score</p>
          </div>
          <div className="bg-white rounded-xl border border-[var(--color-border)] p-4 text-center">
            <p className="text-2xl font-bold text-[var(--color-text)]">{period}</p>
            <p className="text-xs text-[var(--color-text-muted)]">Period</p>
          </div>
        </div>
      )}

      {/* Score Table */}
      <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-sm" style={{ tableLayout: "fixed", width: totalWidth(cols.map((c) => c.key)), minWidth: "100%" }}>
            <colgroup>
              {cols.map((c) => <col key={c.key} style={{ width: widths[c.key] }} />)}
            </colgroup>
            <thead className="bg-[var(--color-bg)]">
              <tr className="text-[var(--color-text-muted)]">
                {cols.map((c) => {
                  const kpi = KPI_DEFS.find((k) => k.key === c.key);
                  return (
                    <Th
                      key={c.key}
                      colKey={c.key}
                      align={c.align}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                      onResize={startResize(c.key)}
                      label={
                        kpi ? (
                          <>
                            {kpi.shortLabel}
                            <div className="text-[10px] font-normal opacity-60">% · pts / max</div>
                          </>
                        ) : (
                          c.label
                        )
                      }
                    />
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.entityId} className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg)]/50">
                  <td className="px-4 py-3 text-[var(--color-text-muted)] font-mono">{s.rank}</td>
                  <td className="px-4 py-3 font-medium text-[var(--color-text)] truncate">{s.entityName}</td>
                  {KPI_DEFS.map((kpi) => {
                    const ks = s.kpiScores.find((k) => k.kpiKey === kpi.key);
                    if (s.hasData === false) {
                      return (
                        <td key={kpi.key} className="text-center px-3 py-3 text-[var(--color-text-muted)]">
                          —
                        </td>
                      );
                    }
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
                          {ks ? `${ks.score.toFixed(1)} / ${ks.maxScore}` : "-"}
                        </span>
                      </td>
                    );
                  })}
                  <td className="text-center px-4 py-3">
                    {s.hasData === false ? (
                      <span className="text-[var(--color-text-muted)] text-xs">no data</span>
                    ) : (
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${scoreBg(
                          s.totalScore,
                          s.maxPossibleScore
                        )} ${scoreColor(s.totalScore, s.maxPossibleScore)}`}
                      >
                        {s.totalScore.toFixed(1)} / {s.maxPossibleScore}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {scores.length === 0 && (
                <tr>
                  <td colSpan={cols.length} className="px-4 py-12 text-center text-[var(--color-text-muted)]">
                    No scores yet. Run a sync from the Control Centre, then set KPI weightings and points brackets.
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
