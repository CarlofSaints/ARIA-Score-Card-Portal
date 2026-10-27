"use client";

export interface DrillChip {
  label: string;
  onClear: () => void;
}

/** Active drill-down filters (store, product, province, month…), each removable. */
export default function DrillChips({ chips }: { chips: DrillChip[] }) {
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <span className="text-xs text-[var(--color-text-muted)]">Showing only:</span>
      {chips.map((c) => (
        <span key={c.label} className="inline-flex items-center gap-1 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] pl-3 pr-1 py-0.5 text-xs text-[var(--color-text)]">
          {c.label}
          <button type="button" onClick={c.onClear} aria-label={`Remove ${c.label}`}
            className="w-5 h-5 rounded-full hover:bg-red-50 hover:text-red-600 text-[var(--color-text-muted)]">✕</button>
        </span>
      ))}
    </div>
  );
}

/** Leave a drilled-in month: reload the page on the current month, other filters dropped. */
export function clearPeriod() {
  window.location.href = window.location.pathname;
}
