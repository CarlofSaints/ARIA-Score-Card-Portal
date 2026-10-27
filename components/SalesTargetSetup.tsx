"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/useAuth";
import type { ChannelSalesTarget, KpiScoringConfig, ScoreBracket } from "@/lib/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Starting points table for a new channel, scaled to the Sales points pool.
// Brackets score "% of target achieved"; the admin edits them per channel.
function defaultBrackets(weight: number): ScoreBracket[] {
  return [
    { min: 0, max: 79.9, points: 0 },
    { min: 80, max: 89.9, points: Math.round(weight * 0.4) },
    { min: 90, max: 99.9, points: Math.round(weight * 0.7) },
    { min: 100, max: 10000, points: weight },
  ];
}

function rand(v: number): string {
  return "R " + v.toLocaleString("en-ZA", { maximumFractionDigits: 0 });
}

function BracketEditor({ brackets, onChange }: { brackets: ScoreBracket[]; onChange: (b: ScoreBracket[]) => void }) {
  const set = (i: number, field: keyof ScoreBracket, v: number) =>
    onChange(brackets.map((b, j) => (j === i ? { ...b, [field]: v } : b)));
  const add = () => {
    const last = brackets[brackets.length - 1];
    onChange([...brackets, last ? { min: last.max, max: last.max + 10, points: last.points } : { min: 0, max: 100, points: 0 }]);
  };
  return (
    <div>
      <div className="space-y-1.5">
        {brackets.map((b, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <input type="number" value={b.min} onChange={(e) => set(i, "min", Number(e.target.value))} aria-label="From % of target"
              className="w-16 px-1.5 py-1 rounded border border-[var(--color-border)] bg-white text-right" />
            <span className="text-[var(--color-text-muted)]">to</span>
            <input type="number" value={b.max} onChange={(e) => set(i, "max", Number(e.target.value))} aria-label="To % of target"
              className="w-16 px-1.5 py-1 rounded border border-[var(--color-border)] bg-white text-right" />
            <span className="text-[var(--color-text-muted)]">% of target →</span>
            <input type="number" value={b.points} onChange={(e) => set(i, "points", Number(e.target.value))} aria-label="Points"
              className="w-16 px-1.5 py-1 rounded border border-[var(--color-border)] bg-white text-right" />
            <span className="text-[var(--color-text-muted)]">pts</span>
            <button type="button" onClick={() => onChange(brackets.filter((_, j) => j !== i))} aria-label="Remove bracket"
              className="ml-auto px-1.5 py-1 rounded text-[var(--color-text-muted)] hover:bg-red-50 hover:text-red-600">✕</button>
          </div>
        ))}
      </div>
      <button type="button" onClick={add}
        className="mt-2 px-2.5 py-1 rounded-md border border-[var(--color-border)] bg-white text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)]">
        + Add bracket
      </button>
    </div>
  );
}

/**
 * Sales "Set Rand Value Target" setup: pick a channel, enter a Rand target per
 * month for a year, set its points table, then move to the next channel. Done
 * channels stay on screen to view/edit; the picker only offers channels without
 * a target yet. Saved with the rest of the KPI settings (Control Centre Save).
 */
