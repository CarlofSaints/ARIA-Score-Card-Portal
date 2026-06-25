import { TenantProvider } from "@/contexts/TenantContext";
import { PermissionsProvider } from "@/contexts/PermissionsContext";
import AppShell from "@/components/AppShell";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TenantProvider>
      <PermissionsProvider>
        <AppShell>{children}</AppShell>
      </PermissionsProvider>
    </TenantProvider>
  );
}
