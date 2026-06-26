"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Per-column pixel widths with mouse-drag resizing. Pair with a <colgroup> that
 * renders one <col style={{ width: widths[key] }}> per column on a table set to
 * `table-layout: fixed`. `startResize(key)` returns a mousedown handler for a
 * drag handle placed on the right edge of that column's header cell.
 */
export function useColumnWidths(initial: Record<string, number>) {
  const [widths, setWidths] = useState<Record<string, number>>(initial);
  const drag = useRef<{ key: string; startX: number; startW: number } | null>(null);

  const onMove = useCallback((e: MouseEvent) => {
    const d = drag.current;
    if (!d) return;
    const w = Math.max(50, d.startW + (e.clientX - d.startX));
    setWidths((prev) => ({ ...prev, [d.key]: w }));
  }, []);

  const stop = useCallback(() => {
    drag.current = null;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", stop);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, [onMove]);

  const startResize = useCallback(
    (key: string) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      drag.current = {
        key,
        startX: e.clientX,
        startW: widths[key] ?? 120,
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", stop);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    },
    [widths, onMove, stop]
  );

  const totalWidth = (keys: string[]) =>
    keys.reduce((sum, k) => sum + (widths[k] ?? 120), 0);

  return { widths, startResize, totalWidth };
}

/**
 * Header cell with optional sort + a drag-to-resize handle on its right edge.
 * `colKey` identifies the column (used for the width and, when sortable, as the
 * sort key passed to onSort).
 */
export function Th({
  label,
  colKey,
  sortKey,
  sortDir,
  onSort,
  onResize,
  align = "left",
}: {
  label: string;
  colKey: string;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (k: string) => void;
  onResize?: (e: React.MouseEvent) => void;
  align?: "left" | "right" | "center";
}) {
  const sortable = !!onSort;
  const active = sortable && sortKey === colKey;
  return (
    <th
      onClick={sortable ? () => onSort!(colKey) : undefined}
      className={`relative px-3 py-2 font-semibold select-none whitespace-nowrap overflow-hidden ${
        sortable ? "cursor-pointer" : ""
      } ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"}`}
    >
      {label}
      {sortable && (
        <span className="ml-1 text-[10px]">{active ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
      )}
      {onResize && (
        <span
          onMouseDown={onResize}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-[var(--color-primary)]/40"
        />
      )}
    </th>
  );
}
