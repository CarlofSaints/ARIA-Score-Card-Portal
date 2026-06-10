"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/lib/useAuth";
import { MODULE_DEFS } from "@/lib/modules";
import type { ModuleKey } from "@/lib/types";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string;
  route: string;
  icon: () => React.JSX.Element;
  moduleKey?: ModuleKey;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", route: "/", icon: DashboardIcon },
  ...MODULE_DEFS.map((m) => ({
    label: m.label,
    route: m.route,
    icon: getModuleIcon(m.key),
    moduleKey: m.key as ModuleKey,
  })),
  { label: "Phantom Stock", route: "/phantom-store", icon: PhantomIcon },
  { label: "Ranging", route: "/ranging", icon: RangingIcon, adminOnly: true },
  { label: "Control Centre", route: "/control-centre", icon: SettingsIcon, adminOnly: true },
  { label: "CAM Mapping", route: "/cam-mapping", icon: MappingIcon, adminOnly: true },
  { label: "Admin", route: "/admin", icon: AdminIcon, adminOnly: true },
];

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const tenant = useTenant();
  const { user, logout, hasRole } = useAuth();

  const enabledModules = tenant.enabledModules;

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-[var(--color-border)] flex flex-col transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo / Branding */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--color-border)]">
          <Image
            src={tenant.logoUrl || "/aria-logo.png"}
            alt={tenant.name}
            width={36}
            height={36}
            className="rounded"
          />
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-[var(--color-dark)] truncate">
              {tenant.name}
            </h1>
            <p className="text-xs text-[var(--color-text-muted)]">Score Card</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          {NAV_ITEMS.map((item) => {
            // Admin-only items
            if (item.adminOnly && !hasRole("admin")) return null;

            const isModule = "moduleKey" in item;
            const isEnabled =
              !isModule || enabledModules.includes(item.moduleKey as ModuleKey);
            const isActive = pathname === item.route;

            return (
              <Link
                key={item.route}
                href={isEnabled ? item.route : "#"}
                onClick={(e) => {
                  if (!isEnabled) e.preventDefault();
                  onClose();
                }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm mb-0.5 transition-colors ${
                  isActive
                    ? "bg-[var(--color-primary)] text-white font-medium"
                    : isEnabled
                    ? "text-[var(--color-text)] hover:bg-[var(--color-bg)]"
                    : "text-[var(--color-text-muted)]/50 cursor-not-allowed"
                }`}
              >
                <span className={isEnabled ? "" : "opacity-40"}>
                  {item.icon()}
                </span>
                <span className={`flex-1 truncate ${!isEnabled ? "opacity-40" : ""}`}>
                  {item.label}
                </span>
                {isModule && !isEnabled && (
                  <LockIcon />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User / Footer */}
        <div className="border-t border-[var(--color-border)] px-4 py-3">
          {user && (
            <div className="mb-3">
              <p className="text-sm font-medium text-[var(--color-text)] truncate">
                {user.name}
              </p>
              <p className="text-xs text-[var(--color-text-muted)] truncate">
                {user.email}
              </p>
              <button
                onClick={logout}
                className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
              >
                <LogoutIcon />
                Sign out
              </button>
            </div>
          )}
          <p className="text-[10px] text-[var(--color-text-muted)] text-center">
            Powered by{" "}
            <span className="font-semibold" style={{ color: "#3D6273" }}>
              OuterJoin
            </span>
          </p>
        </div>
      </aside>
    </>
  );
}

// ── Icons ──

function DashboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function MappingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function RangingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="20" x2="4" y2="10" />
      <line x1="10" y1="20" x2="10" y2="4" />
      <line x1="16" y1="20" x2="16" y2="12" />
      <line x1="22" y1="20" x2="22" y2="7" />
    </svg>
  );
}

function PhantomIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2a7 7 0 017 7v11l-2.5-1.5L11 20l-2.5-1.5L6 20V9a3 3 0 016 0" />
      <line x1="9" y1="9" x2="9" y2="9.01" />
      <line x1="13" y1="9" x2="13" y2="9.01" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function getModuleIcon(key: ModuleKey) {
  switch (key) {
    case "cam_scorecard":
      return () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      );
    case "channel_scorecard":
      return () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case "store_scorecard":
      return () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      );
    case "product_scorecard":
      return () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      );
  }
}
