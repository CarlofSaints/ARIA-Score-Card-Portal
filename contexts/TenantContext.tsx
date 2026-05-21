"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { ModuleKey } from "@/lib/types";

interface TenantBrand {
  slug: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string;
  enabledModules: ModuleKey[];
}

const DEFAULT_BRAND: TenantBrand = {
  slug: "",
  name: "ARIA Score Card",
  primaryColor: "#3D6273",
  secondaryColor: "#5A8A9F",
  accentColor: "#E04E2A",
  logoUrl: "/aria-logo.png",
  enabledModules: [],
};

const TenantContext = createContext<TenantBrand>(DEFAULT_BRAND);

export function useTenant() {
  return useContext(TenantContext);
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<TenantBrand>(DEFAULT_BRAND);

  useEffect(() => {
    fetch("/api/tenant-config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setBrand({
            slug: data.slug || "",
            name: data.name || "ARIA Score Card",
            primaryColor: data.primaryColor || DEFAULT_BRAND.primaryColor,
            secondaryColor:
              data.secondaryColor || DEFAULT_BRAND.secondaryColor,
            accentColor: data.accentColor || DEFAULT_BRAND.accentColor,
            logoUrl: data.logoUrl || DEFAULT_BRAND.logoUrl,
            enabledModules: data.enabledModules || [],
          });
        }
      })
      .catch(() => {});
  }, []);

  // Apply CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--color-primary", brand.primaryColor);
    root.style.setProperty("--color-secondary", brand.secondaryColor);
    root.style.setProperty("--color-accent", brand.accentColor);
  }, [brand]);

  return (
    <TenantContext.Provider value={brand}>{children}</TenantContext.Provider>
  );
}
