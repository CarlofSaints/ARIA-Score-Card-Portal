"use client";

import { useMemo, useState } from "react";
import { useColumnWidths, Th } from "@/components/resizableColumns";

// Grain picker for the store×SKU detail pages (OOS, Phantom). "detail" = the
// page's own row grid; the rest roll the rows up and count them.
export type RollLevel = "channel" | "store" | "product" | "detail";

export interface RollRow {
  siteCode: string;
  storeName: string;
  channelName: string;
  subChannel: string;
  productId: string;
  productName: string;
  brand: string;
  soh?: number; // Phantom only: summed per group
  barcode?: string;
}

interface Agg {
  key: string;
  channelName: string;
  storeName: string;
  siteCode: string;
  subChannel: string;
  productName: string;
  brand: string;
  items: number;
  stores: number;
  products: number;
  soh: number;
  barcode?: string; // product level
}

type ColKey = "channelName" | "storeName" | "subChannel" | "productName" | "barcode" | "brand" | "items" | "soh" | "stores" | "products";

const NAME_COLS: Record<Exclude<RollLevel, "detail">, ColKey[]> = {
  channel: ["channelName", "items", "stores", "products"],
  store: ["storeName", "channelName", "subChannel", "items", "products"],
  product: ["productName", "barcode", "brand", "items", "stores"],
};
const WIDTH: Record<ColKey, number> = {
  channelName: 160, storeName: 260, subChannel: 140, productName: 320, barcode: 150, brand: 160, items: 110, soh: 110, stores: 130, products: 140,
};
const NUM = new Set<ColKey>(["items", "soh", "stores", "products"]);

export function rollUp(rows: RollRow[], level: Exclude<RollLevel, "detail">): Agg[] {
  const groups = new Map<string, { agg: Agg; stores: Set<string>; products: Set<string> }>();
  for (const r of rows) {
    const key = level === "channel" ? r.channelName : level === "store" ? r.siteCode : r.productId;
    let g = groups.get(key);
    if (!g) {
      g = {
        agg: {
          key, channelName: r.channelName, storeName: r.storeName, siteCode: r.siteCode,
          subChannel: r.subChannel, productName: r.productName, brand: r.brand, barcode: r.barcode, items: 0, stores: 0, products: 0, soh: 0,
        },
        stores: new Set(),
        products: new Set(),
      };
      groups.set(key, g);
    }
    g.agg.items++;
    g.agg.soh += r.soh ?? 0;
    g.stores.add(r.siteCode);
    g.products.add(r.productId);
  }
  return [...groups.values()].map((g) => ({ ...g.agg, stores: g.stores.size, products: g.products.size }));
}

export function LevelSelect({ value, onChange, detail = true }: { value: RollLevel; onChange: (l: RollLevel) => void; detail?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as RollLevel)} className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm bg-white">
      <option value="channel">Channel</option>
      <option value="store">Store</option>
      <option value="product">Product</option>
      {detail && <option value="detail">Detail (store × SKU)</option>}
    </select>
  );
}

export default function RollUpTable({ rows, level, itemLabel, showSoh = false }: { rows: RollRow[]; level: Exclude<RollLevel, "detail">; itemLabel: string; showSoh?: boolean }) {
  const [sortKey, setSortKey] = useState<ColKey>("items");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const { widths, startResize, totalWidth } = useColumnWidths(WIDTH);
  const cols = useMemo(() => {
    const c = NAME_COLS[level];
    return showSoh ? [...c.slice(0, c.indexOf("items") + 1), "soh" as ColKey, ...c.slice(c.indexOf("items") + 1)] : c;
  }, [level, showSoh]);
  // A sort column hidden by the current grain falls back to the item count.
  const activeSort: ColKey = cols.includes(sortKey) ? sortKey : "items";

  const groups = useMemo(() => rollUp(rows, level), [rows, level]);
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...groups].sort((a, b) => {
      const av = a[activeSort];
      const bv = b[activeSort];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
  }, [groups, activeSort, sortDir]);

  const label = (c: ColKey) =>
    ({ channelName: "Channel", storeName: "Store", subChannel: "Sub-Channel", productName: "Product", barcode: "Barcode", brand: "Brand", items: itemLabel, soh: "SOH", stores: "Stores affected", products: "Products affected" })[c];

  function toggleSort(key: string) {
    const k = key as ColKey;
    if (activeSort === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(NUM.has(k) ? "desc" : "asc"); }
  }

  return (
    <div className="bg-white rounded-xl border border-[var(--color-border)] overflow-hidden">
      <div className="overflow-x-auto max-h-[70vh]">
        <table className="text-sm" style={{ tableLayout: "fixed", width: totalWidth(cols), minWidth: "100%" }}>
          <colgroup>
            {cols.map((c) => <col key={c} style={{ width: widths[c] }} />)}
          </colgroup>
          <thead className="sticky top-0 bg-[var(--color-bg)] z-10">
            <tr className="text-left text-[var(--color-text-muted)]">
              {cols.map((c) => (
                <Th key={c} label={label(c)} colKey={c} align={NUM.has(c) ? "right" : undefined}
                  sortKey={activeSort} sortDir={sortDir} onSort={toggleSort} onResize={startResize(c)} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.key} className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                {cols.map((c, i) => (
                  <td key={c} className={`px-3 py-2 text-[var(--color-text)] ${NUM.has(c) ? "text-right" : "truncate"}${i === 0 ? " font-medium" : ""}`}>
                    {NUM.has(c) ? (r[c] as number).toLocaleString("en-ZA") : (r[c] as string) || (c === "storeName" ? r.siteCode : "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-2 text-xs text-[var(--color-text-muted)] border-t border-[var(--color-border)]">
        Showing {sorted.length.toLocaleString()} rows
      </div>
    </div>
  );
}
