"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, authFetch } from "@/lib/useAuth";
import ModuleGate from "@/components/ModuleGate";
import PermissionGate from "@/components/PermissionGate";
import ScoreTable, { monthLabel } from "@/components/ScoreTable";
import MultiFilter from "@/components/MultiFilter";
import { useKamFilter } from "@/lib/useKamFilter";

function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Province scores are rolled up from the store data, so the page shares the
// Store Scorecard's module and permission. One filter bar drives both grids.
export default function ProvinceScorecardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [periods, setPeriods] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  const [month, setMonth] = useState("");
  const { kams, kamId, setKamId, selected: kam } = useKamFilter();
  const [allChannels, setAllChannels] = useState<string[]>([]);
  const [options, setOptions] = useState<{ provinces: string[]; subChannels: string[] }>({ provinces: [], subChannels: [] });
  const [channels, setChannels] = useState<string[]>([]);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [subChannels, setSubChannels] = useState<string[]>([]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    authFetch("/api/scores/periods")
      .then((r) => r.json())
      .then((d: { periods?: string[]; current?: string }) => {
        const cur = d.current || thisMonth();
        const list = d.periods?.length ? d.periods : [cur];
        setPeriods(list);
        setCurrent(cur);
        setMonth(cur);
      })
      // Month list unavailable: still show the current month.
      .catch(() => { setPeriods([thisMonth()]); setCurrent(thisMonth()); setMonth(thisMonth()); });
    authFetch("/api/data/channels")
      .then((r) => r.json())
      .then((d) => setAllChannels(Array.isArray(d.channels) ? d.channels.map((c: { name: string }) => c.name).sort() : []))
      .catch(() => {});
  }, [user]);

  // Only offer the selected KAM's channels (empty owned-list = all channels).
  const channelOptions = useMemo(
    () => (kam?.channels.length ? allChannels.filter((c) => kam.channels.includes(c)) : allChannels),
    [allChannels, kam]
  );

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (kamId !== "all") p.set("cam", kamId);
    channels.forEach((c) => p.append("ch", c));
    provinces.forEach((v) => p.append("prov", v));
    subChannels.forEach((v) => p.append("sub", v));
    const s = p.toString();
    return s ? `&${s}` : "";
  }, [kamId, channels, provinces, subChannels]);

  if (loading || !user) return null;

  const filtered = channels.length + provinces.length + subChannels.length > 0 || kamId !== "all";

  return (
    <PermissionGate permission="view_store_scorecard">
      <ModuleGate moduleKey="store_scorecard">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--color-dark)]">Province Scorecard</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Performance scores by province, and by channel within each province
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month"
            className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm bg-white">
            {periods.map((p) => (
              <option key={p} value={p}>{monthLabel(p)}{p === current ? " (current)" : ""}</option>
            ))}
          </select>
          <select value={kamId} onChange={(e) => { setKamId(e.target.value); setChannels([]); }} aria-label="KAM"
            className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm bg-white">
            <option value="all">All KAMs</option>
            {kams.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
          <MultiFilter label="channels" options={channelOptions} value={channels} onChange={setChannels} />
          <MultiFilter label="provinces" options={options.provinces} value={provinces} onChange={setProvinces} />
          <MultiFilter label="sub-channels" options={options.subChannels} value={subChannels} onChange={setSubChannels} />
          {filtered && (
            <button type="button" onClick={() => { setKamId("all"); setChannels([]); setProvinces([]); setSubChannels([]); }}
              className="text-sm text-[var(--color-primary)] hover:underline">
              Clear filters
            </button>
          )}
        </div>

        {month && (
          <>
            <h2 className="text-lg font-semibold text-[var(--color-dark)] mb-2">Provinces</h2>
            <ScoreTable type="province" title="Province" period={month} query={`&by=province${query}`}
              onData={(d) => d.options && setOptions(d.options)} />
            <h2 className="text-lg font-semibold text-[var(--color-dark)] mt-10 mb-2">Channel by province</h2>
            <ScoreTable type="province" title="Channel · Province" period={month} query={`&by=channel${query}`} />
          </>
        )}
      </ModuleGate>
    </PermissionGate>
  );
}
