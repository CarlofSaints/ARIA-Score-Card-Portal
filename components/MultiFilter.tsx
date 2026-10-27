"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tick-box dropdown filter. Nothing ticked = "All". Closes on an outside click
 * or Escape.
 */
export default function MultiFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: string; // plural, e.g. "provinces"
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o]);
  const text = value.length === 0 ? `All ${label}` : value.length === 1 ? value[0] : `${value.length} ${label}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm bg-white min-w-[150px] text-left"
      >
        {text} <span className="text-[var(--color-text-muted)]">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-64 max-h-72 overflow-auto rounded-lg border border-[var(--color-border)] bg-white shadow-lg p-2">
          <button type="button" onClick={() => onChange([])} className="w-full text-left text-xs px-2 py-1 rounded hover:bg-[var(--color-bg)] text-[var(--color-primary)]">
            Show all {label}
          </button>
          {options.map((o) => (
            <label key={o} className="flex items-center gap-2 px-2 py-1 text-sm rounded hover:bg-[var(--color-bg)] cursor-pointer">
              <input type="checkbox" checked={value.includes(o)} onChange={() => toggle(o)} />
              <span className="truncate">{o}</span>
            </label>
          ))}
          {options.length === 0 && <p className="px-2 py-1 text-xs text-[var(--color-text-muted)]">Nothing to pick yet</p>}
        </div>
      )}
    </div>
  );
}
