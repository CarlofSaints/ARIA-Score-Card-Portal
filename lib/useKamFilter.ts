import { useCallback, useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/useAuth";

export interface Kam {
  id: string;
  name: string;
  channels: string[]; // channel NAMES the KAM owns
  brands: string[]; // brand NAMES the KAM owns
}

// Shared KAM filter for the data pages. Loads the KAM roster once and exposes a
// predicate: does a row in <channelName>/<brand> belong to the selected KAM?
// CamMapping stores channel/brand NAMES, so it's plain name-equality. A KAM owns
// its channels AND its brands, so a row must match both — but brand is only
// checked when the caller passes one (store/channel grain has no brand), and an
// empty owned-list means "no restriction on that dimension".
export function useKamFilter(initialKamId = "all") {
  const [kams, setKams] = useState<Kam[]>([]);
  const [kamId, setKamId] = useState(initialKamId);

  useEffect(() => {
    authFetch("/api/kams")
      .then((r) => r.json())
      .then((d) => setKams(Array.isArray(d.kams) ? d.kams : []))
      .catch(() => {});
  }, []);

  const selected = useMemo(() => kams.find((k) => k.id === kamId) || null, [kams, kamId]);

  const matches = useCallback(
    (channelName?: string, brand?: string) => {
      if (!selected) return true;
      if (channelName != null && selected.channels.length && !selected.channels.includes(channelName)) return false;
      if (brand != null && selected.brands.length && !selected.brands.includes(brand)) return false;
      return true;
    },
    [selected]
  );

  return { kams, kamId, setKamId, selected, matches };
}