export default function SalesTargetSetup({
  cfg,
  weight,
  onChange,
}: {
  cfg: KpiScoringConfig;
  weight: number;
  onChange: (next: Partial<KpiScoringConfig>) => void;
}) {
  const [channels, setChannels] = useState<string[]>([]);
  const thisYear = new Date().getFullYear();
  const [yearOf, setYearOf] = useState<Record<string, string>>({});

  useEffect(() => {
    authFetch("/api/data/channels")
      .then((r) => r.json())
      .then((d) => setChannels(Array.isArray(d.channels) ? d.channels.map((c: { name: string }) => c.name).sort() : []))
      .catch(() => {});
  }, []);

  const targets = cfg.salesTargets ?? [];
  const remaining = channels.filter((c) => !targets.some((t) => t.channel === c));
  const cascade = cfg.targetCascade ?? "growth";

  const setTargets = (next: ChannelSalesTarget[]) => onChange({ salesTargets: next });
  const update = (channel: string, patch: Partial<ChannelSalesTarget>) =>
    setTargets(targets.map((t) => (t.channel === channel ? { ...t, ...patch } : t)));

  const addChannel = (channel: string) => {
    if (!channel) return;
    setTargets([...targets, { channel, targets: { [String(thisYear)]: Array(12).fill(0) }, brackets: defaultBrackets(weight) }]);
  };

  const setMonth = (t: ChannelSalesTarget, year: string, idx: number, value: number) => {
    const months = [...(t.targets[year] ?? Array(12).fill(0))];
    months[idx] = Math.max(0, value || 0);
    update(t.channel, { targets: { ...t.targets, [year]: months } });
  };

  return (
    <div className="mb-3 space-y-4">
      <div className="rounded-md border border-[var(--color-border)] bg-white p-3">
        <div className="text-xs font-semibold text-[var(--color-text)] mb-1">Store &amp; SKU scorecards score Sales on</div>
        <div className="flex flex-wrap gap-4 text-xs">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={cascade === "growth"} onChange={() => onChange({ targetCascade: "growth" })} />
            Growth (YTD vs YTD, points below)
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={cascade === "target"}
              onChange={() => onChange({ targetCascade: "target", skuTargetBrackets: cfg.skuTargetBrackets ?? defaultBrackets(weight) })} />
            Their share of the channel targets
          </label>
        </div>
        {cascade === "target" && (
          <div className="mt-3">
            <p className="text-[11px] text-[var(--color-text-muted)] mb-2">
              Each store gets its channel&apos;s target × its share of the channel&apos;s YTD sales, and is scored on its
              channel&apos;s points. Each SKU gets the total of all channel targets × its share of all YTD sales, scored on
              the points below. SKUs stay on growth until every channel selling that month has a target.
            </p>
            <div className="text-xs font-semibold text-[var(--color-text)] mb-1">SKU points</div>
            <BracketEditor brackets={cfg.skuTargetBrackets ?? []} onChange={(b) => onChange({ skuTargetBrackets: b })} />
          </div>
        )}
      </div>

      {targets.map((t) => {
        const year = yearOf[t.channel] ?? (t.targets[String(thisYear)] ? String(thisYear) : Object.keys(t.targets).sort().pop() ?? String(thisYear));
        const months = t.targets[year] ?? Array(12).fill(0);
        const years = Array.from(new Set([thisYear - 1, thisYear, thisYear + 1].map(String).concat(Object.keys(t.targets)))).sort();
        return (
          <div key={t.channel} className="rounded-md border border-[var(--color-border)] bg-white p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-[var(--color-dark)]">{t.channel}</span>
              <select value={year} onChange={(e) => setYearOf({ ...yearOf, [t.channel]: e.target.value })} aria-label="Year"
                className="px-2 py-1 rounded-md border border-[var(--color-border)] text-xs bg-white">
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="text-[11px] text-[var(--color-text-muted)]">Year total {rand(months.reduce((a, v) => a + v, 0))}</span>
              <button type="button" onClick={() => setTargets(targets.filter((x) => x.channel !== t.channel))}
                className="ml-auto px-2 py-1 rounded text-xs text-[var(--color-text-muted)] hover:bg-red-50 hover:text-red-600">
                Remove channel
              </button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-3">
              {MONTHS.map((label, i) => (
                <label key={label} className="text-[11px] text-[var(--color-text-muted)]">
                  {label} (R)
                  <input type="number" min={0} step={1000} value={months[i] || ""} placeholder="0"
                    onChange={(e) => setMonth(t, year, i, Number(e.target.value))}
                    className="mt-0.5 w-full px-1.5 py-1 rounded border border-[var(--color-border)] bg-white text-right text-xs text-[var(--color-text)]" />
                </label>
              ))}
            </div>
            <div className="text-xs font-semibold text-[var(--color-text)] mb-1">Points ({weight} pts pool)</div>
            <BracketEditor brackets={t.brackets} onChange={(b) => update(t.channel, { brackets: b })} />
          </div>
        );
      })}

      {remaining.length > 0 ? (
        <div>
          <label className="block text-[11px] text-[var(--color-text-muted)] mb-1">
            {targets.length ? "Next channel" : "Channel"}
          </label>
          <select value="" onChange={(e) => addChannel(e.target.value)}
            className="w-full px-2 py-1.5 rounded-md border border-[var(--color-border)] text-xs bg-white">
            <option value="">Select a channel to set its target…</option>
            {remaining.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      ) : (
        channels.length > 0 && <p className="text-xs text-green-700">Every channel has a target. Remember to Save.</p>
      )}
      <p className="text-[11px] text-[var(--color-text-muted)]">
        Channels without a target for the month show &quot;—&quot; for Sales. The current month&apos;s target is pro-rated to the days so far.
      </p>
    </div>
  );
}
