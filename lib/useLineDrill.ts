import { useCallback, useState } from "react";
import { readDrillParams } from "./drill";
import { provinceName } from "./provinceScores";
import type { DrillChip } from "@/components/DrillChips";

const LEVELS = ["channel", "store", "product", "detail"] as const;
type Level = (typeof LEVELS)[number];

interface LineRow {
  siteCode: string;
  storeName: string;
  channelName: string;
  productId: string;
  productName: string;
  province?: string;
}

/**
 * Drill-down state for the store × SKU pages (OOS, Phantom): starts from the
 * link's params (scorecard click) and moves down when a roll-up row is
 * clicked (channel → its stores → a store's lines; product → its lines).
 */
export function useLineDrill() {
  const [drill] = useState(readDrillParams);
  const [level, setLevel] = useState<Level>(
    LEVELS.includes(drill.level as Level) ? (drill.level as Level) : "channel"
  );
  const [channel, setChannel] = useState(drill.channel ?? "all");
  const [store, setStore] = useState(drill.store ?? "");
  const [product, setProduct] = useState(drill.product ?? "");
  const [province, setProvince] = useState(drill.province ?? "");
  const [period, setPeriod] = useState(drill.period ?? ""); // "" = current month

  const keep = useCallback(
    (r: LineRow) =>
      (!store || r.siteCode === store) &&
      (!product || r.productId === product) &&
      (!province || provinceName(r.province) === province),
    [store, product, province]
  );

  // One level down from a clicked roll-up row.
  const onDrill = (row: { key: string; channelName: string; siteCode: string }) => {
    if (level === "channel") { setChannel(row.channelName); setLevel("store"); }
    else if (level === "store") { setStore(row.siteCode); setLevel("detail"); }
    else if (level === "product") { setProduct(row.key); setLevel("detail"); }
  };

  const chips = (rows: LineRow[]): DrillChip[] => {
    const out: DrillChip[] = [];
    if (store) {
      const name = rows.find((r) => r.siteCode === store)?.storeName || store;
      out.push({ label: `Store: ${name}`, onClear: () => setStore("") });
    }
    if (product) {
      const name = rows.find((r) => r.productId === product)?.productName || product;
      out.push({ label: `Product: ${name}`, onClear: () => setProduct("") });
    }
    if (province) out.push({ label: `Province: ${province}`, onClear: () => setProvince("") });
    return out;
  };

  const periodQuery = period ? `?period=${encodeURIComponent(period)}` : "";

  return { drill, level, setLevel, channel, setChannel, keep, onDrill, chips, period, setPeriod, periodQuery };
}
