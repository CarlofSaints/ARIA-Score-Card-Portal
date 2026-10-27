"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/useAuth";

const SA = ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape"];
const isSa = (c: string) => /^(south africa|rsa|za|sa)$/i.test(c.trim());

function TickList({ items, picked, onChange }: { items: string[]; picked: string[]; onChange: (p: string[]) => void }) {
  const toggle = (p: string) => onChange(picked.includes(p) ? picked.filter((x) => x !== p) : [...picked, p]);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1 mb-3 max-h-80 overflow-auto">
      {items.map((p) => (
        <label key={p} className="flex items-center gap-2 px-2 py-1 text-sm rounded hover:bg-[var(--color-bg)] cursor-pointer">
          <input type="checkbox" checked={picked.includes(p)} onChange={() => toggle(p)} />
          <span className="truncate">{p}</span>
        </label>
      ))}
    </div>
  );
}

const BTN = "px-3 py-1.5 rounded-md border border-[var(--color-border)] text-xs font-medium hover:bg-[var(--color-bg)]";

/**
 * Control Centre: which countries and provinces the Province and Store Score
 * Cards show (store master Country + Province). Nothing ticked in a list = all.
 */
export default function ProvinceSettings() {
  const [countries, setCountries] = useState<string[]>([]);
  const [pickedCountries, setPickedCountries] = useState<string[]>([]);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    authFetch("/api/tenant-config/provinces")
      .then((r) => r.json())
      .then((d) => {
        setProvinces(Array.isArray(d.all) ? d.all : []);
        setPicked(Array.isArray(d.included) ? d.included : []);
        setCountries(Array.isArray(d.countries) ? d.countries : []);
        setPickedCountries(Array.isArray(d.includedCountries) ? d.includedCountries : []);
      })
      .catch(() => setMessage("Could not load the lists"));
  }, []);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const res = await authFetch("/api/tenant-config/provinces", {
        method: "PUT",
        body: JSON.stringify({ included: picked, includedCountries: pickedCountries }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setPicked(d.included ?? []);
        setPickedCountries(d.includedCountries ?? []);
        setMessage("Saved");
      } else setMessage(d.error || "Failed to save");
    } catch {
      setMessage("Network error");
    } finally {
      setSaving(false);
    }
  }

  // Before the first sync that reads Country, every store is "Unknown".
  const noCountryYet = countries.length <= 1 && (countries[0] ?? "Unknown") === "Unknown";

  return (
    <section className="bg-white rounded-xl border border-[var(--color-border)] p-6 mb-6">
      <h2 className="text-lg font-semibold text-[var(--color-dark)] mb-2">Countries &amp; provinces shown</h2>
      <p className="text-sm text-[var(--color-text-muted)] mb-4">
        Stores outside the ticked countries and provinces are left out of the Province and Store Scorecards.
        Nothing ticked in a list = all shown.
      </p>

      <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">Countries</h3>
      {noCountryYet ? (
        <p className="text-xs text-[var(--color-text-muted)] mb-4">
          No country data yet. Run a sync with Master data ticked (Data Sync above), then reload this page.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            <button type="button" className={BTN} onClick={() => setPickedCountries(countries.filter(isSa))}>South Africa only</button>
            <button type="button" className={BTN} onClick={() => setPickedCountries([])}>Untick all</button>
          </div>
          <TickList items={countries} picked={pickedCountries} onChange={setPickedCountries} />
        </>
      )}

      <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2 mt-2">Provinces</h3>
      <div className="flex flex-wrap gap-2 mb-3">
        <button type="button" className={BTN} onClick={() => setPicked(SA.filter((p) => provinces.includes(p)))}>Tick the 9 SA provinces only</button>
        <button type="button" className={BTN} onClick={() => setPicked([])}>Untick all</button>
      </div>
      <TickList items={provinces} picked={picked} onChange={setPicked} />

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="px-6 py-2.5 rounded-lg bg-[var(--color-primary)] text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Saving..." : "Save"}
        </button>
        <span className="text-sm text-[var(--color-text-muted)]">
          {pickedCountries.length ? `${pickedCountries.length} countries` : "All countries"} · {picked.length ? `${picked.length} provinces` : "all provinces"}
        </span>
        {message && <span className={`text-sm ${message === "Saved" ? "text-green-600" : "text-red-600"}`}>{message}</span>}
      </div>
    </section>
  );
}
