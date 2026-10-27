import { useEffect, useState } from "react";
import { authFetch } from "@/lib/useAuth";

// SKU -> barcode map for the SKU pages (empty until a sync has collected them).
export function useBarcodes(enabled = true): Record<string, string> {
  const [barcodes, setBarcodes] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!enabled) return;
    authFetch("/api/data/barcodes")
      .then((r) => r.json())
      .then((d) => setBarcodes(d.barcodes && typeof d.barcodes === "object" ? d.barcodes : {}))
      .catch(() => {});
  }, [enabled]);
  return barcodes;
}
