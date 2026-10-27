"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/useAuth";

const SA = ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape"];

/**
 * Control Centre: which provinces the Province Score Card shows. The store
 * master has no country, so the admin ticks the ones to keep (nothing ticked =
 * all shown).
 */
export default function ProvinceSettings() {
  const [all, setAll] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    authFetch("/api/tenant-config/provinces")
      .then((r) => r.json())
      .then((d) => {
        setAll(Array.isArray(d.all) ? d.all : []);
        setPicked(Array.isArray(d.included) ? d.included : []);
      })
      .catch(() => setMessage("Could not load the province list"));
  }, []);

  const toggle = (p: string) => setPicked((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const res = await authFetch("/api/tenant-config/provinces", { method: "PUT", body: JSON.stringify({ included: picked }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setPicked(d.included ?? []);
        setMessage("Saved");
      } else setMessage(d.error || "Failed to save");
    } catch {
      setMessage("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-white rounded-xl border border-[var(--color-border)] p-6 mb-6">
      <h2 className="text-lg font-semibold text-[var(--color-dark)] mb-2">Province Score Card: provinces shown</h2>
      <p className="text-sm text-[var(--color-text-muted)] mb-4">
        Tick the provinces to show. Stores in unticked ones are left out of the Province Score Card. Nothing ticked = all shown.
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        <button type="button" onClick={() => setPicked(SA.filter((p) => all.includes(p)))}
          className="px-3 py-1.5 rounded-md border border-[var(--color-border)] text-xs font-medium hover:bg-[var(--color-bg)]">
          Tick the 9 SA provinces only
        </button>
        <button type="button" onClick={() => setPicked([])}
          className="px-3 py-1.5 rounded-md border border-[var(--color-border)] text-xs font-medium hover:bg-[var(--color-bg)]">
          Untick all
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1 mb-4 max-h-80 overflow-auto">
        {all.map((p) => (
          <label key={p} className="flex items-center gap-2 px-2 py-1 text-sm rounded hover:bg-[var(--color-bg)] cursor-pointer">
            <input type="checkbox" checked={picked.includes(p)} onChange={() => toggle(p)} />
            <span className="truncate">{p}</span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="px-6 py-2.5 rounded-lg bg-[var(--color-primary)] text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Saving..." : "Save"}
        </button>
        <span className="text-sm text-[var(--color-text-muted)]">{picked.length ? `${picked.length} ticked` : "All shown"}</span>
        {message && <span className={`text-sm ${message === "Saved" ? "text-green-600" : "text-red-600"}`}>{message}</span>}
      </div>
    </section>
  );
}
